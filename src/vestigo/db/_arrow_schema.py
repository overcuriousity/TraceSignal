"""Arrow schema mirroring the ClickHouse ``events`` table.

One :mod:`pyarrow` field per ``_EVENT_COLUMNS`` entry in
:mod:`vestigo.db.clickhouse`, dtypes matching ``_EVENTS_TABLE_DDL``:
``FixedString(64)`` and ``UUID`` columns travel as Arrow strings (the server
casts on insert), ``DateTime64(3)`` as millisecond UTC timestamps, ``tags``
as ``list<string>`` and ``attributes`` as ``map<string, string>``.

Kept as its own module (not inlined in ``clickhouse.py``) so converter
scripts and parser code can import the schema without pulling in
``clickhouse_connect`` client construction.
"""

from __future__ import annotations

import pyarrow as pa

EVENT_ARROW_SCHEMA = pa.schema(
    [
        pa.field("event_id", pa.string()),
        pa.field("case_id", pa.string()),
        pa.field("source_id", pa.string()),
        pa.field("source_file", pa.string()),
        pa.field("byte_offset", pa.uint64()),
        pa.field("line_number", pa.uint64()),
        pa.field("content_hash", pa.string()),
        pa.field("file_hash", pa.string()),
        pa.field("parser_name", pa.string()),
        pa.field("parser_version", pa.string()),
        pa.field("ingest_time", pa.timestamp("ms", tz="UTC")),
        pa.field("message", pa.string()),
        # Non-nullable in ClickHouse; rows without a parseable timestamp carry
        # the NULL_TS_SENTINEL value (db/_dt.py), never an Arrow null.
        pa.field("timestamp", pa.timestamp("ms", tz="UTC")),
        pa.field("timestamp_desc", pa.string()),
        pa.field("artifact", pa.string()),
        pa.field("artifact_long", pa.string()),
        pa.field("display_name", pa.string()),
        pa.field("tags", pa.list_(pa.string())),
        pa.field("attributes", pa.map_(pa.string(), pa.string())),
        pa.field("embedding_model", pa.string()),
        pa.field("embedding_config_hash", pa.string()),
    ]
)
