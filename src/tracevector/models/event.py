"""Core event and provenance models for TraceVector.

All identifiers, hashing, and serialization choices are designed for
forensic reproducibility: given the same source file, parser, and
embedding configuration, ingestion should produce the same event and
vector identities.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


@dataclass(frozen=True, slots=True)
class ParserConfig:
    """Immutable parser configuration used for provenance tracking."""

    name: str
    version: str
    options: dict[str, Any] = field(default_factory=dict)

    def config_hash(self) -> str:
        """Return a SHA-256 hex hash of this parser configuration."""
        canonical = json.dumps(
            {"name": self.name, "version": self.version, "options": self.options},
            sort_keys=True,
            ensure_ascii=False,
            separators=(",", ":"),
        )
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


@dataclass(frozen=True, slots=True)
class EmbeddingConfig:
    """Immutable embedding configuration used for provenance tracking."""

    model_name: str
    device: str = "cpu"
    vector_dimension: int | None = None
    normalize: bool = True
    pooling: str = "mean"

    def config_hash(self) -> str:
        """Return a SHA-256 hex hash of this embedding configuration."""
        canonical = json.dumps(
            {
                "model_name": self.model_name,
                "device": self.device,
                "vector_dimension": self.vector_dimension,
                "normalize": self.normalize,
                "pooling": self.pooling,
            },
            sort_keys=True,
            ensure_ascii=False,
            separators=(",", ":"),
        )
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    def as_dict(self) -> dict[str, Any]:
        """Return a serializable dictionary representation."""
        return {
            "model_name": self.model_name,
            "device": self.device,
            "vector_dimension": self.vector_dimension,
            "normalize": self.normalize,
            "pooling": self.pooling,
        }


@dataclass(slots=True)
class Event:
    """A single forensic event produced by a parser.

    Attributes:
        event_id: Deterministic UUIDv5 derived from case, source file,
            byte offset, and content hash.
        case_id: Investigation case identifier.
        timeline_id: Timeline identifier within the case.
        source_file: Absolute path to the original source file.
        byte_offset: Byte offset in the source file where the raw record starts.
        line_number: Optional 1-based line number for text formats.
        content_hash: SHA-256 hex digest of the canonical raw content.
        parser_name: Name of the parser that produced this event.
        parser_version: Version/hash of the parser configuration.
        ingest_time: UTC timestamp when the event was ingested.
        raw_line: Original, unmodified source line or record bytes-as-text.
        message: Human-readable event message.
        timestamp: Optional event timestamp (ISO 8601 string).
        timestamp_desc: Description of what ``timestamp`` represents.
        source: Short source name.
        source_long: Long source name.
        display_name: Display name of the source artifact.
        tags: List of tags attached by the parser.
        attributes: Additional format-specific fields.
        embedding_model: Name of the embedding model.
        embedding_config_hash: Hash of the embedding configuration.
        vector_id: Identifier used for the vector record (same as event_id).
    """

    case_id: str
    timeline_id: str
    source_file: Path
    byte_offset: int
    content_hash: str
    parser_name: str
    parser_version: str
    raw_line: str
    message: str
    line_number: int | None = None
    ingest_time: datetime = field(default_factory=lambda: datetime.now(UTC))
    timestamp: str | None = None
    timestamp_desc: str | None = None
    source: str | None = None
    source_long: str | None = None
    display_name: str | None = None
    tags: list[str] = field(default_factory=list)
    attributes: dict[str, Any] = field(default_factory=dict)
    embedding_model: str | None = None
    embedding_config_hash: str | None = None
    event_id: uuid.UUID | None = field(default=None, init=False)
    vector_id: str | None = field(default=None, init=False)

    def __post_init__(self) -> None:
        object.__setattr__(self, "event_id", self._derive_id())
        object.__setattr__(self, "vector_id", str(self.event_id))

    def _derive_id(self) -> uuid.UUID:
        """Derive a deterministic UUIDv5 for this event."""
        namespace = uuid.uuid5(uuid.NAMESPACE_URL, f"tracevector:{self.case_id}")
        digest_input = (
            f"{self.timeline_id}\n"
            f"{self.source_file.resolve().as_posix()}\n"
            f"{self.byte_offset}\n"
            f"{self.content_hash}\n"
            f"{self.parser_name}\n"
            f"{self.parser_version}"
        )
        return uuid.uuid5(namespace, digest_input)

    def canonical_content(self) -> str:
        """Return the canonical content used for hashing and embedding."""
        return self.raw_line

    def text_for_embedding(self) -> str:
        """Build a single text representation for embedding.

        Prefers a structured message + key context, falling back to the raw line.
        """
        parts: list[str] = []
        if self.message:
            parts.append(self.message)
        if self.timestamp:
            parts.append(f"time={self.timestamp}")
        if self.timestamp_desc:
            parts.append(f"time_desc={self.timestamp_desc}")
        if self.source:
            parts.append(f"source={self.source}")
        if self.source_long:
            parts.append(f"source_long={self.source_long}")
        if self.display_name:
            parts.append(f"display_name={self.display_name}")
        if self.tags:
            parts.append(f"tags={','.join(sorted(self.tags))}")
        for key in sorted(self.attributes):
            value = self.attributes[key]
            if value is not None and value != "":
                parts.append(f"{key}={value}")
        if not parts:
            return self.raw_line
        return " | ".join(parts)

    def to_clickhouse_row(self) -> dict[str, Any]:
        """Serialize to a ClickHouse-ready row dictionary."""
        return {
            "event_id": str(self.event_id),
            "case_id": self.case_id,
            "timeline_id": self.timeline_id,
            "source_file": str(self.source_file.resolve()),
            "byte_offset": self.byte_offset,
            "line_number": self.line_number if self.line_number is not None else 0,
            "content_hash": self.content_hash,
            "parser_name": self.parser_name,
            "parser_version": self.parser_version,
            "ingest_time": self.ingest_time,
            "message": self.message,
            "timestamp": self.timestamp or "",
            "timestamp_desc": self.timestamp_desc or "",
            "source": self.source or "",
            "source_long": self.source_long or "",
            "display_name": self.display_name or "",
            "tags": self.tags,
            "attributes": {str(k): str(v) for k, v in self.attributes.items()},
            "embedding_model": self.embedding_model or "",
            "embedding_config_hash": self.embedding_config_hash or "",
            "vector_id": self.vector_id or "",
        }

    def to_qdrant_payload(self) -> dict[str, Any]:
        """Serialize to a Qdrant payload dictionary."""
        return {
            "event_id": str(self.event_id),
            "case_id": self.case_id,
            "timeline_id": self.timeline_id,
            "source_file": str(self.source_file.resolve()),
            "byte_offset": self.byte_offset,
            "line_number": self.line_number,
            "content_hash": self.content_hash,
            "parser_name": self.parser_name,
            "parser_version": self.parser_version,
            "message": self.message,
            "timestamp": self.timestamp,
            "timestamp_desc": self.timestamp_desc,
            "source": self.source,
            "source_long": self.source_long,
            "display_name": self.display_name,
            "tags": self.tags,
            "embedding_model": self.embedding_model,
            "embedding_config_hash": self.embedding_config_hash,
        }

    def as_dict(self) -> dict[str, Any]:
        """Return a full serializable dictionary representation."""
        data = asdict(self)
        data["event_id"] = str(self.event_id)
        data["vector_id"] = self.vector_id
        data["source_file"] = str(self.source_file)
        return data


def content_hash(content: str | bytes) -> str:
    """Return the SHA-256 hex digest of ``content``."""
    if isinstance(content, str):
        return hashlib.sha256(content.encode("utf-8")).hexdigest()
    return hashlib.sha256(content).hexdigest()
