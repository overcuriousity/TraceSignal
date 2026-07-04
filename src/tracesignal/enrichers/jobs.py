"""Background enrichment job: read events, run an enricher, stage + apply results.

Processing is crash-safe at the result level (not the cursor level): results
are staged in Postgres as each batch completes (transactional, so they
survive a process crash even though the in-memory JobStore does not), then
applied to ClickHouse **once, at job end**, by merging them into
``events.attributes`` via an atomic per-source partition rewrite
(``ClickHouseStore.apply_enrichments``). There is no periodic flush — a
partition rewrite is too expensive to repeat mid-run, and staging volume is
modest (1M events x 2 IP attributes x 3 output fields = 6M small Postgres
rows; a row-per-event JSON-map optimization is a deliberate follow-up, not
done here to keep staging simple).

If the process dies mid-run, the durable ``EnrichmentJobRun`` marker lets
startup reconciliation apply whatever was staged and schedule a fresh re-run
over the timeline (see ``reconcile_orphaned_enrichment_jobs``) — there is no
resume-from-cursor support by design, since that would require tracking
per-source read offsets durably. Re-applying and re-running are both safe
because ``mapUpdate`` overwrites the same derived keys with recomputed
values (idempotent), not because of any read-time dedup.

Provenance: which enricher config/data version produced a source's derived
fields is recorded per source in Postgres (``SourceEnrichment``) at apply
time, replacing the per-row hash column of the former side-table design.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from typing import Any

from tracesignal.core.config import get_settings
from tracesignal.core.jobs import JobStore
from tracesignal.db.clickhouse import ClickHouseStore
from tracesignal.db.postgres import EnrichmentJobRun, PostgresStore
from tracesignal.enrichers.base import Enricher
from tracesignal.enrichers.registry import get_cached_availability, get_enricher

logger = logging.getLogger(__name__)

# One enrichment run per (timeline_id, enricher_key) at a time. Claim/release
# only happen on the event-loop thread with no await between check and set,
# so a plain dict is race-free without a lock — document-by-invariant, the
# same reasoning core/jobs.py::JobStore relies on. Purely in-memory: a crash
# self-heals on restart (startup reconciliation re-schedules what was lost).
_ACTIVE_RUNS: dict[tuple[str, str], str] = {}

# Strong references to fire-and-forget enrichment tasks so asyncio doesn't
# garbage-collect them mid-run (asyncio only holds a weak reference once
# scheduled). Shared by the auto-trigger (api/routers/cases.py) and startup
# re-run scheduling below.
background_enrichment_tasks: set[asyncio.Task] = set()

# Serializes partition rewrites per (case_id, source_id). Mandatory, not an
# optimization: two enrichers applying to the same source concurrently would
# each build their copy from the pre-apply partition and the second REPLACE
# would silently discard the first's keys. (The _ACTIVE_RUNS guard is per
# (timeline, enricher) and does not cover this.) Locks are created lazily on
# the event-loop thread; entries are never removed — bounded by the number of
# sources touched since startup.
_APPLY_LOCKS: dict[tuple[str, str], asyncio.Lock] = {}


def _apply_lock(case_id: str, source_id: str) -> asyncio.Lock:
    return _APPLY_LOCKS.setdefault((case_id, source_id), asyncio.Lock())


def get_active_enricher_run(timeline_id: str, enricher_key: str) -> str | None:
    """Return the job_id currently holding the run slot, or None if free."""
    return _ACTIVE_RUNS.get((timeline_id, enricher_key))


def try_claim_enricher_run(timeline_id: str, enricher_key: str, job_id: str) -> str | None:
    """Claim the run slot for a job; returns the conflicting job_id if taken, else None."""
    existing = _ACTIVE_RUNS.get((timeline_id, enricher_key))
    if existing is not None:
        return existing
    _ACTIVE_RUNS[(timeline_id, enricher_key)] = job_id
    return None


def _release_enricher_run(timeline_id: str, enricher_key: str, job_id: str) -> None:
    """Release the run slot, but only if this job still owns it."""
    if _ACTIVE_RUNS.get((timeline_id, enricher_key)) == job_id:
        del _ACTIVE_RUNS[(timeline_id, enricher_key)]


def _process_batch(
    enricher: Enricher,
    batch: list[dict[str, Any]],
    case_id: str,
    source_id: str,
    timeline_id: str,
    job_id: str,
    enricher_key: str,
    enricher_config_hash: str,
) -> list[dict[str, Any]]:
    """Regex-match attributes in a batch of events and run the enricher on matches.

    Synchronous — run inside ``asyncio.to_thread`` by the caller, since it
    calls the (blocking) enricher and iterates in-memory event dicts. Any
    enricher failure propagates (with event context attached) and fails the
    whole job: partially-silently-enriched results are worse than a failed
    job in a forensic tool.
    """
    now = datetime.now(UTC)
    rows: list[dict[str, Any]] = []
    for event in batch:
        event_id = str(event["event_id"])
        attributes = event.get("attributes") or {}
        for attr_key, raw_value in attributes.items():
            if not raw_value or not enricher.is_field_eligible(raw_value):
                continue
            try:
                enriched = enricher.enrich_value(raw_value)
            except Exception as exc:
                # No raw value in the note — attribute values may be sensitive;
                # event_id + attr_key is enough to reproduce.
                exc.add_note(f"enricher={enricher_key} event_id={event_id} attr_key={attr_key}")
                raise
            if not enriched:
                continue
            for output_field, value in enriched.items():
                if not value:
                    continue
                rows.append(
                    {
                        "job_id": job_id,
                        "case_id": case_id,
                        "source_id": source_id,
                        "timeline_id": timeline_id,
                        "event_id": event_id,
                        "enricher_key": enricher_key,
                        # Derived-field naming contract: "<attr_key>:<output_field>"
                        # (e.g. "src_ip:geo_country"), so derived columns sort
                        # beside their source attribute. Mirrored in
                        # frontend/src/lib/countryFlag.ts.
                        "field_key": f"{attr_key}:{output_field}",
                        "value": value,
                        "computed_at": now,
                        "enricher_config_hash": enricher_config_hash,
                    }
                )
    return rows


async def _apply_staged_rows(store: PostgresStore, ch_store: ClickHouseStore, job_id: str) -> int:
    """Apply a job's staged rows to ``events.attributes``, one source at a time.

    Per staged source: serialize on the per-(case, source) apply lock, verify
    the source still exists (a source deleted mid-job must not be resurrected
    by our partition REPLACE; a millisecond residual window between check and
    swap remains — acceptable pre-release), stream the staged triples into
    ``ClickHouseStore.apply_enrichments`` (atomic partition rewrite), and
    only then delete the staged rows and upsert the ``SourceEnrichment``
    provenance row. A failure leaves that source's staged rows intact for the
    next attempt; the rewrite is idempotent, so a crash between REPLACE and
    the staged-row delete just re-applies identical values.

    No concurrent ingest can append to the partition mid-apply: enrichers
    only run on ``is_ready`` sources, and sources are ingest-once.

    Timeline/enricher/config-hash metadata is read off the staged rows
    themselves (uniform per job), so this works identically for a live job
    and for startup reconciliation of an orphaned one.

    Returns the number of enrichment pairs applied across all sources.
    """
    applied_total = 0
    for case_id, source_id in await store.list_staged_sources(job_id):
        async with _apply_lock(case_id, source_id):
            if await store.get_source(case_id, source_id) is None:
                logger.warning(
                    "Skipping enrichment apply for source %s (job %s): source was deleted",
                    source_id,
                    job_id,
                )
                await store.delete_staged_rows_for_source(job_id, source_id)
                continue

            # apply_enrichments is sync (blocking client); collect the chunks
            # first (bounded by staging volume per source), then hand the
            # whole apply to a worker thread.
            chunks: list[list[tuple[str, str, str]]] = []
            timeline_id = enricher_key = config_hash = ""
            after_id = 0
            while True:
                staged = await store.list_staged_rows_for_source(
                    job_id, source_id, limit=10000, after_id=after_id
                )
                if not staged:
                    break
                if not chunks:
                    timeline_id = staged[0].timeline_id
                    enricher_key = staged[0].enricher_key
                    config_hash = staged[0].enricher_config_hash
                after_id = staged[-1].id
                chunks.append([(row.event_id, row.field_key, row.value) for row in staged])
            if not chunks:
                continue

            applied = await asyncio.to_thread(
                ch_store.apply_enrichments, case_id, source_id, job_id, chunks
            )
            await store.record_source_enrichment(
                case_id=case_id,
                source_id=source_id,
                timeline_id=timeline_id,
                enricher_key=enricher_key,
                enricher_config_hash=config_hash,
                job_id=job_id,
                rows_applied=applied,
            )
            await store.delete_staged_rows_for_source(job_id, source_id)
            await store.record_audit(
                action="enricher.applied",
                case_id=case_id,
                target_type="source",
                target_id=source_id,
                detail={
                    "job_id": job_id,
                    "enricher_key": enricher_key,
                    "enricher_config_hash": config_hash,
                    "rows_applied": applied,
                },
            )
            applied_total += applied
    return applied_total


async def run_enrichment_job(
    job_id: str,
    case_id: str,
    timeline_id: str,
    enricher_key: str,
    source_ids: list[str],
    job_store: JobStore,
    store: PostgresStore,
    ch_store: ClickHouseStore,
) -> None:
    """Run one enricher over a set of sources, staging results and applying once at the end.

    Works on a fresh per-run enricher instance (``Enricher.spawn()``) so
    concurrent runs never share mutable state such as an open database
    reader. Batches are paginated via the same ``list_events`` primitive the
    embedding pipeline uses, at ``settings.embedding_batch_size``. All
    results are staged in Postgres and merged into ``events.attributes`` in
    one atomic per-source partition rewrite at job end
    (``_apply_staged_rows``).
    """
    prototype = get_enricher(enricher_key)
    if prototype is None:
        job_store.update(job_id, status="failed", error=f"Unknown enricher: {enricher_key}")
        _release_enricher_run(timeline_id, enricher_key, job_id)
        return
    enricher = prototype.spawn()

    settings = get_settings()
    batch_size = settings.embedding_batch_size

    await store.start_enrichment_job_run(job_id, timeline_id, case_id, enricher_key)
    job_store.update(job_id, status="running", progress={"processed": 0, "total": 0})

    try:
        # Worker thread: the GeoIP fallback path may hash a multi-GB-adjacent
        # database file when no metadata sidecar exists yet.
        config_hash = await asyncio.to_thread(enricher.config_hash)

        total = 0
        for source_id in source_ids:
            total += await asyncio.to_thread(
                ch_store.count_events, case_id=case_id, source_id=source_id
            )
        job_store.update(job_id, progress={"processed": 0, "total": total})

        processed = 0
        for source_id in source_ids:
            offset = 0
            while True:
                batch = await asyncio.to_thread(
                    ch_store.list_events,
                    case_id=case_id,
                    source_id=source_id,
                    limit=batch_size,
                    offset=offset,
                )
                if not batch:
                    break
                rows = await asyncio.to_thread(
                    _process_batch,
                    enricher,
                    batch,
                    case_id,
                    source_id,
                    timeline_id,
                    job_id,
                    enricher_key,
                    config_hash,
                )
                if rows:
                    await store.stage_enrichment_results(rows)

                processed += len(batch)
                offset += batch_size
                job_store.update(job_id, progress={"processed": processed, "total": total})

                if len(batch) < batch_size:
                    break

        applied = await _apply_staged_rows(store, ch_store, job_id)
        await store.finish_enrichment_job_run(job_id)
        job_store.update(
            job_id,
            status="completed",
            progress={"processed": processed, "total": total},
            result={
                "enricher_key": enricher_key,
                "events_processed": processed,
                "fields_applied": applied,
                "enricher_config_hash": config_hash,
            },
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Enrichment job %s failed", job_id)
        job_store.update(job_id, status="failed", error=str(exc))
        # The process is still alive, so clean up now instead of leaving the
        # marker for startup reconciliation: apply what was staged (those
        # results are valid — partial coverage, idempotent rewrite) and clear
        # the marker so a deterministic failure isn't auto re-run on every
        # restart. If the apply itself fails (e.g. ClickHouse down), the
        # marker stays and reconciliation gets it.
        try:
            await _apply_staged_rows(store, ch_store, job_id)
            await store.finish_enrichment_job_run(job_id)
        except Exception:  # noqa: BLE001
            logger.exception(
                "Post-failure cleanup for enrichment job %s failed; leaving marker for "
                "startup reconciliation",
                job_id,
            )
    finally:
        enricher.close()
        _release_enricher_run(timeline_id, enricher_key, job_id)


async def reconcile_orphaned_enrichment_jobs(
    store: PostgresStore, ch_store: ClickHouseStore
) -> list[EnrichmentJobRun]:
    """Recover enrichment jobs left running by a mid-run process restart.

    Mirrors the orphaned-ingest cleanup in ``api/main.py``: the in-memory
    JobStore is empty on a fresh boot, so any ``EnrichmentJobRun`` marker
    still present means the process died mid-run. Staged rows are valid,
    complete results — they are applied to ``events.attributes`` here rather
    than discarded, then the marker is cleared. Returns the recovered runs so
    the caller can schedule fresh re-runs (``schedule_enrichment_reruns``) to
    cover whatever the crashed run never processed; the run/re-run overlap is
    safe because ``mapUpdate`` overwrites the same derived keys with
    recomputed values.

    If applying fails (e.g. ClickHouse unreachable), the marker and staged
    rows are left intact for the next restart.
    """
    orphaned = await store.list_orphaned_enrichment_job_runs()
    recovered: list[EnrichmentJobRun] = []
    for run in orphaned:
        try:
            applied = await _apply_staged_rows(store, ch_store, run.job_id)
            await store.finish_enrichment_job_run(run.job_id)
        except Exception:  # noqa: BLE001
            logger.exception(
                "Could not recover orphaned enrichment job %s (enricher=%s, timeline=%s); "
                "leaving marker and staged rows for next restart",
                run.job_id,
                run.enricher_key,
                run.timeline_id,
            )
            continue
        await store.record_audit(
            action="enricher.job_recovered",
            case_id=run.case_id,
            target_type="timeline",
            target_id=run.timeline_id,
            detail={
                "job_id": run.job_id,
                "enricher_key": run.enricher_key,
                "fields_applied": applied,
            },
        )
        logger.warning(
            "Recovered orphaned enrichment job %s (enricher=%s, timeline=%s): "
            "applied %d staged enrichment fields, scheduling re-run",
            run.job_id,
            run.enricher_key,
            run.timeline_id,
            applied,
        )
        recovered.append(run)
    return recovered


async def schedule_enrichment_reruns(
    runs: list[EnrichmentJobRun],
    job_store: JobStore,
    store: PostgresStore,
) -> None:
    """Schedule fresh enrichment runs for jobs recovered at startup.

    Re-resolves each run's scope to the timeline's *current* ready sources —
    the crashed run's exact source scope isn't persisted, and the full
    timeline is a coverage-complete superset (safe: ``mapUpdate`` overwrites
    the same derived keys idempotently). Skips runs whose enricher is
    unavailable or whose timeline no longer exists; already-applied fields
    remain valid either way.
    """
    for run in runs:
        availability = get_cached_availability(run.enricher_key)
        if availability is None or not availability.available:
            logger.info(
                "Skipping enrichment re-run for timeline %s: enricher %s unavailable",
                run.timeline_id,
                run.enricher_key,
            )
            continue
        sources = await store.list_timeline_sources(run.case_id, run.timeline_id)
        source_ids = [s.id for s in sources if s.is_ready]
        if not source_ids:
            logger.info(
                "Skipping enrichment re-run for timeline %s: no ready sources",
                run.timeline_id,
            )
            continue
        job = job_store.create(kind="enrich", progress={"processed": 0, "total": 0})
        if try_claim_enricher_run(run.timeline_id, run.enricher_key, job.id) is not None:
            job_store.update(job.id, status="failed", error="Enrichment already running")
            continue
        task = asyncio.create_task(
            run_enrichment_job(
                job_id=job.id,
                case_id=run.case_id,
                timeline_id=run.timeline_id,
                enricher_key=run.enricher_key,
                source_ids=source_ids,
                job_store=job_store,
                store=store,
                ch_store=ClickHouseStore(),
            )
        )
        background_enrichment_tasks.add(task)
        task.add_done_callback(background_enrichment_tasks.discard)
