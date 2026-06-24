"""Application configuration loaded from environment variables."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """TraceVector settings."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="TV_",
        extra="ignore",
    )

    environment: str = "development"
    log_level: str = "INFO"
    secret_key: str = "change-me-in-production"
    allow_online: bool = False

    # Metadata store
    postgres_url: str = "postgresql+asyncpg://tracevector:tracevector@localhost:5432/tracevector"

    # Event store
    clickhouse_url: str = "http://localhost:8123"
    clickhouse_database: str = "tracevector"
    clickhouse_username: str = "default"
    clickhouse_password: str = ""

    # Vector store
    qdrant_url: str | None = Field(default="http://localhost:6333")
    qdrant_path: str | None = Field(default=None)
    qdrant_collection_prefix: str = "tracevector"

    # Embeddings
    embedding_model: str = "all-MiniLM-L6-v2"
    embedding_device: str = "cpu"
    embedding_batch_size: int = 64


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings."""
    return Settings()
