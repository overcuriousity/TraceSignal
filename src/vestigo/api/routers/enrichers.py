"""Global enricher listing — not case-scoped, informational only."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from vestigo.api.deps import get_current_user
from vestigo.db.postgres import User
from vestigo.enrichers.registry import all_enrichers, get_cached_availability

router = APIRouter(prefix="/api/enrichers", tags=["enrichers"])


@router.get("")
async def list_enrichers(user: User = Depends(get_current_user)) -> dict[str, Any]:
    """Return every registered enricher and its currently cached availability."""
    enrichers = []
    for enricher in all_enrichers():
        availability = get_cached_availability(enricher.key)
        enrichers.append(
            {
                "key": enricher.key,
                "display_name": enricher.display_name,
                "description": enricher.description,
                "output_fields": list(enricher.output_fields),
                "available": availability.available if availability else False,
                "reason": availability.reason if availability else "Not yet checked",
            }
        )
    return {"enrichers": enrichers}
