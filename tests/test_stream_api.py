"""Tests for the live-collaboration event bus and the SSE stream endpoint's RBAC gate."""

from __future__ import annotations

import asyncio

import pytest

from tests.conftest import as_admin, login
from tracevector.api.routers.stream import _event_stream
from tracevector.core.events_bus import CaseEventBus, get_event_bus


class _ImmediatelyDisconnectingRequest:
    """Stand-in for a Request that reports 'disconnected' on the first check.

    httpx's ``ASGITransport`` (used by FastAPI's/Starlette's TestClient)
    fully awaits the ASGI app callable before it will report anything back
    to the caller — it can never simulate a real mid-stream client
    disconnect, so a true SSE connection opened through it deadlocks
    forever instead of completing. Exercising the generator directly (as
    the route handler does, minus the auth/RBAC dependency layer already
    covered by test_non_member_cannot_open_the_case_stream below) is the
    only way to test that it starts, yields the initial retry line, and
    exits cleanly once the client goes away.
    """

    async def is_disconnected(self) -> bool:
        return True


@pytest.mark.asyncio
async def test_event_bus_delivers_to_subscribers_of_the_same_case():
    bus = CaseEventBus()
    queue = bus.subscribe("case-1")
    bus.publish("case-1", {"type": "annotation.changed"})
    event = await asyncio.wait_for(queue.get(), timeout=1)
    assert event["type"] == "annotation.changed"


@pytest.mark.asyncio
async def test_event_bus_does_not_cross_case_boundaries():
    bus = CaseEventBus()
    queue = bus.subscribe("case-1")
    bus.publish("case-2", {"type": "annotation.changed"})
    assert queue.empty()


@pytest.mark.asyncio
async def test_event_bus_unsubscribe_stops_delivery():
    bus = CaseEventBus()
    queue = bus.subscribe("case-1")
    bus.unsubscribe("case-1", queue)
    bus.publish("case-1", {"type": "annotation.changed"})
    assert queue.empty()


def test_get_event_bus_is_a_process_wide_singleton():
    assert get_event_bus() is get_event_bus()


def test_non_member_cannot_open_the_case_stream(client, admin_bootstrap, store):
    as_admin(client, admin_bootstrap)
    case = client.post("/api/cases/", json={"name": "streamed-case"}).json()["case"]
    client.post("/api/admin/users", json={"username": "outsider3", "password": "abcdefgh12"})

    outsider_client = client.__class__(client.app)
    login(outsider_client, "outsider3", "abcdefgh12")
    resp = outsider_client.get(f"/api/cases/{case['id']}/stream")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_stream_generator_yields_retry_line_then_exits_on_disconnect():
    events = []
    async for chunk in _event_stream(_ImmediatelyDisconnectingRequest(), "case-x"):
        events.append(chunk)
    assert events == ["retry: 3000\n\n"]


@pytest.mark.asyncio
async def test_stream_generator_delivers_a_published_event_before_checking_disconnect():
    """A queued event should be delivered even though disconnect is reported
    as True on every check — the generator only checks *before* each wait,
    so anything already published prior to the check still gets its own
    iteration to be picked up."""

    class DisconnectAfterOneCheck:
        def __init__(self):
            self.checks = 0

        async def is_disconnected(self) -> bool:
            self.checks += 1
            return self.checks > 1

    bus = get_event_bus()
    request = DisconnectAfterOneCheck()
    collected = []
    gen = _event_stream(request, "case-y")
    collected.append(await gen.__anext__())  # "retry:" line
    bus.publish("case-y", {"type": "annotation.changed", "event_id": "evt-1"})
    collected.append(await gen.__anext__())
    async for chunk in gen:
        collected.append(chunk)

    assert collected[0] == "retry: 3000\n\n"
    assert '"event_id": "evt-1"' in collected[1]
