"""Sigma runner: producer/consumer streaming, failure unwinding, selection.

The streaming bridge is the piece a live end-to-end run exercises least
deterministically, so it gets direct unit coverage with fake ClickHouse/
Postgres stores — in particular the consumer-failure path, which must abort
the producer thread so it releases its ``HEAVY_SCAN_GATE`` slot instead of
parking on a queue nobody drains.
"""

from __future__ import annotations

import threading

import pytest

from vestigo.sigma import runner
from vestigo.sigma.rules import LoadedRule


class _FakeStream:
    def __init__(self, rows):
        self._rows = rows

    def __enter__(self):
        return iter(self._rows)

    def __exit__(self, *exc):
        return False


class _FakeClient:
    def __init__(self, rows):
        self._rows = rows

    def query_rows_stream(self, query, parameters=None):
        return _FakeStream(self._rows)


class _FakeClickHouse:
    database = "vestigo"

    def __init__(self, rows):
        self.client = _FakeClient(rows)


class _FakeStore:
    def __init__(self, fail: bool = False):
        self.fail = fail
        self.batches: list[list[dict]] = []

    async def bulk_create_annotations(self, rows):
        if self.fail:
            raise RuntimeError("postgres write failed")
        self.batches.append(rows)
        return len(rows)


def _rule(rule_key: str = "ab" * 16) -> LoadedRule:
    return LoadedRule(
        origin="case",
        ref="r1",
        rule_key=rule_key,
        title="Test rule",
        yaml_content="title: Test rule",
        content_hash="cd" * 32,
    )


async def test_scan_streams_batches_and_skips_confirmed():
    rule = _rule()
    rows = [(f"e{i}", "s1") for i in range(10)]
    ch = _FakeClickHouse(rows)
    store = _FakeStore()
    progress: list[int] = []

    count = await runner._scan_and_annotate(
        ch,
        store,
        "case1",
        ["s1"],
        rule,
        "1 = 1",
        "run1",
        confirmed_keys={("e3", rule.rule_key)},
        batch_size=4,
        on_progress=progress.append,
    )

    # Confirmed events count as matches but are not re-written.
    assert count == 10
    written = [r for batch in store.batches for r in batch]
    assert len(written) == 9
    assert {r["event_id"] for r in written} == {f"e{i}" for i in range(10)} - {"e3"}
    assert all(r["detector"] == rule.rule_key for r in written)
    assert all(r["annotation_type"] == "sigma" for r in written)
    assert all(r["content"] == "sigma: Test rule" for r in written)
    assert progress[-1] == 10


async def test_consumer_failure_aborts_producer_and_releases_gate(monkeypatch):
    """A failed annotation write must not leave the producer thread parked
    holding a HEAVY_SCAN_GATE slot — with concurrency 1 that would deadlock
    every later heavy scan in the process."""
    gate = threading.BoundedSemaphore(1)
    monkeypatch.setattr(runner, "HEAVY_SCAN_GATE", gate)
    rule = _rule()
    # Far more rows than the queue depth holds at batch_size=1, so the
    # producer is guaranteed to be blocked mid-put when the consumer dies.
    ch = _FakeClickHouse([(f"e{i}", "s1") for i in range(500)])
    store = _FakeStore(fail=True)

    with pytest.raises(RuntimeError, match="postgres write failed"):
        await runner._scan_and_annotate(
            ch,
            store,
            "case1",
            ["s1"],
            rule,
            "1 = 1",
            "run1",
            confirmed_keys=set(),
            batch_size=1,
            on_progress=lambda _m: None,
        )

    # The slot must be free again: acquire would hang forever on a leak.
    assert gate.acquire(timeout=10)
    gate.release()


def test_resolve_selected_rules_reports_missing():
    g = [_rule("11" * 16)]
    g[0].origin = "global"
    g[0].ref = "a.yml"
    c = [_rule("22" * 16)]

    rules, missing = runner._resolve_selected_rules(g, c, None)
    assert rules == g + c
    assert missing == []

    selection = [
        {"origin": "global", "ref": "a.yml"},
        {"origin": "case", "ref": "gone"},
    ]
    rules, missing = runner._resolve_selected_rules(g, c, selection)
    assert rules == g
    assert missing == [("case", "gone")]
