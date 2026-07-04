"""Tests for the enricher subsystem: registry, GeoIP plugin, and Postgres CRUD."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
import pytest_asyncio

from tracesignal.db.postgres import PostgresStore
from tracesignal.enrichers.base import AvailabilityResult
from tracesignal.enrichers.geoip import IPV4_REGEX, GeoIPEnricher


@pytest_asyncio.fixture()
async def store(tmp_path):
    db_path = tmp_path / "test_enrichers.db"
    url = f"sqlite+aiosqlite:///{db_path}"
    s = PostgresStore(url=url)
    await s.init_schema()
    yield s
    await s.engine.dispose()


# ---------------------------------------------------------------------------
# GeoIP enricher
# ---------------------------------------------------------------------------


def test_geoip_unavailable_when_database_missing(tmp_path):
    enricher = GeoIPEnricher(db_path=tmp_path / "missing.mmdb")
    result = enricher.check_availability()
    assert result == AvailabilityResult(False, "GeoLite2 database not uploaded")


def test_geoip_eligibility_regex_matches_ipv4():
    enricher = GeoIPEnricher(db_path=None)
    assert enricher.is_field_eligible("8.8.8.8")
    assert enricher.is_field_eligible("192.168.1.1")
    assert not enricher.is_field_eligible("not-an-ip")
    assert not enricher.is_field_eligible("999.999.999.999")


def test_ipv4_regex_rejects_hostnames_and_partial_matches():
    import re

    assert re.match(IPV4_REGEX, "10.0.0.1")
    assert not re.match(IPV4_REGEX, "example.com")
    assert not re.match(IPV4_REGEX, "10.0.0.1extra")


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------


def test_registry_lists_geoip_and_caches_availability(tmp_path, monkeypatch):
    from tracesignal.enrichers import registry

    monkeypatch.setattr(
        "tracesignal.enrichers.geoip.geoip_database_path", lambda: tmp_path / "missing.mmdb"
    )
    # Re-register a fresh GeoIP instance pointed at the patched path so
    # check_availability() actually observes the monkeypatched location.
    from tracesignal.enrichers.geoip import GeoIPEnricher

    registry.register(GeoIPEnricher(db_path=tmp_path / "missing.mmdb"))

    assert registry.get_enricher("geoip") is not None
    assert any(e.key == "geoip" for e in registry.all_enrichers())

    availability = registry.refresh_availability()
    assert availability["geoip"].available is False
    assert registry.get_cached_availability("geoip").available is False


# ---------------------------------------------------------------------------
# PostgresStore: timeline_enrichers config
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upsert_timeline_enricher_creates_then_updates(store):
    await store.create_case("c1", "Case One")
    timeline = await store.create_timeline("c1", "t1", "Timeline One")

    created = await store.upsert_timeline_enricher(
        timeline_id=timeline.id,
        enricher_key="geoip",
        mode="manual",
        enabled=True,
        updated_by="u1",
    )
    assert created.mode == "manual"
    assert created.enabled is True

    updated = await store.upsert_timeline_enricher(
        timeline_id=timeline.id,
        enricher_key="geoip",
        mode="automatic",
        enabled=False,
        updated_by="u2",
    )
    assert updated.id == created.id
    assert updated.mode == "automatic"
    assert updated.enabled is False

    rows = await store.list_timeline_enrichers(timeline.id)
    assert len(rows) == 1


@pytest.mark.asyncio
async def test_list_automatic_enrichers_for_source_filters_mode_and_enabled(store):
    await store.create_case("c1", "Case One")
    timeline = await store.create_timeline("c1", "t1", "Timeline One")
    source = await store.create_source("c1", "s1", "source-one", file_hash="a" * 64, size_bytes=10)
    await store.add_source_to_timeline("c1", timeline.id, source.id)

    await store.upsert_timeline_enricher(
        timeline_id=timeline.id,
        enricher_key="geoip",
        mode="automatic",
        enabled=True,
        updated_by=None,
    )
    await store.upsert_timeline_enricher(
        timeline_id=timeline.id,
        enricher_key="manual-only",
        mode="manual",
        enabled=True,
        updated_by=None,
    )
    await store.upsert_timeline_enricher(
        timeline_id=timeline.id,
        enricher_key="disabled",
        mode="automatic",
        enabled=False,
        updated_by=None,
    )

    pairs = await store.list_automatic_enrichers_for_source(source.id)
    assert pairs == [(timeline.id, "geoip")]


@pytest.mark.asyncio
async def test_list_automatic_enrichers_global_default_and_override(store):
    await store.create_case("c1", "Case One")
    timeline_a = await store.create_timeline("c1", "t1", "Timeline A")
    timeline_b = await store.create_timeline("c1", "t2", "Timeline B")
    source = await store.create_source("c1", "s1", "source-one", file_hash="a" * 64, size_bytes=10)
    await store.add_source_to_timeline("c1", timeline_a.id, source.id)
    await store.add_source_to_timeline("c1", timeline_b.id, source.id)

    # Timeline A explicitly opts out; timeline B has no row and should
    # inherit the instance-wide default.
    await store.upsert_timeline_enricher(
        timeline_id=timeline_a.id,
        enricher_key="geoip",
        mode="automatic",
        enabled=False,
        updated_by=None,
    )

    pairs = await store.list_automatic_enrichers_for_source(source.id, {"geoip"})
    assert pairs == [(timeline_b.id, "geoip")]

    # Without the default, nothing fires.
    pairs = await store.list_automatic_enrichers_for_source(source.id)
    assert pairs == []


@pytest.mark.asyncio
async def test_upsert_enricher_global_config_creates_then_updates(store):
    created = await store.upsert_enricher_global_config(
        enricher_key="geoip", auto_run_default=True, updated_by="u1"
    )
    assert created.auto_run_default is True

    updated = await store.upsert_enricher_global_config(
        enricher_key="geoip", auto_run_default=False, updated_by="u2"
    )
    assert updated.auto_run_default is False

    rows = await store.list_enricher_global_configs()
    assert len(rows) == 1
    assert rows[0].enricher_key == "geoip"


# ---------------------------------------------------------------------------
# PostgresStore: staging + job-run crash/resume bookkeeping
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_stage_flush_and_delete_staged_rows(store):
    now = datetime.now(UTC)
    rows = [
        {
            "job_id": "job1",
            "case_id": "c1",
            "source_id": "s1",
            "timeline_id": "t1",
            "event_id": "e1",
            "enricher_key": "geoip",
            "field_key": "geoip_country__ip",
            "value": "DE",
            "computed_at": now,
        },
        {
            "job_id": "job1",
            "case_id": "c1",
            "source_id": "s1",
            "timeline_id": "t1",
            "event_id": "e2",
            "enricher_key": "geoip",
            "field_key": "geoip_country__ip",
            "value": "US",
            "computed_at": now,
        },
    ]
    await store.stage_enrichment_results(rows)

    staged = await store.pop_staged_rows_for_job("job1", limit=10)
    assert len(staged) == 2
    assert {r.value for r in staged} == {"DE", "US"}

    await store.delete_staged_rows([r.id for r in staged])
    assert await store.pop_staged_rows_for_job("job1", limit=10) == []


@pytest.mark.asyncio
async def test_delete_staged_rows_for_job_discards_only_that_job(store):
    now = datetime.now(UTC)
    await store.stage_enrichment_results(
        [
            {
                "job_id": "job1",
                "case_id": "c1",
                "source_id": "s1",
                "timeline_id": "t1",
                "event_id": "e1",
                "enricher_key": "geoip",
                "field_key": "geoip_country__ip",
                "value": "DE",
                "computed_at": now,
            }
        ]
    )
    await store.stage_enrichment_results(
        [
            {
                "job_id": "job2",
                "case_id": "c1",
                "source_id": "s1",
                "timeline_id": "t1",
                "event_id": "e2",
                "enricher_key": "geoip",
                "field_key": "geoip_country__ip",
                "value": "US",
                "computed_at": now,
            }
        ]
    )

    await store.delete_staged_rows_for_job("job1")
    assert await store.pop_staged_rows_for_job("job1", limit=10) == []
    assert len(await store.pop_staged_rows_for_job("job2", limit=10)) == 1


@pytest.mark.asyncio
async def test_orphaned_enrichment_job_run_lifecycle(store):
    await store.start_enrichment_job_run(
        "job1", timeline_id="t1", case_id="c1", enricher_key="geoip"
    )

    orphans = await store.list_orphaned_enrichment_job_runs()
    assert [o.job_id for o in orphans] == ["job1"]

    await store.finish_enrichment_job_run("job1")
    assert await store.list_orphaned_enrichment_job_runs() == []


class _RecordingClickHouse:
    """Fake ClickHouseStore capturing apply_enrichments calls."""

    def __init__(self) -> None:
        self.applied: list[tuple[str, str, str, list]] = []

    def apply_enrichments(self, case_id, source_id, scratch_suffix, row_chunks) -> int:
        chunks = [list(chunk) for chunk in row_chunks]
        self.applied.append((case_id, source_id, scratch_suffix, chunks))
        return sum(len(chunk) for chunk in chunks)


class _BrokenClickHouse:
    def apply_enrichments(self, case_id, source_id, scratch_suffix, row_chunks) -> int:
        raise ConnectionError("clickhouse down")


async def _stage_one_row(store, job_id="job1", value="DE", config_hash="hash1"):
    await store.stage_enrichment_results(
        [
            {
                "job_id": job_id,
                "case_id": "c1",
                "source_id": "s1",
                "timeline_id": "t1",
                "event_id": "e1",
                "enricher_key": "geoip",
                "field_key": "ip:geo_country",
                "value": value,
                "computed_at": datetime.now(UTC),
                "enricher_config_hash": config_hash,
            }
        ]
    )


@pytest.mark.asyncio
async def test_reconcile_orphaned_enrichment_jobs_applies_and_returns_reruns(store):
    from tracesignal.enrichers.jobs import reconcile_orphaned_enrichment_jobs

    await store.create_case("c1", "Case One")
    await store.create_source("c1", "s1", "src", file_hash="a" * 64, size_bytes=1)
    await store.start_enrichment_job_run(
        "job1", timeline_id="t1", case_id="c1", enricher_key="geoip"
    )
    await _stage_one_row(store)

    ch = _RecordingClickHouse()
    recovered = await reconcile_orphaned_enrichment_jobs(store, ch)

    # Staged work applied to events.attributes, not discarded.
    assert len(ch.applied) == 1
    case_id, source_id, suffix, chunks = ch.applied[0]
    assert (case_id, source_id, suffix) == ("c1", "s1", "job1")
    assert chunks == [[("e1", "ip:geo_country", "DE")]]
    assert await store.pop_staged_rows_for_job("job1", limit=10) == []
    assert await store.list_orphaned_enrichment_job_runs() == []
    # Provenance recorded with the staged config hash.
    provenance = await store.list_source_enrichments("s1")
    assert len(provenance) == 1
    assert provenance[0].enricher_config_hash == "hash1"
    assert provenance[0].rows_applied == 1
    # The run is returned so the caller can schedule a re-run.
    assert [r.job_id for r in recovered] == ["job1"]


@pytest.mark.asyncio
async def test_reconcile_leaves_marker_and_rows_when_apply_fails(store):
    from tracesignal.enrichers.jobs import reconcile_orphaned_enrichment_jobs

    await store.create_case("c1", "Case One")
    await store.create_source("c1", "s1", "src", file_hash="a" * 64, size_bytes=1)
    await store.start_enrichment_job_run(
        "job1", timeline_id="t1", case_id="c1", enricher_key="geoip"
    )
    await _stage_one_row(store)

    recovered = await reconcile_orphaned_enrichment_jobs(store, _BrokenClickHouse())

    assert recovered == []
    assert [o.job_id for o in await store.list_orphaned_enrichment_job_runs()] == ["job1"]
    assert len(await store.pop_staged_rows_for_job("job1", limit=10)) == 1
    assert await store.list_source_enrichments("s1") == []


@pytest.mark.asyncio
async def test_apply_skips_and_discards_rows_for_deleted_source(store):
    from tracesignal.enrichers.jobs import _apply_staged_rows

    await store.create_case("c1", "Case One")
    # Source "s1" is never created — simulates deletion mid-job.
    await _stage_one_row(store)

    ch = _RecordingClickHouse()
    applied = await _apply_staged_rows(store, ch, "job1")

    assert applied == 0
    assert ch.applied == []
    assert await store.pop_staged_rows_for_job("job1", limit=10) == []
    assert await store.list_source_enrichments("s1") == []


# ---------------------------------------------------------------------------
# apply_enrichments partition rewrite (fake client)
# ---------------------------------------------------------------------------


class _FakeCHClient:
    def __init__(self):
        self.commands: list[str] = []
        self.queries: list[tuple[str, dict | None]] = []
        self.inserts: list[tuple[str, list]] = []
        self.query_rows: list[list] = []

    def command(self, sql):
        self.commands.append(sql)

    def query(self, sql, parameters=None):
        import types

        self.queries.append((sql, parameters))
        return types.SimpleNamespace(result_rows=self.query_rows)

    def insert(self, table, data, column_names=None, database=None):
        self.inserts.append((table, data))


def _fake_ch_store():
    from tracesignal.db.clickhouse import ClickHouseStore

    store = ClickHouseStore.__new__(ClickHouseStore)
    store.database = "tsig"
    store.client = _FakeCHClient()
    return store


def test_apply_enrichments_runs_atomic_partition_rewrite():
    store = _fake_ch_store()
    applied = store.apply_enrichments(
        "c1", "s1", "job1", [[("e1", "ip:geo_country", "DE"), ("e1", "ip:geo_city", "X")]]
    )
    assert applied == 2

    client = store.client
    # Triples inserted into the scratch rows table.
    assert client.inserts == [
        ("tsig.tmp_enrich_rows_job1", [("e1", "ip:geo_country", "DE"), ("e1", "ip:geo_city", "X")])
    ]
    # Enriched partition copy built via mapUpdate join, pinned join_use_nulls.
    insert_select = client.queries[0][0]
    assert "mapUpdate(e.attributes, m.enr)" in insert_select
    assert "join_use_nulls = 0" in insert_select
    # Atomic swap of exactly this source's partition, then scratch cleanup.
    commands = client.commands
    replace = [c for c in commands if "REPLACE PARTITION" in c]
    assert replace == [
        "ALTER TABLE tsig.events REPLACE PARTITION tuple('c1', 's1') "
        "FROM tsig.tmp_enrich_events_job1"
    ]
    assert commands[-2:] == [
        "DROP TABLE IF EXISTS tsig.tmp_enrich_events_job1",
        "DROP TABLE IF EXISTS tsig.tmp_enrich_rows_job1",
    ]


def test_apply_enrichments_no_rows_is_a_noop_swap():
    store = _fake_ch_store()
    assert store.apply_enrichments("c1", "s1", "job1", [[]]) == 0
    assert not any("REPLACE PARTITION" in c for c in store.client.commands)


def test_drop_stale_enrichment_scratch_tables():
    store = _fake_ch_store()
    store.client.query_rows = [("tmp_enrich_rows_x",), ("tmp_enrich_events_x",)]
    assert store.drop_stale_enrichment_scratch_tables() == 2
    assert "DROP TABLE IF EXISTS tsig.tmp_enrich_rows_x" in store.client.commands
    assert "DROP TABLE IF EXISTS tsig.tmp_enrich_events_x" in store.client.commands


# ---------------------------------------------------------------------------
# Per-run instances, dedup guard, config hash
# ---------------------------------------------------------------------------


def test_spawn_returns_fresh_instance_preserving_db_path(tmp_path):
    original = GeoIPEnricher(db_path=tmp_path / "custom.mmdb")
    clone = original.spawn()
    assert clone is not original
    assert isinstance(clone, GeoIPEnricher)
    assert clone._db_path == original._db_path


def test_base_close_is_noop():
    from tracesignal.enrichers.base import Enricher

    class Stub(Enricher):
        key = "stub"
        display_name = "Stub"
        description = ""
        eligibility_regex = ".*"
        output_fields = ("x",)

        def check_availability(self):
            return AvailabilityResult(True)

        def enrich_value(self, raw_value):
            return None

    Stub().close()  # must not raise


def test_enricher_run_guard_claim_release():
    from tracesignal.enrichers import jobs

    assert jobs.get_active_enricher_run("t1", "geoip") is None
    assert jobs.try_claim_enricher_run("t1", "geoip", "jobA") is None
    # Second claim reports the conflicting job.
    assert jobs.try_claim_enricher_run("t1", "geoip", "jobB") == "jobA"
    # Release by a non-owner is a no-op.
    jobs._release_enricher_run("t1", "geoip", "jobB")
    assert jobs.get_active_enricher_run("t1", "geoip") == "jobA"
    # Owner release frees the slot.
    jobs._release_enricher_run("t1", "geoip", "jobA")
    assert jobs.get_active_enricher_run("t1", "geoip") is None


def test_config_hash_deterministic_and_sensitive_to_extras():
    from tracesignal.enrichers.base import Enricher

    class Stub(Enricher):
        key = "stub"
        display_name = "Stub"
        description = ""
        eligibility_regex = ".*"
        output_fields = ("x",)
        extras: dict = {}

        def check_availability(self):
            return AvailabilityResult(True)

        def enrich_value(self, raw_value):
            return None

        def config_extras(self):
            return self.extras

    a, b = Stub(), Stub()
    assert a.config_hash() == b.config_hash()
    b.extras = {"database_sha256": "deadbeef"}
    assert a.config_hash() != b.config_hash()


def test_geoip_config_extras_reads_and_writes_sidecar(tmp_path, monkeypatch):
    import geoip2.database

    from tracesignal.enrichers.geoip import read_geoip_sidecar, write_geoip_sidecar

    db_path = tmp_path / "GeoLite2-City.mmdb"
    db_path.write_bytes(b"fake-mmdb-content")

    # Sidecar present: no Reader needed at all.
    write_geoip_sidecar(
        db_path, {"sha256": "abc123", "build_epoch": 1700000000, "database_type": "GeoLite2-City"}
    )
    extras = GeoIPEnricher(db_path=db_path).config_extras()
    assert extras == {
        "database_sha256": "abc123",
        "build_epoch": 1700000000,
        "database_type": "GeoLite2-City",
    }

    # Missing sidecar: fallback hashes the file, reads metadata, persists sidecar.
    sidecar_path = tmp_path / "GeoLite2-City.mmdb.meta.json"
    sidecar_path.unlink()

    class _FakeMeta:
        build_epoch = 1710000000
        database_type = "GeoLite2-City"

    class _FakeReader:
        def __init__(self, path):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def metadata(self):
            return _FakeMeta()

    monkeypatch.setattr(geoip2.database, "Reader", _FakeReader)
    extras = GeoIPEnricher(db_path=db_path).config_extras()
    import hashlib

    expected_sha = hashlib.sha256(b"fake-mmdb-content").hexdigest()
    assert extras["database_sha256"] == expected_sha
    assert extras["build_epoch"] == 1710000000
    assert read_geoip_sidecar(db_path)["sha256"] == expected_sha


def test_enrich_value_invalid_ip_returns_none_but_reader_errors_propagate(tmp_path):
    enricher = GeoIPEnricher(db_path=tmp_path / "whatever.mmdb")
    # Invalid input is a legitimate None — never touches the reader.
    assert enricher.enrich_value("not-an-ip") is None

    class _BrokenReader:
        def city(self, value):
            raise ValueError("reader is closed or corrupt")

    enricher._reader = _BrokenReader()
    with pytest.raises(ValueError):
        enricher.enrich_value("8.8.8.8")


@pytest.mark.asyncio
async def test_manual_run_409_and_auto_trigger_skip_when_run_active(store, monkeypatch):
    from fastapi import BackgroundTasks, HTTPException

    from tracesignal.api import deps
    from tracesignal.api.routers.cases import (
        _trigger_automatic_enrichments,
        run_timeline_enricher,
    )
    from tracesignal.core.jobs import JobStore
    from tracesignal.db.postgres import User
    from tracesignal.enrichers import jobs, registry
    from tracesignal.enrichers.base import Enricher

    class Stub(Enricher):
        key = "stub-guard"
        display_name = "Stub"
        description = ""
        eligibility_regex = ".*"
        output_fields = ("x",)

        def check_availability(self):
            return AvailabilityResult(True)

        def enrich_value(self, raw_value):
            return None

    registry.register(Stub())
    registry.refresh_availability()
    monkeypatch.setattr(deps, "_store", store)

    case = await store.create_case("cg", "Guard Case")
    timeline = await store.create_timeline("cg", "tg", "Guard Timeline")
    await store.create_source("cg", "sg", "src", file_hash="h" * 64, size_bytes=1)
    await store.add_source_to_timeline("cg", timeline.id, "sg")

    jobs.try_claim_enricher_run(timeline.id, "stub-guard", "existing-job")
    try:
        with pytest.raises(HTTPException) as excinfo:
            await run_timeline_enricher(
                timeline_id=timeline.id,
                enricher_key="stub-guard",
                background_tasks=BackgroundTasks(),
                case=case,
                user=User(id="u1", username="t", is_admin=True, is_active=True),
            )
        assert excinfo.value.status_code == 409
        assert "existing-job" in excinfo.value.detail

        # Auto-trigger silently skips the busy slot and creates no job.
        await store.upsert_timeline_enricher(
            timeline_id=timeline.id,
            enricher_key="stub-guard",
            mode="automatic",
            enabled=True,
            updated_by=None,
        )
        job_store = JobStore()
        await _trigger_automatic_enrichments(store, None, job_store, "cg", "sg")
        assert job_store._jobs == {}
    finally:
        jobs._release_enricher_run(timeline.id, "stub-guard", "existing-job")


@pytest.mark.asyncio
async def test_run_enrichment_job_stamps_config_hash_and_fails_loudly(store, monkeypatch):
    from tracesignal.core.jobs import JobStore
    from tracesignal.enrichers import registry
    from tracesignal.enrichers.base import Enricher
    from tracesignal.enrichers.jobs import get_active_enricher_run, run_enrichment_job

    class Stub(Enricher):
        key = "stub-ok"
        display_name = "Stub"
        description = ""
        eligibility_regex = r"^match-me$"
        output_fields = ("out",)

        def check_availability(self):
            return AvailabilityResult(True)

        def enrich_value(self, raw_value):
            return {"out": "enriched"}

    registry.register(Stub())
    await store.create_case("c1", "Case One")
    await store.create_source("c1", "s1", "src", file_hash="b" * 64, size_bytes=1)

    class _FakeCH(_RecordingClickHouse):
        def count_events(self, case_id, source_id):
            return 1

        def list_events(self, case_id, source_id, limit, offset):
            if offset > 0:
                return []
            return [{"event_id": "e1", "attributes": {"field": "match-me"}}]

    job_store = JobStore()
    job = job_store.create(kind="enrich")
    ch = _FakeCH()
    await run_enrichment_job(
        job_id=job.id,
        case_id="c1",
        timeline_id="t1",
        enricher_key="stub-ok",
        source_ids=["s1"],
        job_store=job_store,
        store=store,
        ch_store=ch,
    )
    assert job_store.get(job.id).status == "completed"
    # One apply for the source, carrying the derived-key naming contract.
    assert len(ch.applied) == 1
    assert ch.applied[0][:2] == ("c1", "s1")
    assert ch.applied[0][3] == [[("e1", "field:out", "enriched")]]
    # Config hash lands in the per-source provenance row.
    provenance = await store.list_source_enrichments("s1")
    assert [p.enricher_config_hash for p in provenance] == [Stub().config_hash()]
    assert await store.list_orphaned_enrichment_job_runs() == []

    # Failing enricher: job fails loudly, marker cleaned up, guard released.
    class StubBroken(Stub):
        key = "stub-broken"

        def enrich_value(self, raw_value):
            raise RuntimeError("boom")

    registry.register(StubBroken())
    job2 = job_store.create(kind="enrich")
    await run_enrichment_job(
        job_id=job2.id,
        case_id="c1",
        timeline_id="t1",
        enricher_key="stub-broken",
        source_ids=["s1"],
        job_store=job_store,
        store=store,
        ch_store=_FakeCH(),
    )
    assert job_store.get(job2.id).status == "failed"
    assert "boom" in job_store.get(job2.id).error
    assert await store.list_orphaned_enrichment_job_runs() == []
    assert get_active_enricher_run("t1", "stub-broken") is None
