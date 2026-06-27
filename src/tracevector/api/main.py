"""FastAPI application factory and API routers."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from tracevector import __version__
from tracevector.api.routers import cases, events, jobs


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="TraceVector",
        description="Local-first forensic log investigation platform.",
        version=__version__,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health", response_class=JSONResponse)
    async def health() -> dict:
        return {"status": "ok", "version": __version__}

    app.include_router(cases.router)
    app.include_router(events.router)
    app.include_router(jobs.router)

    return app
