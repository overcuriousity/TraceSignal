"""source time_offset_seconds (clock-skew correction)

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-09 00:00:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Analyst-declared per-source clock-skew correction (W2), applied at query
    # time. server_default "0" backfills existing rows and keeps the column
    # non-null on SQLite (tests) and Postgres alike.
    op.add_column(
        "sources",
        sa.Column(
            "time_offset_seconds",
            sa.BigInteger(),
            nullable=False,
            server_default="0",
        ),
    )


def downgrade() -> None:
    op.drop_column("sources", "time_offset_seconds")
