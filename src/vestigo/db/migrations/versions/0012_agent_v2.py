"""agent context window, tool toggles, user preferences

Revision ID: 0012
Revises: 0011
Create Date: 2026-07-20

Three additions for the agent-v2 feature set:

- ``agent_settings``: ``context_window`` / ``compact_threshold`` drive
  history auto-compaction (NULL window = compaction off); ``disabled_tools``
  is the admin hard-deny list applied to both the in-app agent and the
  external ``/mcp`` transport.
- ``agent_conversations.disabled_tools``: the per-chat tool restriction
  frozen at conversation creation (resolved user defaults + modal choice).
- ``users.preferences``: namespaced per-user preference blob (currently
  ``agent_disabled_tools``); a JSON column rather than a table because it is
  a per-user singleton never queried by value.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("agent_settings", sa.Column("context_window", sa.Integer(), nullable=True))
    op.add_column("agent_settings", sa.Column("compact_threshold", sa.Float(), nullable=True))
    op.add_column("agent_settings", sa.Column("disabled_tools", sa.JSON(), nullable=True))
    op.add_column("agent_conversations", sa.Column("disabled_tools", sa.JSON(), nullable=True))
    op.add_column("users", sa.Column("preferences", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "preferences")
    op.drop_column("agent_conversations", "disabled_tools")
    op.drop_column("agent_settings", "disabled_tools")
    op.drop_column("agent_settings", "compact_threshold")
    op.drop_column("agent_settings", "context_window")
