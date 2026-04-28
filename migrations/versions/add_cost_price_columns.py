"""add cost_price to bill_item and return_item

Revision ID: add_cost_price_columns
Revises: f42c847a586d
Create Date: 2026-04-28 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_cost_price_columns'
down_revision = 'f42c847a586d'
branch_labels = None
depends_on = None


def upgrade():
    # Add cost_price column to bill_item table
    op.add_column('bill_item', sa.Column('cost_price', sa.Float(), nullable=True))
    
    # Add cost_price column to return_item table
    op.add_column('return_item', sa.Column('cost_price', sa.Float(), nullable=True))


def downgrade():
    # Remove cost_price column from return_item table
    op.drop_column('return_item', 'cost_price')
    
    # Remove cost_price column from bill_item table
    op.drop_column('bill_item', 'cost_price')