"""agent mcp tokens

Revision ID: 0008
Revises: 0007
Create Date: 2026-07-19

Adds ``agent_tokens``, the scoped personal access tokens for the external
MCP endpoint (docs/AGENT.md). Each token is bound to exactly one case +
timeline at creation; only the SHA-256 hash is stored.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agent_tokens",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("case_id", sa.String(length=64), nullable=False),
        sa.Column("timeline_id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_agent_tokens_token_hash"), "agent_tokens", ["token_hash"], unique=True)
    op.create_index(op.f("ix_agent_tokens_case_id"), "agent_tokens", ["case_id"], unique=False)
    op.create_index(
        op.f("ix_agent_tokens_timeline_id"), "agent_tokens", ["timeline_id"], unique=False
    )
    op.create_index(op.f("ix_agent_tokens_user_id"), "agent_tokens", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_agent_tokens_user_id"), table_name="agent_tokens")
    op.drop_index(op.f("ix_agent_tokens_timeline_id"), table_name="agent_tokens")
    op.drop_index(op.f("ix_agent_tokens_case_id"), table_name="agent_tokens")
    op.drop_index(op.f("ix_agent_tokens_token_hash"), table_name="agent_tokens")
    op.drop_table("agent_tokens")
