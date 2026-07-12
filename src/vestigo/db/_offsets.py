"""Per-source clock-skew correction, applied at query time (W2).

An analyst can declare a `time_offset_seconds` on a Source when a
compromised/misconfigured host's clock drifted — the offset is metadata, the
ingested events are never mutated. Everywhere a query filters, orders, buckets
or returns the `timestamp` column, the *effective* (corrected) timestamp is
`timestamp + offset` for that source, with two hard invariants:

* **The no-timestamp sentinel is never shifted.** Undated events are stored as
  the year-2299 sentinel (a real, non-Nullable column value); adding an offset
  would move it out of sentinel range and leak a fake date. The correction is
  wrapped in `if(<not sentinel>, …, timestamp)`.
* **The common path is byte-identical.** When no in-scope source carries a
  nonzero offset (the overwhelming majority of queries, including the 300M-row
  reference case), :func:`effective_ts_sql` returns the bare column name, so
  the generated SQL — and therefore ClickHouse's read-in-order / primary-index
  behaviour — is exactly what it was before W2.

The source→offset map is bound into a query's parameters as two parallel
arrays consumed by ClickHouse `transform()`. Callers that order or bucket by
the effective timestamp against the physical (raw-`timestamp`) primary index
also emit a *widened raw-column scalar bound* (see :func:`offset_raw_bounds`)
so granule pruning survives — it never changes the result set, only restores
the index the effective-ts expression alone would defeat.
"""

from __future__ import annotations

from vestigo.db._dt import VESTIGO_NOT_SENTINEL_SQL

# Fixed parameter names for the source/offset arrays. Fixed (not counter-minted)
# so a caller can bind them once via bind_offset_params and reference the same
# expression string from effective_ts_sql without re-binding or name drift.
OFFSET_SRC_PARAM = "clk_off_src"
OFFSET_VAL_PARAM = "clk_off_val"


def active_offsets(offsets: dict[str, int] | None) -> dict[str, int]:
    """Return only the nonzero offsets (the ones that change any SQL)."""
    return {s: int(o) for s, o in (offsets or {}).items() if o}


def effective_ts_sql(offsets: dict[str, int] | None, *, column: str = "timestamp") -> str:
    """SQL for the offset-corrected timestamp — binds nothing.

    Returns the bare *column* when no offset is active (the byte-identical fast
    path). Otherwise returns a conditional that shifts only non-sentinel rows
    of the offset sources, referencing the fixed array parameters that
    :func:`bind_offset_params` must have bound into the query.
    """
    if not active_offsets(offsets):
        return column
    return (
        f"if({VESTIGO_NOT_SENTINEL_SQL}, "
        f"addSeconds({column}, transform(source_id, "
        f"{{{OFFSET_SRC_PARAM}:Array(String)}}, {{{OFFSET_VAL_PARAM}:Array(Int64)}}, 0)), "
        f"{column})"
    )


def bind_offset_params(offsets: dict[str, int] | None, params: dict[str, object]) -> None:
    """Bind the source/offset arrays into *params* when any offset is active."""
    active = active_offsets(offsets)
    if active:
        params[OFFSET_SRC_PARAM] = list(active.keys())
        params[OFFSET_VAL_PARAM] = list(active.values())


def offset_raw_bounds(offsets: dict[str, int] | None) -> tuple[int, int]:
    """Return ``(max_off, min_off)`` over the active offsets and 0.

    Used to widen a raw-``timestamp`` scalar bound so it stays a superset of
    the effective-ts predicate: for ``effective_ts >= B`` the raw column can be
    as small as ``B - max_off`` and still land in range after shifting; for
    ``effective_ts <= B`` it can be as large as ``B - min_off``. Both include 0
    so a source with no offset is never excluded.
    """
    vals = list(active_offsets(offsets).values())
    if not vals:
        return 0, 0
    return max(max(vals), 0), min(min(vals), 0)
