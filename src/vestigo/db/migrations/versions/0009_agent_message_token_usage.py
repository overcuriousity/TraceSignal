"""agent message token usage

Revision ID: 0009
Revises: 0008
Create Date: 2026-07-19

Adds ``prompt_tokens`` / ``completion_tokens`` to ``agent_messages`` — measured
LLM usage for a turn (assistant rows), NULL when not measured. Never an
estimate; see docs/AGENT.md.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("agent_messages", sa.Column("prompt_tokens", sa.Integer(), nullable=True))
    op.add_column("agent_messages", sa.Column("completion_tokens", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("agent_messages", "completion_tokens")
    op.drop_column("agent_messages", "prompt_tokens")
