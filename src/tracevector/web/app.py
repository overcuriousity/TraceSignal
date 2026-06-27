"""Entry point for the TraceVector web server."""

import uvicorn

from tracevector.api.main import create_app

app = create_app()


def start() -> None:
    """Start the Uvicorn server."""
    uvicorn.run(
        "tracevector.web.app:app",
        host="0.0.0.0",
        port=8080,
        reload=True,
    )


if __name__ == "__main__":
    start()
