"""agent settings

Revision ID: 0011
Revises: 0010
Create Date: 2026-07-19

Adds ``agent_settings`` — the single instance-wide row of AI agent
configuration set by admins (A7, docs/AGENT.md). Pinned at ``id="global"``;
any field left ``NULL`` falls back to the corresponding ``VESTIGO_AGENT_*``
environment variable at resolution time (env always wins per field — see the
resolver that consumes this row). ``api_key`` is stored as plaintext here and
masked to a boolean at the API/store ``to_dict`` layer.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agent_settings",
        sa.Column("id", sa.String(length=16), nullable=False),
        sa.Column("model", sa.String(length=255), nullable=True),
        sa.Column("provider", sa.String(length=32), nullable=True),
        sa.Column("api_base_url", sa.String(length=512), nullable=True),
        sa.Column("api_key", sa.Text(), nullable=True),
        sa.Column("user_agent", sa.String(length=255), nullable=True),
        sa.Column("extra_headers", sa.JSON(), nullable=True),
        sa.Column("max_turns", sa.Integer(), nullable=True),
        sa.Column("reasoning_effort", sa.String(length=16), nullable=True),
        sa.Column("updated_by", sa.String(length=64), nullable=True),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("agent_settings")
