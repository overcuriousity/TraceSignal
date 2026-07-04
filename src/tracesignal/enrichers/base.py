"""Enricher base abstraction.

An Enricher reads existing event attribute values, derives new information
from ones matching its ``eligibility_regex``, and returns it as additional
fields. Results are staged in Postgres during a job run and merged into the
ClickHouse ``events.attributes`` map in one atomic per-source partition
rewrite at job end (see ``enrichers/jobs.py``). Derived keys follow the
``"<attr_key>:<output_field>"`` naming contract (e.g. ``src_ip:geo_country``).
The original evidence files stay hashed and immutable; ``events`` is a
normalized derivative and its provenance hash columns are never touched.
"""

from __future__ import annotations

import hashlib
import json
import re
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any

from tracesignal.db.clickhouse import ClickHouseStore

# Cap on how many attribute values (post ARRAY JOIN, so possibly several per
# event) are sampled when checking eligibility, to keep the check a bounded
# query rather than a full scan.
_ELIGIBILITY_SAMPLE_LIMIT = 5000


@dataclass(frozen=True, slots=True)
class AvailabilityResult:
    """Whether an enricher's runtime requirements (e.g. a database file) are met."""

    available: bool
    reason: str | None = None


@dataclass(frozen=True, slots=True)
class EligibilityResult:
    """Whether a timeline's sources have any field values this enricher can process."""

    eligible: bool
    sample_checked: int
    sample_matched: int


class Enricher(ABC):
    """Base class for a self-contained enrichment plugin."""

    key: str
    display_name: str
    description: str
    eligibility_regex: str
    output_fields: tuple[str, ...]

    def spawn(self) -> Enricher:
        """Return a fresh instance for a single job run.

        The registry holds one long-lived instance per enricher for metadata
        and availability checks only; every job run must work on its own
        instance (own file handles/resources) so concurrent runs of the same
        enricher can't race on shared mutable state. Subclasses whose
        ``__init__`` takes configuration must override this to carry it over.
        """
        return type(self)()

    def close(self) -> None:  # noqa: B027 — deliberate no-op default, not abstract
        """Release per-instance resources. No-op by default."""

    def config_extras(self) -> dict[str, Any]:
        """Enricher-specific inputs for ``config_hash()`` (e.g. data-file identity).

        Override in subclasses whose output depends on more than the static
        class attributes — the GeoIP enricher includes its database file's
        hash and build metadata here so results from different database
        versions are distinguishable.
        """
        return {}

    def config_hash(self) -> str:
        """Deterministic hash of everything that shapes this enricher's output.

        Mirrors ``models/event.py``'s ``ParserConfig.config_hash`` /
        ``EmbeddingConfig.config_hash``: canonical JSON, SHA-256. Stamped onto
        staged result rows and recorded per source in Postgres
        (``SourceEnrichment``) at apply time, so derived fields remain
        attributable to the exact enricher configuration and data version
        that produced them.
        """
        canonical = json.dumps(
            {
                "key": self.key,
                "eligibility_regex": self.eligibility_regex,
                "output_fields": list(self.output_fields),
                "extras": self.config_extras(),
            },
            sort_keys=True,
            ensure_ascii=False,
            separators=(",", ":"),
        )
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    @abstractmethod
    def check_availability(self) -> AvailabilityResult:
        """Check whether this enricher's runtime requirements are currently met."""

    def check_eligibility(
        self, ch_store: ClickHouseStore, case_id: str, source_ids: list[str]
    ) -> EligibilityResult:
        """Sample attribute values across the given sources and check for regex matches.

        Pushes the sampling and regex match into ClickHouse (``match()``) so
        no rows are paged into Python for this check, mirroring the
        aggregation-in-SQL approach used by ``db/anomaly_stats.py``.
        """
        if not source_ids:
            return EligibilityResult(eligible=False, sample_checked=0, sample_matched=0)
        result = ch_store.client.query(
            f"""
            SELECT
                count() AS checked,
                countIf(match(v, {{pattern:String}})) AS matched
            FROM (
                SELECT v
                FROM {ch_store.database}.events
                ARRAY JOIN mapValues(attributes) AS v
                WHERE case_id = {{case_id:String}} AND source_id IN {{source_ids:Array(String)}}
                LIMIT {_ELIGIBILITY_SAMPLE_LIMIT}
            )
            """,
            parameters={
                "pattern": self.eligibility_regex,
                "case_id": case_id,
                "source_ids": source_ids,
            },
        )
        checked, matched = result.result_rows[0] if result.result_rows else (0, 0)
        return EligibilityResult(
            eligible=matched > 0, sample_checked=int(checked), sample_matched=int(matched)
        )

    def is_field_eligible(self, value: str) -> bool:
        """Runtime per-value check used while processing a batch of events."""
        return bool(re.match(self.eligibility_regex, value))

    @abstractmethod
    def enrich_value(self, raw_value: str) -> dict[str, str] | None:
        """Compute output fields for a single matched attribute value.

        Returns a mapping of ``output_field -> value``, or ``None`` if this
        particular value could not be resolved (e.g. a private/reserved IP
        has no GeoIP result).
        """
