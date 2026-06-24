"""FastAPI application factory and API routers."""

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from tracevector import __version__

FRONTEND_DIST = Path(__file__).resolve().parents[3] / "frontend" / "dist"


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="TraceVector",
        description="Local-first forensic log investigation platform.",
        version=__version__,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
    )

    @app.get("/api/health", response_class=JSONResponse)
    async def health() -> dict:
        return {"status": "ok", "version": __version__}

    if FRONTEND_DIST.is_dir():
        app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

        @app.get("/{full_path:path}")
        async def serve_frontend(full_path: str) -> FileResponse:
            file_path = FRONTEND_DIST / full_path
            if file_path.is_file():
                return FileResponse(file_path)
            return FileResponse(FRONTEND_DIST / "index.html")

    return app
