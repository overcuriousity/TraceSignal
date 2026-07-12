"""Shared UTC-datetime normalization for ClickHouse rows.

The `events` table's `timestamp`/`ingest_time` columns carry no explicit
timezone component, so clickhouse-connect returns naive `datetime` objects.
Left as-is, a bare "YYYY-MM-DDTHH:MM:SS" string is ambiguous to JS's `Date`
parser (browsers treat it as local time), silently shifting the
displayed/compared timestamp by the browser's UTC offset. This has already
been independently re-fixed at several call sites — centralize it here.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

# Storage encoding for "this event has no parseable timestamp": the maximum
# value DateTime64(3) can represent, guaranteed later than any real forensic
# log timestamp. Events are *stored* with this value (the column is non-Nullable
# so it can serve as a MergeTree sort key — Nullable sort keys disable
# ClickHouse's read-in-order optimization) and *presented* as null by the
# normalization helpers in queries.py/clickhouse.py. SQL that aggregates or
# buckets over `timestamp` must exclude sentinel rows via VESTIGO_NOT_SENTINEL_SQL,
# exactly where `timestamp IS NOT NULL` guarded the old Nullable column.
NULL_TS_SENTINEL = datetime(2299, 12, 31, 23, 59, 59, 999000, tzinfo=UTC)
NULL_TS_SENTINEL_ISO = NULL_TS_SENTINEL.isoformat()

# Integer epoch-milliseconds form (avoids float rounding of `.timestamp()`).
_NULL_TS_SENTINEL_EPOCH_MS = (
    int(NULL_TS_SENTINEL.replace(microsecond=0).timestamp()) * 1000
    + NULL_TS_SENTINEL.microsecond // 1000
)

# SQL fragments comparing against the sentinel by its epoch ticks —
# timezone-independent, unlike a 'YYYY-MM-DD ...' string literal, which
# ClickHouse would parse in the column/server timezone.
VESTIGO_SENTINEL_SQL = f"fromUnixTimestamp64Milli({_NULL_TS_SENTINEL_EPOCH_MS})"
VESTIGO_NOT_SENTINEL_SQL = f"timestamp != {VESTIGO_SENTINEL_SQL}"


def is_null_ts_sentinel(value: Any) -> bool:
    """True when *value* is the null-timestamp sentinel (naive or aware datetime)."""
    if not isinstance(value, datetime):
        return False
    return ensure_utc(value).astimezone(UTC) == NULL_TS_SENTINEL


def ensure_utc(value: datetime) -> datetime:
    """Attach UTC to a naive datetime; return already-aware datetimes unchanged."""
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def ensure_utc_iso(value: Any) -> Any:
    """Attach UTC and serialize a datetime to an ISO 8601 string.

    Tolerates values that are already strings or ``None`` (passed through
    unchanged) and anything without ``.isoformat()`` (stringified instead of
    raising).
    """
    if value is None or isinstance(value, str):
        return value
    if not hasattr(value, "isoformat"):
        return str(value)
    return ensure_utc(value).isoformat()


def to_clickhouse_utc(value: datetime, *, precise: bool = False) -> str:
    """Format *value* as a naive-UTC string literal for ClickHouse comparisons.

    ClickHouse timestamps are stored naive-UTC. ``ensure_utc`` alone is not
    enough to build a comparable string literal: it only *attaches* UTC to a
    naive datetime and leaves an already-aware, non-UTC datetime (e.g. a
    FastAPI-parsed ``+02:00`` timestamp) untouched, so a bare ``strftime``
    afterward would silently emit wall-clock digits in the wrong zone. This
    always converts to true UTC first via ``.astimezone(UTC)``.
    """
    naive_utc = ensure_utc(value).astimezone(UTC)
    if precise:
        return naive_utc.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    return naive_utc.strftime("%Y-%m-%d %H:%M:%S")
