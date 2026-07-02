"""Shared time-bucketing helpers for histograms and frequency-anomaly windows.

`queries.py`'s events-view histogram and `anomaly_stats.py`'s frequency
detector (`get_timeline_midpoint` / `find_frequency_anomalies`) each derive a
bucket interval from a min/max timestamp range using the same query shape and
formula — previously duplicated three times, risking drift between the
histogram markers shown in the UI and the frequency-anomaly window markers
overlaid on top of them.

Note `anomaly_stats.py` intentionally scopes its range query to
`case_id`/`source_id` only, not the events-view's `q`/`artifact`/`tag`/
time-range filters (see its module docstring) — so this module shares the
query *shape* and interval *formula* only, not a fixed WHERE clause; each
caller still builds its own WHERE/parameters.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Protocol

from tracevector.db._dt import ensure_utc


class _ChClient(Protocol):
    def query(self, sql: str, parameters: dict[str, Any] | None = None) -> Any: ...


def query_timestamp_range(
    client: _ChClient, database: str, where: str, parameters: dict[str, Any]
) -> tuple[datetime | None, datetime | None]:
    """Return the (min, max) UTC timestamp for rows matching *where*.

    Returns ``(None, None)`` when there are no matching (non-NULL-timestamp)
    rows — callers are expected to short-circuit on that.
    """
    result = client.query(
        f"SELECT min(timestamp), max(timestamp) FROM {database}.events WHERE {where}",
        parameters=parameters,
    )
    row = result.result_rows[0] if result.result_rows else (None, None)
    min_ts, max_ts = row[0], row[1]
    if min_ts is None or max_ts is None:
        return None, None
    return ensure_utc(min_ts), ensure_utc(max_ts)


def bucket_interval_seconds(min_ts: datetime, max_ts: datetime, bucket_count: int) -> int:
    """Return the interval (seconds, floored at 1) spanning [min_ts, max_ts] in bucket_count buckets."""
    duration = (max_ts - min_ts).total_seconds()
    return max(1, int(duration / bucket_count))
