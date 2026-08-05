"""add card_last4 to users

Revision ID: a1b2c3d4e5f6
Revises: 0bbfa306194a
Create Date: 2026-06-23 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = '0bbfa306194a'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('card_last4', sa.String(length=4), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'card_last4')
