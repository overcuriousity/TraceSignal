"""AgentToken store + API + MCP auth tests."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest


@pytest.mark.asyncio
async def test_agent_token_store_roundtrip(store):
    await store.init_schema()

    row = await store.create_agent_token("c1", "t1", "u1", "claude-code", "a" * 64)
    assert row.id and row.revoked_at is None

    listed = await store.list_agent_tokens("c1", "t1")
    assert [t.id for t in listed] == [row.id]
    assert "token_hash" not in row.to_dict()

    by_hash = await store.get_agent_token_by_hash("a" * 64)
    assert by_hash is not None and by_hash.id == row.id
    assert await store.get_agent_token_by_hash("b" * 64) is None

    assert await store.revoke_agent_token("c1", row.id) is True
    revoked = await store.get_agent_token_by_hash("a" * 64)
    assert revoked is not None and revoked.revoked_at is not None
    assert await store.revoke_agent_token("c1", "missing") is False


@pytest.mark.asyncio
async def test_agent_token_expiry_field(store):
    await store.init_schema()

    exp = datetime.now(UTC) + timedelta(days=30)
    row = await store.create_agent_token("c1", "t1", "u1", "temp", "c" * 64, expires_at=exp)
    assert row.expires_at is not None
