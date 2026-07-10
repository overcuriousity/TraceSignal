"""Shared ClickHouse scan guardrails.

Single home for the SETTINGS clause every whole-corpus scan (GROUP BY over up
to hundreds of millions of rows) must carry: spill large aggregation states to
disk instead of ballooning RAM, cap the query's memory hard (fail one query,
not the server), and bound thread fan-out so several concurrent scans don't
oversubscribe the box. The limits are ``TS_*`` tunables (see
``core/config.py``).

``max_memory_usage`` is auto-sized by default: ``TS_STAT_SCAN_MEMORY_RATIO``
(0.8) of the detected memory — the cgroup limit when the process runs in a
memory-limited container, the machine's physical RAM otherwise. Detection is
**local to the app process**; that matches the supported deployments (compose
stack or native app with local backing services, where app and ClickHouse
share the box). When ClickHouse runs on a different host, pin the cap to that
host's budget with ``TS_STAT_SCAN_MAX_MEMORY_BYTES`` — a nonzero value always
wins over auto-detection. ClickHouse's own 90%-of-RAM server limit cannot be
relied on here: inside containers it may misdetect total memory (observed
503 GiB on a 128 GiB VM), so this per-query cap is the only real bound.

The clause is a string constant, built once at import from the process
settings, because it is interpolated into f-string SQL literals throughout the
detectors — a live function call there would embed the function repr, not the
clause.
"""

import os
from pathlib import Path

from tracesignal.core.config import get_settings

# Used when detection is explicitly disabled nowhere but fails (exotic
# platforms) — the pre-auto-detection default from the session-27 incident.
_FALLBACK_MAX_MEMORY_BYTES = 12_000_000_000


def _cgroup_memory_limit() -> int | None:
    """The container's memory limit, if one is set (cgroup v2, then v1)."""
    for path in (
        "/sys/fs/cgroup/memory.max",
        "/sys/fs/cgroup/memory/memory.limit_in_bytes",
    ):
        try:
            raw = Path(path).read_text().strip()
        except OSError:
            continue
        if raw == "max":  # v2: no limit configured
            return None
        try:
            value = int(raw)
        except ValueError:
            continue
        # v1 reports "no limit" as PAGE_COUNTER_MAX (a huge sentinel).
        if 0 < value < 1 << 60:
            return value
    return None


def _physical_memory_total() -> int | None:
    """Total physical RAM of the (virtual) machine."""
    try:
        pages = os.sysconf("SC_PHYS_PAGES")
        page_size = os.sysconf("SC_PAGE_SIZE")
    except (AttributeError, OSError, ValueError):
        return None
    if pages <= 0 or page_size <= 0:
        return None
    return pages * page_size


def _resolve_scan_memory_budget(explicit: int, ratio: float, detected: int | None) -> int:
    """Pure resolution: explicit nonzero pins, else ratio of detected, else fallback."""
    if explicit > 0:
        return explicit
    if detected is None or detected <= 0:
        return _FALLBACK_MAX_MEMORY_BYTES
    return int(detected * ratio)


def detect_scan_memory_budget() -> int:
    """Resolve the ``max_memory_usage`` budget for heavy scans (see module docstring)."""
    s = get_settings()
    detected = min(
        (v for v in (_cgroup_memory_limit(), _physical_memory_total()) if v),
        default=None,
    )
    return _resolve_scan_memory_budget(
        s.stat_scan_max_memory_bytes, s.stat_scan_memory_ratio, detected
    )


def _build_heavy_scan_settings() -> str:
    s = get_settings()
    return (
        f"SETTINGS max_threads = {s.stat_scan_max_threads}, "
        f"max_bytes_before_external_group_by = {s.stat_scan_external_group_by_bytes}, "
        # Plain ORDER BY sorts spill at this threshold. Window-function sorts
        # cannot spill at all (see docs/ANOMALY_DETECTION.md) — bound those
        # scans structurally (per source / slim columns) instead.
        f"max_bytes_before_external_sort = {s.stat_scan_external_sort_bytes}, "
        f"max_memory_usage = {detect_scan_memory_budget()}"
    )


HEAVY_SCAN_SETTINGS = _build_heavy_scan_settings()
