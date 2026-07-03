"""Tests for the viz router's field-inventory endpoint.

Route handlers in tracevector.api.routers.viz are plain async functions
(same pattern as tests/test_events_router.py), so `list_viz_fields` is
called directly with its collaborators monkeypatched — no FastAPI
TestClient needed.
"""

from __future__ import annotations

import pytest

from tracevector.api.routers import viz


class _FakeStatService:
    def __init__(self, inventory: list[tuple[str, int, int]], total: int) -> None:
        self._inventory = inventory
        self._total = total
        self.calls: list[tuple[str, list[str]]] = []

    def field_inventory(
        self, case_id: str, source_ids: list[str]
    ) -> tuple[list[tuple[str, int, int]], int]:
        self.calls.append((case_id, source_ids))
        return self._inventory, self._total


async def _fake_source_ids(case_id: str, timeline_id: str) -> list[str]:
    return ["s1", "s2"]


@pytest.mark.asyncio
async def test_list_viz_fields_sorts_by_coverage_then_token(monkeypatch):
    svc = _FakeStatService(
        [
            ("artifact", 5, 1000),
            ("display_name", 1, 900),
            ("attr:status_code", 6, 1000),
        ],
        total=1000,
    )
    monkeypatch.setattr(viz, "_get_stat_anomaly_service", lambda: svc)
    monkeypatch.setattr(viz, "_resolve_timeline_source_ids", _fake_source_ids)

    result = await viz.list_viz_fields("c1", "t1", case=None)

    # Coverage descending, token ascending as the tiebreak — and no novelty
    # filtering: the constant-valued display_name is still listed.
    assert result == {
        "fields": [
            {"token": "artifact", "distinct": 5, "coverage": 1.0},
            {"token": "attr:status_code", "distinct": 6, "coverage": 1.0},
            {"token": "display_name", "distinct": 1, "coverage": 0.9},
        ]
    }
    assert svc.calls == [("c1", ["s1", "s2"])]


@pytest.mark.asyncio
async def test_list_viz_fields_empty_timeline(monkeypatch):
    svc = _FakeStatService([], total=0)
    monkeypatch.setattr(viz, "_get_stat_anomaly_service", lambda: svc)
    monkeypatch.setattr(viz, "_resolve_timeline_source_ids", _fake_source_ids)

    result = await viz.list_viz_fields("c1", "t1", case=None)
    assert result == {"fields": []}
