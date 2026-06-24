"""Ingestion pipeline: parse, embed, and store events + vectors."""

from __future__ import annotations

import traceback
from dataclasses import dataclass, field
from pathlib import Path

from tracevector.core.config import get_settings
from tracevector.db.clickhouse import ClickHouseStore
from tracevector.db.qdrant import QdrantStore
from tracevector.ingestion.parser import Parser, detect_format, get_parser
from tracevector.models.embeddings import EmbeddingModel
from tracevector.models.event import Event


@dataclass
class IngestionResult:
    """Result of an ingestion run."""

    case_id: str
    timeline_id: str
    files: list[Path] = field(default_factory=list)
    events_parsed: int = 0
    events_inserted: int = 0
    vectors_inserted: int = 0
    errors: list[str] = field(default_factory=list)

    def summary(self) -> str:
        """Return a human-readable summary."""
        file_list = ", ".join(str(p) for p in self.files) or "none"
        return (
            f"Ingested {self.events_inserted} events "
            f"({self.vectors_inserted} vectors) "
            f"into case '{self.case_id}' / timeline '{self.timeline_id}' "
            f"from {file_list}"
        )


class IngestionPipeline:
    """End-to-end ingestion pipeline.

    The pipeline streams records from source files, computes embeddings in
    batches, writes events to ClickHouse, and writes vectors to Qdrant.  All
    operations are batched to keep memory usage bounded regardless of input
    size.
    """

    def __init__(
        self,
        case_id: str,
        timeline_id: str,
        embedding_model: EmbeddingModel | None = None,
        clickhouse: ClickHouseStore | None = None,
        qdrant: QdrantStore | None = None,
        batch_size: int | None = None,
    ) -> None:
        self.case_id = case_id
        self.timeline_id = timeline_id
        self.embedding_model = embedding_model or EmbeddingModel()
        self.clickhouse = clickhouse or ClickHouseStore()
        self.qdrant = qdrant or QdrantStore()
        self.batch_size = batch_size or get_settings().embedding_batch_size

    def run(
        self,
        path: Path,
        format_name: str | None = None,
    ) -> IngestionResult:
        """Run ingestion over ``path``.

        ``path`` may be a single file or a directory.  Files are matched to the
        requested parser format; when ``format_name`` is ``None`` the format is
        inferred from the file extension.
        """
        path = path.resolve()
        files = self._resolve_files(path)
        result = IngestionResult(
            case_id=self.case_id,
            timeline_id=self.timeline_id,
            files=files,
        )

        self._init_stores()

        first_exception: BaseException | None = None
        for file_path in files:
            fmt = format_name or detect_format(file_path)
            parser = get_parser(fmt, self.case_id, self.timeline_id)
            try:
                self._ingest_file(file_path, parser, result)
            except Exception as exc:  # noqa: BLE001
                if first_exception is None:
                    first_exception = exc
                result.errors.append(f"{file_path}: {exc}\n{traceback.format_exc()}")

        if result.errors:
            message = "Ingestion failed:\n" + "\n".join(result.errors)
            raise RuntimeError(message) from first_exception

        return result

    def _resolve_files(self, path: Path) -> list[Path]:
        """Return the list of source files to ingest."""
        if path.is_file():
            return [path]
        if path.is_dir():
            return sorted(p for p in path.rglob("*") if p.is_file())
        raise FileNotFoundError(f"Ingestion path not found: {path}")

    def _init_stores(self) -> None:
        """Initialise ClickHouse schema and Qdrant collection."""
        self.clickhouse.init_schema()
        config = self.embedding_model.as_config()
        self.qdrant.init_collection(
            case_id=self.case_id,
            embedding_config_hash=config.config_hash(),
            vector_size=config.vector_dimension or self.embedding_model.vector_dimension(),
        )

    def _ingest_file(
        self,
        file_path: Path,
        parser: Parser,
        result: IngestionResult,
    ) -> None:
        """Stream a single file through the pipeline in batches."""
        batch: list[Event] = []

        for event in parser.parse(file_path):
            event.embedding_model = self.embedding_model.model_name
            event.embedding_config_hash = self.embedding_model.config_hash()
            batch.append(event)
            result.events_parsed += 1

            if len(batch) >= self.batch_size:
                self._flush_batch(batch, result)
                batch = []

        if batch:
            self._flush_batch(batch, result)

    def _flush_batch(self, batch: list[Event], result: IngestionResult) -> None:
        """Embed and persist one batch."""
        texts = [event.text_for_embedding() for event in batch]
        vectors = self.embedding_model.encode(texts)

        inserted = self.clickhouse.insert_events(batch)
        result.events_inserted += inserted

        config = self.embedding_model.as_config()
        vectors_inserted = self.qdrant.upsert_vectors(
            case_id=self.case_id,
            embedding_config_hash=config.config_hash(),
            events=batch,
            vectors=vectors,
        )
        result.vectors_inserted += vectors_inserted
