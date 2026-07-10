"""Heavy-scan memory budget resolution (db/_scan.py).

The per-query ``max_memory_usage`` cap auto-sizes to a ratio of detected RAM
(cgroup-aware) unless pinned via ``TS_STAT_SCAN_MAX_MEMORY_BYTES``.
"""

from __future__ import annotations

from tracesignal.db import _scan
from tracesignal.db._scan import (
    _FALLBACK_MAX_MEMORY_BYTES,
    _resolve_scan_memory_budget,
)


def test_explicit_value_pins_the_budget():
    """A nonzero TS_STAT_SCAN_MAX_MEMORY_BYTES wins over any detection."""
    assert _resolve_scan_memory_budget(12_000_000_000, 0.8, 128 << 30) == 12_000_000_000


def test_auto_uses_ratio_of_detected_memory():
    assert _resolve_scan_memory_budget(0, 0.8, 128 << 30) == int((128 << 30) * 0.8)
    assert _resolve_scan_memory_budget(0, 0.5, 16 << 30) == 8 << 30


def test_detection_failure_falls_back_to_conservative_default():
    assert _resolve_scan_memory_budget(0, 0.8, None) == _FALLBACK_MAX_MEMORY_BYTES
    assert _resolve_scan_memory_budget(0, 0.8, 0) == _FALLBACK_MAX_MEMORY_BYTES


def test_cgroup_limit_bounds_detection(monkeypatch):
    """Inside a memory-limited container the cgroup limit wins over host RAM."""
    monkeypatch.setattr(_scan, "_cgroup_memory_limit", lambda: 8 << 30)
    monkeypatch.setattr(_scan, "_meminfo_total", lambda: 128 << 30)
    monkeypatch.setattr(_scan, "_physical_memory_total", lambda: 128 << 30)
    assert _scan.detect_scan_memory_budget() == int((8 << 30) * 0.8)


def test_unlimited_cgroup_uses_physical_memory(monkeypatch):
    monkeypatch.setattr(_scan, "_cgroup_memory_limit", lambda: None)
    monkeypatch.setattr(_scan, "_meminfo_total", lambda: None)
    monkeypatch.setattr(_scan, "_physical_memory_total", lambda: 64 << 30)
    assert _scan.detect_scan_memory_budget() == int((64 << 30) * 0.8)


def test_meminfo_beats_ballooned_sysinfo(monkeypatch):
    """On VMs with memory ballooning sysinfo() overreports (503 GiB on a
    128 GiB box); MemTotal is the usable truth and must win via min()."""
    monkeypatch.setattr(_scan, "_cgroup_memory_limit", lambda: None)
    monkeypatch.setattr(_scan, "_meminfo_total", lambda: 128 << 30)
    monkeypatch.setattr(_scan, "_physical_memory_total", lambda: 503 << 30)
    assert _scan.detect_scan_memory_budget() == int((128 << 30) * 0.8)


def test_heavy_scan_settings_carries_a_positive_budget():
    """The clause always renders a concrete positive max_memory_usage."""
    clause = _scan.HEAVY_SCAN_SETTINGS
    value = int(clause.rsplit("max_memory_usage = ", 1)[1])
    assert value > 0
    assert "max_bytes_before_external_sort" in clause
