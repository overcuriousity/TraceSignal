"""The SPA catch-all must not serve anything outside `frontend/dist`.

The catch-all is deliberately unauthenticated — it is how the browser gets the
app shell before anyone has logged in. That makes any path handling inside it
directly reachable by the internet: joining the request path onto the dist
directory and letting `.is_file()` resolve a `..` turned it into an arbitrary
read of every file the service account can open (the deployment's own `.env`
included).

These tests drive the ASGI app with a *raw*, unnormalized path on purpose.
`TestClient`/httpx collapse `..` client-side before the request is ever sent,
and so does nginx by default — but neither uvicorn's parser nor Starlette's
router does, so a hand-written request line reaches the handler intact. A test
that goes through httpx proves nothing here.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

import vestigo.api.main as api_main
from vestigo.api.main import create_app


@pytest.fixture()
def dist(tmp_path: Path, monkeypatch) -> Path:
    """A fake built frontend, with a secret sitting next to it."""
    dist_dir = tmp_path / "dist"
    dist_dir.mkdir()
    (dist_dir / "index.html").write_text("<!doctype html><title>shell</title>")
    (dist_dir / "favicon.svg").write_text("<svg/>")
    (tmp_path / "secret.env").write_text("VESTIGO_AGENT_API_KEY=sk-do-not-leak")
    monkeypatch.setattr(api_main, "_FRONTEND_DIST", dist_dir)
    return dist_dir


async def _raw_get(app: Any, raw_path: str) -> tuple[int, bytes]:
    """Send `raw_path` verbatim — no URL normalization anywhere in the way."""
    status = 0
    body = b""

    async def receive() -> dict[str, Any]:
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message: dict[str, Any]) -> None:
        nonlocal status, body
        if message["type"] == "http.response.start":
            status = message["status"]
        body += message.get("body", b"")

    await app(
        {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": raw_path,
            "raw_path": raw_path.encode(),
            "query_string": b"",
            "headers": [(b"host", b"testserver")],
            "client": ("203.0.113.1", 1234),
            "server": ("testserver", 80),
            "root_path": "",
        },
        receive,
        send,
    )
    return status, body


@pytest.mark.parametrize(
    "path",
    [
        "/../secret.env",
        "/../../../../../../../../etc/passwd",
        "/assets/../../secret.env",
        "/%2e%2e/secret.env",
        "/....//secret.env",
    ],
)
async def test_traversal_never_escapes_dist(dist, path):
    """Every one of these must fall through to the shell, not to a file."""
    status, body = await _raw_get(create_app(), path)
    assert status == 200
    assert b"do-not-leak" not in body
    assert b"root:x:0:0" not in body
    assert b"<title>shell</title>" in body


async def test_a_symlink_out_of_dist_is_not_followed(dist, tmp_path):
    """`resolve()` before the containment check, so a symlink planted inside
    dist (by a build step, say) cannot be used as the escape hatch either."""
    (dist / "leak.env").symlink_to(tmp_path / "secret.env")
    status, body = await _raw_get(create_app(), "/leak.env")
    assert status == 200
    assert b"do-not-leak" not in body
    assert b"<title>shell</title>" in body


async def test_real_static_files_still_serve(dist):
    status, body = await _raw_get(create_app(), "/favicon.svg")
    assert status == 200
    assert body == b"<svg/>"


async def test_unknown_client_routes_get_the_shell(dist):
    """The whole point of the catch-all: deep links into the SPA."""
    status, body = await _raw_get(create_app(), "/cases/abc/explore")
    assert status == 200
    assert b"<title>shell</title>" in body
