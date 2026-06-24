"""PostgreSQL connection and metadata models."""

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from tracevector.core.config import get_settings


class PostgresStore:
    """Async PostgreSQL store for metadata."""

    def __init__(self, url: str | None = None) -> None:
        self.url = url or get_settings().postgres_url
        self.engine = create_async_engine(self.url, echo=False, future=True)
        self.session_factory = async_sessionmaker(
            self.engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )
