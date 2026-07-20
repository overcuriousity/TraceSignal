"""In-memory tests for the agent's MCP tools against the SQLite-backed store.

Calls tools exactly like the runtime does — through a fastmcp in-memory
client over the real `build_tool_server` — so tool schemas, serialization,
and scope binding are all exercised.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

import pytest
from fastmcp.client import Client as FastMCPClient
from fastmcp.exceptions import ToolError

from vestigo.agent.tools import AgentScope, build_tool_server
from vestigo.db.postgres import User


def _scope(case_id: str, timeline_id: str, source_ids: list[str] | None = None) -> AgentScope:
    return AgentScope(
        case_id=case_id,
        timeline_id=timeline_id,
        user=User(id="u1", username="tester", is_admin=True, is_active=True),
        source_ids=source_ids or [],
        field_mappings=None,
        source_offsets=None,
    )


async def _call(server, name: str, args: dict[str, Any] | None = None) -> Any:
    """Call one tool over the in-memory transport and return its payload."""
    async with FastMCPClient(server) as client:
        result = await client.call_tool(name, args or {})
    if result.structured_content is not None:
        payload = result.structured_content
        # FastMCP wraps non-dict returns as {"result": ...}.
        if isinstance(payload, dict) and set(payload) == {"result"}:
            return payload["result"]
        return payload
    return json.loads(result.content[0].text)


async def test_list_baselines_returns_timeline_definitions(store):
    await store.init_schema()
    await store.create_baseline_definition(
        "c1",
        "t1",
        "normal week",
        datetime(2026, 1, 1, tzinfo=UTC),
        datetime(2026, 1, 8, tzinfo=UTC),
        [
            {
                "id": "w1",
                "label": "incident",
                "start": "2026-01-09T00:00:00+00:00",
                "end": "2026-01-10T00:00:00+00:00",
            }
        ],
    )
    await store.create_baseline_definition(
        "c1",
        "OTHER",
        "foreign",
        datetime(2026, 1, 1, tzinfo=UTC),
        datetime(2026, 1, 2, tzinfo=UTC),
        [],
    )
    server = build_tool_server(_scope("c1", "t1"))
    result = await _call(server, "list_baselines")
    assert result["total"] == 1
    (b,) = result["baselines"]
    assert b["name"] == "normal week"
    assert b["id"]
    assert b["baseline"]["start"].startswith("2026-01-01")
    assert b["suspect_windows"][0]["label"] == "incident"


async def test_list_dispositions_scoped_and_filtered(store):
    await store.init_schema()
    await store.create_disposition(
        "c1", "normal", detector="value_novelty", timeline_id="t1", field="user", value="svc"
    )
    await store.create_disposition(
        "c1", "dismissed", detector="frequency", timeline_id="t1", field="host", value="a"
    )
    await store.create_disposition(
        "c1", "normal", detector="value_novelty", timeline_id="OTHER", field="x", value="y"
    )
    server = build_tool_server(_scope("c1", "t1"))
    result = await _call(server, "list_dispositions", {"kind": "normal"})
    assert result["total"] == 1
    assert result["dispositions"][0]["field"] == "user"
    everything = await _call(server, "list_dispositions")
    assert everything["total"] == 2


async def test_list_saved_views(store):
    await store.init_schema()
    await store.create_view(
        "c1", "v1", "failed logins", "status:4625", {"filters": {"status": ["4625"]}}
    )
    server = build_tool_server(_scope("c1", "t1"))
    result = await _call(server, "list_saved_views")
    assert result["total"] == 1
    view = result["views"][0]
    assert view["name"] == "failed logins"
    assert view["query"] == "status:4625"
    assert view["filter"] == {"filters": {"status": ["4625"]}}


async def test_annotations_tools(store):
    await store.init_schema()
    await store.create_annotation("c1", "s1", "e1", "a1", "tag", "suspicious", created_by="alice")
    await store.create_annotation(
        "c1", "s1", "e2", "a2", "comment", "looks like lateral movement", created_by="bob"
    )
    await store.create_annotation("c1", "sX", "e3", "a3", "tag", "out-of-scope-source")
    server = build_tool_server(_scope("c1", "t1", source_ids=["s1"]))
    listed = await _call(server, "list_annotations")
    assert listed["total"] == 2
    tags_only = await _call(server, "list_annotations", {"annotation_type": "tag"})
    assert tags_only["total"] == 1
    assert tags_only["annotations"][0]["content"] == "suspicious"
    single = await _call(server, "get_event_annotations", {"source_id": "s1", "event_id": "e2"})
    assert single["total"] == 1
    assert single["annotations"][0]["created_by"] == "bob"


async def test_sigma_rules_tools(store, monkeypatch):
    await store.init_schema()
    import vestigo.api.routers.sigma as sigma_router

    async def no_global():
        return []

    monkeypatch.setattr(sigma_router, "_load_global", no_global)
    from vestigo.db.postgres import SigmaRule, generate_id

    rule = SigmaRule(
        id=generate_id("sigma_rule"),
        case_id="c1",
        rule_key="a" * 32,
        title="Suspicious PowerShell",
        level="high",
        logsource={"product": "windows"},
        yaml_content="title: Suspicious PowerShell\ndetection: {}\n",
        content_hash="b" * 64,
    )
    async with store.session_factory() as session:
        session.add(rule)
        await session.commit()

    server = build_tool_server(_scope("c1", "t1"))
    listed = await _call(server, "list_sigma_rules")
    assert listed["total"] == 1
    meta = listed["rules"][0]
    assert meta["title"] == "Suspicious PowerShell"
    assert "yaml_content" not in meta

    full = await _call(server, "get_sigma_rule", {"rule_id": rule.id})
    assert "Suspicious PowerShell" in full["yaml_content"]

    missing = await _call(server, "get_sigma_rule", {"rule_id": "nope"})
    assert "error" in missing


async def test_sigma_runs_tools(store):
    await store.init_schema()
    run = await store.create_sigma_run("c1", "t1", {"source_ids": ["s1"]}, created_by="alice")
    await store.update_sigma_run(
        run.id,
        status="completed",
        results=[
            {
                "rule_key": "a" * 32,
                "title": "R",
                "match_count": 3,
                "status": "matched",
                "sql": "SELECT 1",
            }
        ],
        completed=True,
    )
    other_timeline = await store.create_sigma_run("c1", "t2", {}, created_by="alice")
    assert other_timeline.id != run.id

    server = build_tool_server(_scope("c1", "t1"))
    listed = await _call(server, "list_sigma_runs")
    assert listed["total"] == 1
    assert listed["runs"][0]["status"] == "completed"
    assert "results" not in listed["runs"][0]

    full = await _call(server, "get_sigma_run", {"run_id": run.id})
    assert full["results"][0]["match_count"] == 3


async def test_filterspec_annotated_resolves_to_event_ids(store, monkeypatch):
    """annotated=['tag'] resolves tagged event ids into EventQuery.event_ids."""
    from vestigo.agent.tools import FilterSpec, _build_query

    await store.init_schema()
    await store.create_annotation("c1", "s1", "e-tagged", "a1", "tag", "bad", origin="user")
    scope = _scope("c1", "t1", source_ids=["s1"])
    query = await _build_query(scope, FilterSpec(annotated=["tag"]))
    assert query.event_ids == ["e-tagged"]


async def test_filterspec_event_ids_intersect_annotated(store):
    from vestigo.agent.tools import FilterSpec, _build_query

    await store.init_schema()
    await store.create_annotation("c1", "s1", "e1", "a1", "tag", "bad", origin="user")
    await store.create_annotation("c1", "s1", "e2", "a2", "tag", "bad", origin="user")
    scope = _scope("c1", "t1", source_ids=["s1"])
    query = await _build_query(scope, FilterSpec(annotated=["tag"], event_ids=["e2", "e3"]))
    assert query.event_ids == ["e2"]


async def test_build_query_clamps_limit_and_offset(store):
    """Model-supplied paging is clamped — a negative LIMIT/OFFSET would be a
    ClickHouse error."""
    from vestigo.agent.tools import MAX_EVENTS_PER_SEARCH, FilterSpec, _build_query

    await store.init_schema()
    scope = _scope("c1", "t1", source_ids=["s1"])
    query = await _build_query(scope, FilterSpec(), limit=-5, offset=-10)
    assert query.limit == 1
    assert query.offset == 0
    query = await _build_query(scope, FilterSpec(), limit=10_000)
    assert query.limit == MAX_EVENTS_PER_SEARCH


async def test_filterspec_event_ids_alone(store):
    from vestigo.agent.tools import FilterSpec, _build_query

    await store.init_schema()
    scope = _scope("c1", "t1", source_ids=["s1"])
    query = await _build_query(scope, FilterSpec(event_ids=["e9"]))
    assert query.event_ids == ["e9"]


async def test_filterspec_collapse_routine(store):
    from vestigo.agent.tools import FilterSpec, _build_query

    await store.init_schema()
    row = await store.create_disposition(
        "c1",
        "routine",
        detector="sequence_motif",
        timeline_id="t1",
        field="artifact",
        value="a → b",
    )
    scope = _scope("c1", "t1", source_ids=["s1"])
    query = await _build_query(scope, FilterSpec(collapse_routine=True))
    assert query.exclude_routine_disposition_ids == [row.id]
    plain = await _build_query(scope, FilterSpec())
    assert plain.exclude_routine_disposition_ids is None


async def test_filterspec_collapse_routine_log_template(store):
    """W6: agent-side search/grid parity — a log_template routine
    disposition resolves to exclude_template_hashes, not the motif
    disposition-id anti-join path."""
    from vestigo.agent.tools import FilterSpec, _build_query

    await store.init_schema()
    await store.create_disposition(
        "c1",
        "routine",
        detector="log_template",
        timeline_id="t1",
        field="template_id",
        value="987654321",
        details={"template": "Allow TCP <IP>", "template_version": 1},
    )
    scope = _scope("c1", "t1", source_ids=["s1"])
    query = await _build_query(scope, FilterSpec(collapse_routine=True))
    assert query.exclude_template_hashes == [987654321]
    assert query.exclude_routine_disposition_ids is None
    plain = await _build_query(scope, FilterSpec())
    assert plain.exclude_template_hashes is None


@pytest.mark.asyncio
async def test_run_anomaly_detector_passes_tuning_params(store, monkeypatch):
    import vestigo.api.routers.events as events_router

    captured: dict[str, Any] = {}

    async def fake_run(case_id, timeline_id, source_ids, **kwargs):
        captured.update(kwargs)

        class R:
            status = "skipped"

        return R(), {}

    def fake_serialize(result):
        return {"status": result.status, "results": []}

    monkeypatch.setattr(events_router, "_run_stat_detector", fake_run)
    monkeypatch.setattr(events_router, "_serialize_stat_result", fake_serialize)

    server = build_tool_server(_scope("c1", "t1", source_ids=["s1"]))
    result = await _call(
        server,
        "run_anomaly_detector",
        {
            "detector": "proportion_shift",
            "z_threshold": 4.0,
            "fdr_q": 0.05,
            "min_ratio": 2.0,
            "ngram_size": 3,
            "min_support": 5,
            "min_skew_seconds": 1.5,
            "start": "2026-01-01T00:00:00Z",
            "end": "2026-02-01T00:00:00Z",
        },
    )
    assert result["status"] == "skipped"
    assert captured["z_threshold"] == 4.0
    assert captured["fdr_q"] == 0.05
    assert captured["min_ratio"] == 2.0
    assert captured["ngram_size"] == 3
    assert captured["min_support"] == 5
    assert captured["min_skew_seconds"] == 1.5
    assert captured["start"] is not None and captured["end"] is not None


@pytest.mark.asyncio
async def test_run_anomaly_detector_rejects_out_of_bounds(store):
    server = build_tool_server(_scope("c1", "t1", source_ids=["s1"]))
    with pytest.raises(ToolError):
        await _call(
            server, "run_anomaly_detector", {"detector": "sequence_novelty", "ngram_size": 9}
        )


# ---------------------------------------------------------------------------
# A9 viz read tools: field_timeseries, time_punchcard, field_pivot,
# field_scatter, compare — pass-through + cap clamping. Monkeypatches
# _get_query_service (same seam build_tool_server resolves at build time)
# with a fake recording service, so these run without live ClickHouse — the
# existing detector/query tools in this file take the same approach.
# ---------------------------------------------------------------------------


class _FakeVizService:
    def __init__(self):
        self.calls: list[tuple[str, tuple, dict]] = []

    def field_value_timeseries(self, query, field, buckets, series_limit):
        self.calls.append(("field_value_timeseries", (field, buckets, series_limit), {}))
        return {"field": field, "series": [], "interval_seconds": 3600, "min": None, "max": None}

    def time_punchcard(self, query):
        self.calls.append(("time_punchcard", (), {}))
        return {"kind": "punchcard", "cells": [], "total": 0, "max_count": 0}

    def field_pivot(self, query, field_x, field_y, limit_x, limit_y):
        self.calls.append(("field_pivot", (field_x, field_y, limit_x, limit_y), {}))
        return {"kind": "pivot", "cells": [], "total": 0, "x_distinct": 0, "y_distinct": 0}

    def field_scatter(self, query, field_x, field_y, limit):
        self.calls.append(("field_scatter", (field_x, field_y, limit), {}))
        return {"kind": "scatter", "points": [], "total": 0, "sampled": 0}

    def compare_time_histogram(self, primary, comparison, buckets):
        self.calls.append(("compare_time_histogram", (buckets,), {}))
        return {"kind": "time", "buckets": [], "primary_total": 0, "comparison_total": 0}

    def compare_field_terms(self, primary, comparison, field, limit):
        self.calls.append(("compare_field_terms", (field, limit), {}))
        return {"kind": "terms", "field": field, "primary_total": 0, "comparison_total": 0}

    def compare_field_numeric(self, primary, comparison, field, bins):
        self.calls.append(("compare_field_numeric", (field, bins), {}))
        return {"kind": "numeric", "field": field, "primary_total": 0, "comparison_total": 0}


def _patch_viz_service(monkeypatch) -> _FakeVizService:
    import vestigo.api.routers.events as events_router

    fake = _FakeVizService()
    monkeypatch.setattr(events_router, "_get_query_service", lambda: fake)
    return fake


async def test_field_timeseries_clamps_buckets_and_series_limit(store, monkeypatch):
    fake = _patch_viz_service(monkeypatch)
    server = build_tool_server(_scope("c1", "t1", source_ids=["s1"]))
    await _call(
        server, "field_timeseries", {"field": "attr:status", "buckets": 500, "series_limit": 50}
    )
    name, args, _ = fake.calls[0]
    assert name == "field_value_timeseries"
    assert args == ("attr:status", 60, 8)  # clamped to VIZ_TIMESERIES_MAX_BUCKETS/SERIES


async def test_time_punchcard_passes_through(store, monkeypatch):
    fake = _patch_viz_service(monkeypatch)
    server = build_tool_server(_scope("c1", "t1", source_ids=["s1"]))
    result = await _call(server, "time_punchcard")
    assert result["kind"] == "punchcard"
    assert fake.calls[0][0] == "time_punchcard"


async def test_field_pivot_clamps_limits(store, monkeypatch):
    fake = _patch_viz_service(monkeypatch)
    server = build_tool_server(_scope("c1", "t1", source_ids=["s1"]))
    await _call(
        server,
        "field_pivot",
        {"field_x": "attr:user", "field_y": "attr:host", "limit_x": 100, "limit_y": 100},
    )
    name, args, _ = fake.calls[0]
    assert name == "field_pivot"
    assert args == ("attr:user", "attr:host", 12, 12)  # clamped to VIZ_PIVOT_MAX_LIMIT


async def test_field_scatter_clamps_limit(store, monkeypatch):
    fake = _patch_viz_service(monkeypatch)
    server = build_tool_server(_scope("c1", "t1", source_ids=["s1"]))
    await _call(
        server,
        "field_scatter",
        {"field_x": "attr:bytes", "field_y": "attr:latency", "limit": 20000},
    )
    name, args, _ = fake.calls[0]
    assert name == "field_scatter"
    assert args == ("attr:bytes", "attr:latency", 1000)  # clamped to VIZ_SCATTER_MAX_POINTS


async def test_compare_time_dispatches_and_clamps_buckets(store, monkeypatch):
    fake = _patch_viz_service(monkeypatch)
    server = build_tool_server(_scope("c1", "t1", source_ids=["s1"]))
    result = await _call(server, "compare", {"kind": "time", "buckets": 500})
    assert result["kind"] == "time"
    name, args, _ = fake.calls[0]
    assert name == "compare_time_histogram"
    assert args == (60,)  # clamped to VIZ_COMPARE_MAX_BUCKETS


async def test_compare_terms_requires_field(store):
    server = build_tool_server(_scope("c1", "t1", source_ids=["s1"]))
    with pytest.raises(ToolError):
        await _call(server, "compare", {"kind": "terms"})


async def test_compare_terms_dispatches_and_clamps_limit(store, monkeypatch):
    fake = _patch_viz_service(monkeypatch)
    server = build_tool_server(_scope("c1", "t1", source_ids=["s1"]))
    result = await _call(server, "compare", {"kind": "terms", "field": "attr:status", "limit": 999})
    assert result["kind"] == "terms"
    name, args, _ = fake.calls[0]
    assert name == "compare_field_terms"
    assert args == ("attr:status", 30)  # clamped to VIZ_COMPARE_MAX_TERMS


async def test_compare_numeric_dispatches_and_clamps_bins(store, monkeypatch):
    fake = _patch_viz_service(monkeypatch)
    server = build_tool_server(_scope("c1", "t1", source_ids=["s1"]))
    result = await _call(
        server, "compare", {"kind": "numeric", "field": "attr:bytes", "limit": 999}
    )
    assert result["kind"] == "numeric"
    name, args, _ = fake.calls[0]
    assert name == "compare_field_numeric"
    assert args == ("attr:bytes", 30)  # clamped to VIZ_COMPARE_MAX_BINS


async def test_compare_rejects_unknown_kind(store):
    server = build_tool_server(_scope("c1", "t1", source_ids=["s1"]))
    with pytest.raises(ToolError):
        await _call(server, "compare", {"kind": "bogus"})


# ---------------------------------------------------------------------------
# A9 propose_chart: validate-by-execute, summary stats echoed, no proposal
# row (unlike propose_annotation — the analyst's Save click is the only
# write, mirroring propose_finding's no-write contract).
# ---------------------------------------------------------------------------


class _FakeChartService(_FakeVizService):
    def field_terms(self, query, field, limit):
        self.calls.append(("field_terms", (field, limit), {}))
        return {
            "field": field,
            "total": 100,
            "distinct": 4,
            "other_count": 5,
            "values": [{"value": "a", "count": 60}, {"value": "b", "count": 40}],
        }

    def field_numeric_stats(self, query, field):
        self.calls.append(("field_numeric_stats", (field,), {}))
        return {"field": field, "count": 100, "min": 0, "max": 99, "mean": 50, "stddev": 10}


def _patch_chart_service(monkeypatch) -> _FakeChartService:
    import vestigo.api.routers.events as events_router

    fake = _FakeChartService()
    monkeypatch.setattr(events_router, "_get_query_service", lambda: fake)
    return fake


async def test_propose_chart_terms(store, monkeypatch):
    fake = _patch_chart_service(monkeypatch)
    server = build_tool_server(_scope("c1", "t1", source_ids=["s1"]))
    result = await _call(
        server,
        "propose_chart",
        {
            "title": "Top artifacts",
            "description": "artifact distribution",
            "spec": {"kind": "terms", "field": "artifact", "limit": 500},
        },
    )
    assert result["ok"] is True
    assert result["total"] == 100
    assert len(result["top_values"]) == 2
    name, args, _ = fake.calls[0]
    assert name == "field_terms"
    assert args == ("artifact", 100)  # limit clamped to field_terms' own 100 cap


async def test_propose_chart_numeric(store, monkeypatch):
    _patch_chart_service(monkeypatch)
    server = build_tool_server(_scope("c1", "t1", source_ids=["s1"]))
    result = await _call(
        server,
        "propose_chart",
        {
            "title": "Bytes",
            "description": "bytes distribution",
            "spec": {"kind": "numeric", "field": "attr:bytes"},
        },
    )
    assert result["ok"] is True
    assert result["mean"] == 50


async def test_propose_chart_timeseries(store, monkeypatch):
    fake = _patch_chart_service(monkeypatch)
    server = build_tool_server(_scope("c1", "t1", source_ids=["s1"]))
    result = await _call(
        server,
        "propose_chart",
        {
            "title": "Status over time",
            "description": "",
            "spec": {"kind": "timeseries", "field": "attr:status", "buckets": 999},
        },
    )
    assert result["ok"] is True
    name, args, _ = fake.calls[0]
    assert name == "field_value_timeseries"
    assert args == ("attr:status", 60, 6)  # buckets clamped, default series_limit


async def test_propose_chart_pivot_requires_field_y(store):
    server = build_tool_server(_scope("c1", "t1", source_ids=["s1"]))
    with pytest.raises(ToolError):
        await _call(
            server,
            "propose_chart",
            {"title": "t", "description": "", "spec": {"kind": "pivot", "field": "attr:user"}},
        )


async def test_propose_chart_scatter(store, monkeypatch):
    fake = _patch_chart_service(monkeypatch)
    server = build_tool_server(_scope("c1", "t1", source_ids=["s1"]))
    result = await _call(
        server,
        "propose_chart",
        {
            "title": "t",
            "description": "",
            "spec": {
                "kind": "scatter",
                "field": "attr:bytes",
                "field_y": "attr:latency",
                "limit": 50000,
            },
        },
    )
    assert result["ok"] is True
    name, args, _ = fake.calls[0]
    assert args == ("attr:bytes", "attr:latency", 1000)  # clamped to VIZ_SCATTER_MAX_POINTS


async def test_propose_chart_compare_time(store, monkeypatch):
    fake = _patch_chart_service(monkeypatch)
    server = build_tool_server(_scope("c1", "t1", source_ids=["s1"]))
    result = await _call(
        server,
        "propose_chart",
        {"title": "t", "description": "", "spec": {"kind": "compare_time", "buckets": 999}},
    )
    assert result["ok"] is True
    assert "primary_total" in result and "comparison_total" in result
    name, args, _ = fake.calls[0]
    assert name == "compare_time_histogram"
    assert args == (60,)


async def test_propose_chart_unknown_kind(store):
    server = build_tool_server(_scope("c1", "t1", source_ids=["s1"]))
    with pytest.raises(ToolError):
        await _call(
            server, "propose_chart", {"title": "t", "description": "", "spec": {"kind": "bogus"}}
        )


async def test_propose_chart_missing_required_field(store):
    server = build_tool_server(_scope("c1", "t1", source_ids=["s1"]))
    with pytest.raises(ToolError):
        await _call(
            server, "propose_chart", {"title": "t", "description": "", "spec": {"kind": "terms"}}
        )


MAX_PROPOSAL_EVENTS_TEST = 500  # mirror of tools.MAX_PROPOSAL_EVENTS


def _scope_with_conversation(case_id: str, timeline_id: str, conversation_id: str) -> AgentScope:
    s = _scope(case_id, timeline_id)
    s.conversation_id = conversation_id
    return s


async def test_propose_annotation_records_proposal(store, monkeypatch):
    await store.init_schema()
    conv = await store.create_agent_conversation("c1", "t1", "u1", model_id="m")
    # ClickHouse resolution is monkeypatched: pretend both ids exist in scope.
    from vestigo.agent import tools as tools_mod

    async def fake_resolve(scope, event_ids):
        return {"e1": "s1", "e2": "s1"}, []

    monkeypatch.setattr(tools_mod, "_resolve_event_sources", fake_resolve)
    server = build_tool_server(_scope_with_conversation("c1", "t1", conv.id))
    result = await _call(
        server,
        "propose_annotation",
        {"event_ids": ["e1", "e2"], "tag": "suspicious", "rationale": "clustered"},
    )
    assert result["status"] == "proposed" and result["event_count"] == 2
    (p,) = await store.list_agent_proposals(conv.id)
    assert p.tag == "suspicious" and len(p.events) == 2


async def test_propose_annotation_requires_tag_or_comment(store, monkeypatch):
    await store.init_schema()
    conv = await store.create_agent_conversation("c1", "t1", "u1", model_id="m")
    from vestigo.agent import tools as tools_mod

    async def fake_resolve(scope, event_ids):
        return {"e1": "s1", "e2": "s1"}, []

    monkeypatch.setattr(tools_mod, "_resolve_event_sources", fake_resolve)
    server = build_tool_server(_scope_with_conversation("c1", "t1", conv.id))
    result = await _call(
        server, "propose_annotation", {"event_ids": ["e1", "e2"], "rationale": "clustered"}
    )
    assert "error" in result


async def test_propose_annotation_rejects_unknown_ids(store, monkeypatch):
    await store.init_schema()
    conv = await store.create_agent_conversation("c1", "t1", "u1", model_id="m")
    from vestigo.agent import tools as tools_mod

    async def fake_resolve(scope, event_ids):
        return {"e1": "s1"}, ["eX"]

    monkeypatch.setattr(tools_mod, "_resolve_event_sources", fake_resolve)
    server = build_tool_server(_scope_with_conversation("c1", "t1", conv.id))
    result = await _call(
        server,
        "propose_annotation",
        {"event_ids": ["e1", "eX"], "tag": "suspicious", "rationale": "clustered"},
    )
    assert "error" in result
    assert "eX" in result["error"]


async def test_propose_annotation_absent_without_conversation(store):
    await store.init_schema()
    server = build_tool_server(_scope("c1", "t1"))  # no conversation_id
    async with FastMCPClient(server) as client:
        names = [t.name for t in await client.list_tools()]
    assert "propose_annotation" not in names


async def test_list_sigma_runs_not_starved_by_other_timelines(store):
    await store.init_schema()
    # Create t1 run first (oldest)
    await store.create_sigma_run("c1", "t1", params={}, created_by="alice")
    # Then create 55 OTHER timeline runs (newer)
    for _ in range(55):
        await store.create_sigma_run("c1", "OTHER", params={}, created_by="alice")
    server = build_tool_server(_scope("c1", "t1"))
    result = await _call(server, "list_sigma_runs")
    assert result["total"] == 1


# ---------------------------------------------------------------------------
# Tool registry + per-tool disable (scope.disabled_tools)
# ---------------------------------------------------------------------------


async def test_tool_registry_matches_registered_tools(store):
    """TOOL_REGISTRY is the single source of truth for toggle UIs — it must
    exactly mirror what build_tool_server registers (with a conversation
    scope, where every tool incl. propose_annotation exists)."""
    from vestigo.agent.tools import TOOL_NAMES

    await store.init_schema()
    server = build_tool_server(_scope_with_conversation("c1", "t1", "conv1"))
    async with FastMCPClient(server) as client:
        names = {t.name for t in await client.list_tools()}
    assert names == TOOL_NAMES


async def test_disabled_tool_removed_from_server(store):
    await store.init_schema()
    scope = _scope("c1", "t1")
    scope.disabled_tools = frozenset({"search_events", "list_baselines"})
    server = build_tool_server(scope)
    async with FastMCPClient(server) as client:
        names = {t.name for t in await client.list_tools()}
        assert "search_events" not in names
        assert "list_baselines" not in names
        assert "list_fields" in names
        with pytest.raises(ToolError):
            await client.call_tool("search_events", {})


async def test_disabling_unregistered_tool_is_harmless(store):
    """Disabling propose_annotation on a conversation-less scope (where it was
    never registered) must not crash the remove pass."""
    await store.init_schema()
    scope = _scope("c1", "t1")
    scope.disabled_tools = frozenset({"propose_annotation"})
    server = build_tool_server(scope)
    async with FastMCPClient(server) as client:
        names = {t.name for t in await client.list_tools()}
    assert "propose_annotation" not in names
