"""add offers and leads tables

Revision ID: add_offers_and_leads
Revises: add_cost_price_columns
Create Date: 2026-05-05 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_offers_and_leads'
down_revision = 'add_cost_price_columns'
branch_labels = None
depends_on = None


def upgrade():
    # Create offer table
    op.create_table(
        'offer',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('product_name', sa.String(255), nullable=False),
        sa.Column('offer_description', sa.Text(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('image_path', sa.String(255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create lead table
    op.create_table(
        'lead',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('customer_id', sa.Integer(), nullable=False),
        sa.Column('offer_id', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(50), nullable=False, server_default='Interested'),
        sa.Column('timestamp', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['customer_id'], ['customer.id'], ),
        sa.ForeignKeyConstraint(['offer_id'], ['offer.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create indexes for performance
    op.create_index('ix_lead_customer_id', 'lead', ['customer_id'])
    op.create_index('ix_lead_offer_id', 'lead', ['offer_id'])
    op.create_index('ix_lead_timestamp', 'lead', ['timestamp'])


def downgrade():
    # Drop indexes
    op.drop_index('ix_lead_timestamp', table_name='lead')
    op.drop_index('ix_lead_offer_id', table_name='lead')
    op.drop_index('ix_lead_customer_id', table_name='lead')
    
    # Drop lead table
    op.drop_table('lead')
    
    # Drop offer table
    op.drop_table('offer')
