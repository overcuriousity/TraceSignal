"""Log-template normalization (W6): mask variable substrings so structurally
identical log lines collapse to one template hash.

Field-agnostic like every other detector in ``anomaly_stats.py``: the
normalization expression is built over a caller-supplied SQL expression
(``column_expr``), never a hardcoded column name. The events-table
materialized column (``clickhouse.py::_TEMPLATE_HASH_COLUMN_DDL``) happens to
apply it to ``message`` — the one field required non-null on every ``Event``
(``models/event.py``) — but ``template_normalize_expr`` itself takes whatever
expression ``_col_expr``/``resolve_column_token`` resolves for any field the
analyst picks (see ``StatisticalAnomalyService.list_log_templates``).

Versioned and append-only, the same discipline as ``ParserConfig``/
``EmbeddingConfig``: changing the regex chain changes every template's
identity. A future revision must ship as a new column (e.g.
``template_hash_v2``) rather than an in-place ``ALTER MODIFY`` — modifying the
expression in place would leave already-materialized parts holding stale
hash values, silently splitting one template's identity across the table, a
forensic-reproducibility violation. See docs/ANOMALY_DETECTION.md for the
full spec and rationale per pattern.
"""

TEMPLATE_NORMALIZE_VERSION = 1

# Ordered (pattern, placeholder) pairs. Order is load-bearing: each pattern
# must run before a broader one would otherwise consume part of it (e.g. a
# UUID's hex groups would be eaten by the digit-run pass if digits ran
# first). All patterns are RE2-compatible (ClickHouse's regex engine) — no
# backreferences, no lookaround.
_TEMPLATE_PATTERNS: list[tuple[str, str]] = [
    # ISO-ish timestamp: 2026-07-20T10:00:01.123Z / 2026-07-20 10:00:01+02:00
    (r"\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?", "<TS>"),
    # UUID
    (
        r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}",
        "<UUID>",
    ),
    # MAC address
    (r"([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}", "<MAC>"),
    # IPv6 (conservative: 3+ colon-separated hex groups, avoids eating a
    # single bare "::" or timestamp-adjacent colons)
    (r"\b([0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}\b", "<IP6>"),
    # IPv4
    (r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b", "<IP>"),
    # Hex runs of 8+ chars, optional 0x/0X prefix (memory addresses, short
    # hashes, hex IDs)
    (r"\b(0[xX])?[0-9a-fA-F]{8,}\b", "<HEX>"),
    # Everything else numeric — confirmed: mask all digit runs, no length
    # floor. Coarser templates (e.g. "HTTP 404" and "HTTP 500" collapse to
    # one shape); status/error codes stay visible via the `example` column
    # `list_log_templates` returns. Last in the chain: every narrower
    # pattern above has already claimed its digits.
    (r"\d+", "<NUM>"),
]


def _sql_string_literal(pattern: str) -> str:
    """Encode a Python regex string as a ClickHouse single-quoted literal.

    ClickHouse's SQL literal escaping requires a doubled backslash to
    produce a single literal backslash for RE2 (its own docs write
    ``replaceRegexpAll(s, '\\\\d+', ...)`` for the regex ``\d+``) — so every
    backslash in ``pattern`` must be doubled, in addition to escaping single
    quotes.
    """
    return "'" + pattern.replace("\\", "\\\\").replace("'", "\\'") + "'"


def template_normalize_expr(column_expr: str) -> str:
    """Build the nested ``replaceRegexpAll`` chain over ``column_expr``.

    ``column_expr`` is a SQL expression (a bare column name or any resolved
    ``_col_expr`` output), never assumed to be ``message`` — callers decide
    which field to template. Returns a SQL expression string; embed directly,
    it is not itself a full statement.
    """
    expr = column_expr
    for pattern, placeholder in _TEMPLATE_PATTERNS:
        expr = f"replaceRegexpAll({expr}, {_sql_string_literal(pattern)}, '{placeholder}')"
    return expr


def template_hash_expr(column_expr: str) -> str:
    """``cityHash64`` of the normalized form of ``column_expr``."""
    return f"cityHash64({template_normalize_expr(column_expr)})"
