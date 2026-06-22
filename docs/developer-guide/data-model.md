# Data Model

## Model List

Core models live in `models.py`.

| Model | Purpose |
| --- | --- |
| `User` | Flask-Security account |
| `Role` | Flask-Security role |
| `Customer` | Retail customer profile |
| `Wallet` | Customer wallet/return balance |
| `Transaction` | Ledger entry for sales, payments, returns, settlements |
| `Item` | Catalogue item and price data |
| `Bill` | Sale header |
| `BillItem` | Sale line item |
| `Return` | Return/refund header |
| `ReturnItem` | Return/refund line item |
| `Payment` | Payment record |
| `Offer` | Public/admin offer |
| `Lead` | Customer interest generated from offers |

## Important Relationships

- `Customer.user_id -> User.id`
- `Wallet.customer_id -> Customer.id`
- `Bill.customer_id -> Customer.id`
- `BillItem.bill_id -> Bill.id`
- `Payment.customer_id -> Customer.id`
- `Transaction.customer_id -> Customer.id`
- `Return.customer_id -> Customer.id`
- `ReturnItem.return_id -> Return.id`
- `Lead.customer_id -> Customer.id`
- `Lead.offer_id -> Offer.id`

## Ledger Semantics

`Transaction` is the source of truth for customer ledger history.

Recommended conventions:

- Sales increase what the customer owes.
- Payments reduce what the customer owes.
- Refunds/returns should create traceable entries with a `reference_type`.
- Settlements should be explicit transactions, not silent deletion or mutation.

Always preserve `reference_type` and `reference_id` when a transaction is tied to a bill, payment, return, or settlement.

## Catalogue Price Fields

`Item` price fields:

- `default_price`: required base/default value.
- `max_price`: optional MRP or ceiling.
- `final_price`: optional lower/selling price.
- `cost_price`: optional business cost.
- `updated_at`: maintained by SQLAlchemy `onupdate`.

Important rules:

- `cost_price = 0` is valid.
- Blank cost price should be stored as `NULL`.
- Cost price must not be negative.
- `default_price` cannot exceed `max_price`.
- `final_price` cannot exceed `max_price`.

## Cost Snapshots

`BillItem` and `ReturnItem` have `cost_price` fields. These are snapshots and should not be recalculated from the current catalogue item after the document is created. This preserves historical margin data even if catalogue costs change later.

## Schema Changes

Use migrations for intentional schema changes:

```powershell
flask db migrate -m "describe change"
flask db upgrade
```

The app also calls `db.create_all()` at startup, but migrations are still the preferred way to document schema evolution.

