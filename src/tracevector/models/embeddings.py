"""Embedding model wrapper and anomaly utilities."""

from __future__ import annotations

from typing import Any

from sentence_transformers import SentenceTransformer

from tracevector.core.config import get_settings
from tracevector.models.event import EmbeddingConfig


class EmbeddingModel:
    """Local embedding model for log lines with forensic config tracking."""

    def __init__(
        self, model_name: str | None = None, config: EmbeddingConfig | None = None
    ) -> None:
        settings = get_settings()
        self.model_name = (
            (config.model_name if config else None) or model_name or settings.embedding_model
        )
        self.device = (config.device if config else None) or settings.embedding_device
        self.batch_size = settings.embedding_batch_size
        self._normalize = (config.normalize if config else None) or True
        self._pooling = (config.pooling if config else None) or "mean"
        self._vector_dimension: int | None = config.vector_dimension if config else None
        self._resolved_config: EmbeddingConfig | None = None
        self._model: SentenceTransformer | None = None

    @property
    def config(self) -> EmbeddingConfig:
        """Return the immutable, resolved embedding configuration."""
        if self._resolved_config is None:
            self._resolved_config = EmbeddingConfig(
                model_name=self.model_name,
                device=self.device,
                vector_dimension=self.vector_dimension(),
                normalize=self._normalize,
                pooling=self._pooling,
            )
        return self._resolved_config

    def config_hash(self) -> str:
        """Return the configuration hash used for provenance checks."""
        return self.config.config_hash()

    def load(self) -> SentenceTransformer:
        """Lazy-load the sentence-transformer model."""
        if self._model is None:
            # In airgapped mode, SentenceTransformer will not download weights.
            # We rely on the operator to have cached the model offline.
            self._model = SentenceTransformer(self.model_name, device=self.device)
        return self._model

    def vector_dimension(self) -> int:
        """Return the model's output vector dimension."""
        if self._vector_dimension is not None:
            return self._vector_dimension
        model = self.load()
        dimension = self._get_embedding_dimension(model)
        if dimension is None:
            raise RuntimeError(f"Could not determine vector dimension for {self.model_name}")
        self._vector_dimension = dimension
        return dimension

    @staticmethod
    def _get_embedding_dimension(model: SentenceTransformer) -> int | None:
        """Return the embedding dimension, supporting old and new API names."""
        if hasattr(model, "get_embedding_dimension"):
            return model.get_embedding_dimension()
        return model.get_sentence_embedding_dimension()

    def encode(self, texts: list[str]) -> list[list[float]]:
        """Encode a batch of log lines into vectors."""
        model = self.load()
        embeddings = model.encode(
            texts,
            batch_size=self.batch_size,
            show_progress_bar=False,
            convert_to_numpy=True,
            normalize_embeddings=self._normalize,
        )
        return [emb.tolist() for emb in embeddings]

    def as_config(self) -> EmbeddingConfig:
        """Return an :py:class:`EmbeddingConfig` with vector dimension resolved."""
        return self.config


def make_embedding_config(**overrides: Any) -> EmbeddingConfig:
    """Build an :py:class:`EmbeddingConfig` from settings and overrides."""
    settings = get_settings()
    return EmbeddingConfig(
        model_name=overrides.get("model_name") or settings.embedding_model,
        device=overrides.get("device") or settings.embedding_device,
        vector_dimension=overrides.get("vector_dimension"),
        normalize=overrides.get("normalize", True),
        pooling=overrides.get("pooling", "mean"),
    )
