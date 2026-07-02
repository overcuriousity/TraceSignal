"""Tests for events router helpers that don't require a full HTTP client.

Route handlers in tracevector.api.routers.events are plain async functions,
so the pure logic (annotation-filter resolution, live-finding union,
export-annotation indexing) is tested by calling them directly rather than
spinning up a FastAPI TestClient.
"""

from __future__ import annotations

from datetime import datetime

import pytest
import pytest_asyncio
from fastapi import HTTPException

from tracevector.api.routers import events
from tracevector.db.postgres import PostgresStore


@pytest_asyncio.fixture()
async def store(tmp_path):
    """In-memory SQLite store — same pattern as tests/test_annotations.py."""
    db_path = tmp_path / "test_events_router.db"
    url = f"sqlite+aiosqlite:///{db_path}"
    s = PostgresStore(url=url)
    await s.init_schema()
    yield s
    await s.engine.dispose()


@pytest_asyncio.fixture()
async def patched_store(store, monkeypatch):
    """Point events.get_store() at the in-memory test store."""
    monkeypatch.setattr(events, "_store", store)
    return store


# ---------------------------------------------------------------------------
# _resolve_annotated_event_ids
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_resolve_annotated_returns_none_when_no_filter(patched_store):
    result = await events._resolve_annotated_event_ids("c1", ["s1"], None, None)
    assert result is None


@pytest.mark.asyncio
async def test_resolve_annotated_anomaly_matches_persisted_only(patched_store):
    await patched_store.create_annotation(
        case_id="c1",
        source_id="s1",
        event_id="persisted-evt",
        annotation_id="ann1",
        annotation_type="anomaly",
        content="tagged",
        origin="system",
    )
    result = await events._resolve_annotated_event_ids("c1", ["s1"], "anomaly", None)
    assert result == ["persisted-evt"]


@pytest.mark.asyncio
async def test_resolve_annotated_anomaly_unions_live_event_ids(patched_store):
    """Live (not-yet-persisted) findings never reach the annotations table —
    the frontend passes their event IDs directly, and the anomaly branch
    must union them in rather than requiring persistence first."""
    await patched_store.create_annotation(
        case_id="c1",
        source_id="s1",
        event_id="persisted-evt",
        annotation_id="ann2",
        annotation_type="anomaly",
        content="tagged",
        origin="system",
    )
    result = await events._resolve_annotated_event_ids(
        "c1", ["s1"], "anomaly", None, live_event_ids="live-evt-1,live-evt-2"
    )
    assert set(result) == {"persisted-evt", "live-evt-1", "live-evt-2"}


@pytest.mark.asyncio
async def test_resolve_annotated_live_event_ids_ignored_without_anomaly_type(
    patched_store,
):
    """live_event_ids should only ever apply to the 'anomaly' branch — passing
    it while filtering on 'tag' alone must not leak it into the result."""
    result = await events._resolve_annotated_event_ids(
        "c1", ["s1"], "tag", None, live_event_ids="live-evt-1"
    )
    assert result == []


@pytest.mark.asyncio
async def test_resolve_annotated_dedupes_overlap_between_persisted_and_live(
    patched_store,
):
    """The same event flagged both ways (e.g. persisted after being live)
    must not appear twice in the resolved list."""
    await patched_store.create_annotation(
        case_id="c1",
        source_id="s1",
        event_id="same-evt",
        annotation_id="ann3",
        annotation_type="anomaly",
        content="tagged",
        origin="system",
    )
    result = await events._resolve_annotated_event_ids(
        "c1", ["s1"], "anomaly", None, live_event_ids="same-evt"
    )
    assert result == ["same-evt"]


# ---------------------------------------------------------------------------
# _resolve_event_id_filters (C17 — shared by list_events, bulk_annotate_by_filter,
# get_histogram, export_events)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_resolve_event_id_filters_no_filters_means_no_restriction(patched_store):
    event_ids, exclude_ids = await events._resolve_event_id_filters(
        "c1",
        ["s1"],
        annotated=None,
        annotation_tag_value=None,
        live_event_ids=None,
        tags_include=None,
        tags_exclude=None,
        ids=None,
    )
    assert event_ids is None
    assert exclude_ids is None


@pytest.mark.asyncio
async def test_resolve_event_id_filters_intersects_annotated_and_ids(patched_store):
    await patched_store.create_annotation(
        case_id="c1",
        source_id="s1",
        event_id="flagged-evt",
        annotation_id="ann1",
        annotation_type="anomaly",
        content="tagged",
        origin="system",
    )
    event_ids, exclude_ids = await events._resolve_event_id_filters(
        "c1",
        ["s1"],
        annotated="anomaly",
        annotation_tag_value=None,
        live_event_ids=None,
        tags_include=None,
        tags_exclude=None,
        ids="flagged-evt,other-evt",
    )
    assert event_ids == ["flagged-evt"]
    assert exclude_ids is None


@pytest.mark.asyncio
async def test_resolve_event_id_filters_returns_exclude_ids_independently(
    patched_store, monkeypatch
):
    await patched_store.create_annotation(
        case_id="c1",
        source_id="s1",
        event_id="tagged-evt",
        annotation_id="ann1",
        annotation_type="tag",
        origin="user",
        content="noisy",
    )

    class _FakeQueryServiceNoParserTags:
        def list_event_ids_by_parser_tags(self, case_id, source_ids, tag_values):
            return []

    monkeypatch.setattr(events, "_get_query_service", lambda: _FakeQueryServiceNoParserTags())

    event_ids, exclude_ids = await events._resolve_event_id_filters(
        "c1",
        ["s1"],
        annotated=None,
        annotation_tag_value=None,
        live_event_ids=None,
        tags_include=None,
        tags_exclude="noisy",
        ids=None,
    )
    assert event_ids is None
    assert exclude_ids == ["tagged-evt"]


# ---------------------------------------------------------------------------
# bulk_annotate_by_filter
# ---------------------------------------------------------------------------


class _FakeQueryService:
    """Captures the EventQuery passed by bulk_annotate_by_filter."""

    def __init__(self, refs: list[tuple[str, str]]) -> None:
        self.refs = refs
        self.last_query = None

    def query_event_refs(self, query, cap: int = 100_000):
        self.last_query = query
        return self.refs


@pytest.mark.asyncio
async def test_bulk_annotate_by_filter_honors_annotated_restriction(patched_store, monkeypatch):
    """The 'apply to all matching filter' bulk action must not silently
    ignore an active `annotated` (e.g. anomaly) filter — regression test for
    a bug where BulkAnnotateByFilterRequest had no `annotated` field at all,
    so bulk-tagging while filtered to flagged events wrote to every event
    matching the other filters instead of just the flagged subset."""
    await patched_store.create_case("c1", "Case One")
    await patched_store.create_source("c1", "s1", "source one", file_hash="h1", size_bytes=10)
    await patched_store.create_timeline("c1", "t1", "Timeline One", source_ids=["s1"])
    await patched_store.create_annotation(
        case_id="c1",
        source_id="s1",
        event_id="flagged-evt",
        annotation_id="ann1",
        annotation_type="anomaly",
        content="tagged",
        origin="system",
    )

    fake_service = _FakeQueryService(refs=[("flagged-evt", "s1")])
    monkeypatch.setattr(events, "_get_query_service", lambda: fake_service)

    body = events.BulkAnnotateByFilterRequest(
        annotation_type="tag",
        content="reviewed",
        annotated="anomaly",
    )
    result = await events.bulk_annotate_by_filter("c1", "t1", body)

    assert result == {"tagged": 1}
    assert fake_service.last_query.event_ids == ["flagged-evt"]


# ---------------------------------------------------------------------------
# _index_annotations_by_event (export enrichment)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_index_annotations_by_event_groups_by_event_id(patched_store):
    await patched_store.create_annotation(
        case_id="c2",
        source_id="s2",
        event_id="e1",
        annotation_id="a1",
        annotation_type="tag",
        content="foo",
        origin="user",
    )
    await patched_store.create_annotation(
        case_id="c2",
        source_id="s2",
        event_id="e1",
        annotation_id="a2",
        annotation_type="comment",
        content="bar",
        origin="user",
    )
    await patched_store.create_annotation(
        case_id="c2",
        source_id="s2",
        event_id="e2",
        annotation_id="a3",
        annotation_type="tag",
        content="baz",
        origin="user",
    )
    all_annotations = await patched_store.list_source_annotations("c2", ["s2"])
    indexed = events._index_annotations_by_event(all_annotations)
    assert {a.id for a in indexed["e1"]} == {"a1", "a2"}
    assert {a.id for a in indexed["e2"]} == {"a3"}
    assert "e3" not in indexed


# ---------------------------------------------------------------------------
# _parse_cursor (keyset pagination query param)
# ---------------------------------------------------------------------------


def test_parse_cursor_returns_none_for_empty_value():
    assert events._parse_cursor(None, param_name="after") is None
    assert events._parse_cursor("", param_name="after") is None


def test_parse_cursor_splits_timestamp_and_event_id():
    ts, event_id = events._parse_cursor("2026-06-25T07:30:01+00:00,evt-1", param_name="after")
    assert ts == datetime.fromisoformat("2026-06-25T07:30:01+00:00")
    assert event_id == "evt-1"


def test_parse_cursor_rejects_malformed_value():
    with pytest.raises(HTTPException) as exc_info:
        events._parse_cursor("not-a-cursor", param_name="before")
    assert exc_info.value.status_code == 400


def test_parse_cursor_accepts_empty_event_id_as_synthetic_lower_bound():
    """A jump-to-time target may only have a timestamp (e.g. a Frequency
    finding's window_start with no representative event) — the trailing
    comma with nothing after it is a valid synthetic cursor, not malformed.
    """
    ts, event_id = events._parse_cursor("2026-06-25T07:30:01+00:00,", param_name="before")
    assert ts == datetime.fromisoformat("2026-06-25T07:30:01+00:00")
    assert event_id == ""


def test_parse_cursor_rejects_bad_timestamp():
    with pytest.raises(HTTPException) as exc_info:
        events._parse_cursor("not-a-timestamp,evt-1", param_name="after")
    assert exc_info.value.status_code == 400


# ---------------------------------------------------------------------------
# _get_field_encoder (embedding-assisted field pairing)
# ---------------------------------------------------------------------------


def test_get_field_encoder_does_not_eagerly_load_in_remote_mode(monkeypatch):
    """In remote-embedding mode, load() raises RuntimeError (it's a
    local-model-only operation) — calling it unconditionally here silently
    disables the field-pairing recommender for every remote deployment,
    since the bare except swallows the RuntimeError and returns None."""
    monkeypatch.setattr(events, "_embedding_model", None)

    class ExplodingLoadModel:
        def __init__(self) -> None:
            self.is_remote = True

        def load(self):
            raise RuntimeError("load() is not available when using a remote embedding endpoint")

        def encode(self, texts):
            return [[0.0] for _ in texts]

    import tracevector.models.embeddings as embeddings_module

    monkeypatch.setattr(embeddings_module, "EmbeddingModel", ExplodingLoadModel)

    encode = events._get_field_encoder()
    assert encode is not None
    assert encode(["x"]) == [[0.0]]


# ---------------------------------------------------------------------------
# _run_stat_detector (C16 — shared by list_anomalies and tag_anomalies)
# ---------------------------------------------------------------------------


class _FakeStatAnomalyService:
    """Captures the kwargs passed to each detector method."""

    def __init__(self, midpoint=None):
        self._midpoint = midpoint
        self.frequency_calls: list[dict] = []
        self.value_novelty_calls: list[dict] = []

    def get_timeline_midpoint(self, case_id, source_ids):
        return self._midpoint

    def find_frequency_anomalies(self, **kwargs):
        self.frequency_calls.append(kwargs)
        return "frequency-result"

    def find_value_novelty(self, **kwargs):
        self.value_novelty_calls.append(kwargs)
        return "value-novelty-result"


@pytest.mark.asyncio
async def test_run_stat_detector_dispatches_to_frequency(patched_store, monkeypatch):
    fake_svc = _FakeStatAnomalyService()
    monkeypatch.setattr(events, "_get_stat_anomaly_service", lambda: fake_svc)

    result = await events._run_stat_detector(
        "c1",
        ["s1"],
        detector="frequency",
        fields=None,
        series_field="artifact",
        z_threshold=3.0,
        baseline_end=None,
        temporal=False,
        limit=50,
    )
    assert result == "frequency-result"
    assert len(fake_svc.frequency_calls) == 1
    assert fake_svc.frequency_calls[0]["series_field"] == "artifact"
    assert fake_svc.frequency_calls[0]["z_threshold"] == 3.0
    assert not fake_svc.value_novelty_calls


@pytest.mark.asyncio
async def test_run_stat_detector_dispatches_to_value_novelty(patched_store, monkeypatch):
    fake_svc = _FakeStatAnomalyService()
    monkeypatch.setattr(events, "_get_stat_anomaly_service", lambda: fake_svc)

    result = await events._run_stat_detector(
        "c1",
        ["s1"],
        detector="value_novelty",
        fields="artifact,attr:user_agent",
        series_field="artifact",
        z_threshold=None,
        baseline_end=None,
        temporal=False,
        limit=50,
    )
    assert result == "value-novelty-result"
    assert len(fake_svc.value_novelty_calls) == 1
    assert fake_svc.value_novelty_calls[0]["fields"] == ["artifact", "attr:user_agent"]
    assert not fake_svc.frequency_calls


@pytest.mark.asyncio
async def test_run_stat_detector_resolves_timeline_midpoint_when_temporal_and_no_baseline(
    patched_store, monkeypatch
):
    """temporal=True with no explicit baseline_end must fall back to the
    timeline midpoint — shared behavior list_anomalies and tag_anomalies
    both relied on before the extraction (C16)."""
    midpoint = datetime(2024, 6, 15, 12, 0, 0)
    fake_svc = _FakeStatAnomalyService(midpoint=midpoint)
    monkeypatch.setattr(events, "_get_stat_anomaly_service", lambda: fake_svc)

    await events._run_stat_detector(
        "c1",
        ["s1"],
        detector="frequency",
        fields=None,
        series_field="artifact",
        z_threshold=None,
        baseline_end=None,
        temporal=True,
        limit=50,
    )
    assert fake_svc.frequency_calls[0]["baseline_end"] == midpoint


@pytest.mark.asyncio
async def test_run_stat_detector_explicit_baseline_end_wins_over_midpoint(
    patched_store, monkeypatch
):
    explicit = datetime(2024, 1, 1, 0, 0, 0)
    fake_svc = _FakeStatAnomalyService(midpoint=datetime(2024, 6, 15, 12, 0, 0))
    monkeypatch.setattr(events, "_get_stat_anomaly_service", lambda: fake_svc)

    await events._run_stat_detector(
        "c1",
        ["s1"],
        detector="frequency",
        fields=None,
        series_field="artifact",
        z_threshold=None,
        baseline_end=explicit,
        temporal=True,
        limit=50,
    )
    assert fake_svc.frequency_calls[0]["baseline_end"] == explicit


@pytest.mark.asyncio
async def test_run_stat_detector_excludes_normal_annotated_events(patched_store, monkeypatch):
    await patched_store.create_annotation(
        case_id="c1",
        source_id="s1",
        event_id="normal-evt",
        annotation_id="ann1",
        annotation_type="normal",
        origin="user",
        content="",
    )
    fake_svc = _FakeStatAnomalyService()
    monkeypatch.setattr(events, "_get_stat_anomaly_service", lambda: fake_svc)

    await events._run_stat_detector(
        "c1",
        ["s1"],
        detector="value_novelty",
        fields=None,
        series_field="artifact",
        z_threshold=None,
        baseline_end=None,
        temporal=False,
        limit=50,
    )
    assert fake_svc.value_novelty_calls[0]["exclude_event_ids"] == {"normal-evt"}
