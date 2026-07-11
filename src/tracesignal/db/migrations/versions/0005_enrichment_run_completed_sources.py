"""Add completed_source_ids to the enrichment job-run marker.

Records, per in-flight enrichment job, which sources finished staging —
appended durably as the run progresses. Crash recovery uses it to grant
provenance to exactly the finished sources instead of re-enriching the whole
job (previously reconciliation granted provenance to none of them).

Revision ID: 0005
Revises: 0004
Create Date: 2026-07-11
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "enrichment_job_runs",
        sa.Column("completed_source_ids", sa.JSON(), server_default="[]", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("enrichment_job_runs", "completed_source_ids")
