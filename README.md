# KSA 3.6 | Retail Billing, Credit, Catalogue, and Offers Platform

KSA is a Flask-based retail operations app for Kumara Swami Agencies. It is built around the day-to-day counter workflow: quick billing, negotiated prices, customer credit, returns, catalogue maintenance, offers, and ledger visibility.

The app is designed for a practical retail environment where item prices change often, customers may buy on credit, and every bill, payment, return, and settlement should remain traceable.

---

## Changes Since The Previous README

The previous README was last updated at commit `654b870` (`Added ReadMe - Version 3.5 Completed`). Since then, the app has gained these notable changes:

- Bill documents now use **Estimate** wording instead of Invoice wording in the admin bill detail and public print view.
- Bill detail now supports a **Display mode** selector:
  - Show MRP + Discount
  - Show final unit prices only
- Public estimate links accept `display_mode`, so shared/printed documents can hide MRP and discount columns when needed.
- WhatsApp sharing now uses the current `ksa-3-0.onrender.com` estimate and customer ledger URLs.
- Public estimate rendering now uses the linked `Customer` object when available, including phone, address, and village.
- Admin offers now load the dedicated `admin_offers.css` stylesheet instead of the public offers stylesheet.
- Catalogue management now includes **Update Costs** mode:
  - toggle button with visible on/off state
  - editable `cost_price` inputs directly in the catalogue table
  - keyboard flow for updating multiple rows one by one
  - unsaved-row highlighting and save/discard controls
  - category filter and "Missing cost only" filter while cost mode is active
  - search remains functional in cost-update mode
  - bulk cost update endpoint: `PATCH /api/items/costs`
- `/api/items` now returns `updated_at` for catalogue rows and preserves `cost_price = 0` correctly.

---

## Core Capabilities

### Billing And Estimates

- Create bills from catalogue-backed item search.
- Add line-level quantity, MRP/unit price, discounts, final rate, and final amount.
- Edit existing bills from `/bills/edit/<bill_id>`.
- View bill details from `/bills/<bill_id>`.
- Print or share estimates.
- Choose whether estimates show MRP/discount columns or only final unit prices.
- Customer-linked bills generate customer ledger activity automatically.

### Catalogue Management

Catalogue records include:

- `name`
- `category`
- `default_price`
- `max_price`
- `final_price`
- `cost_price`
- `updated_at`

Catalogue features:

- Multi-keyword search by item name or category.
- Add, view, edit, and delete catalogue items.
- Import catalogue records from Excel.
- Export the full catalogue to Excel.
- Quickly update normal price fields through existing item APIs.
- Batch-update cost prices through the new **Update Costs** mode.

### Batch Cost Update Workflow

The Catalogue page has a dedicated cost maintenance workflow for updating many items without searching and opening each item separately.

1. Open `/catalog`.
2. Click `Update Costs: Off` to switch it on.
3. Use the search bar, category filter, or `Missing cost only` filter.
4. Edit cost prices directly in the table.
5. Press Enter to move to the next visible cost field.
6. Review unsaved rows.
7. Click `Save All` to send one bulk update request.

Endpoint:

```http
PATCH /api/items/costs
```

Payload:

```json
{
  "items": [
    { "id": 12, "cost_price": 48.5 },
    { "id": 13, "cost_price": null }
  ]
}
```

### Customer Credit And Ledger

- Customers have profile data, wallet records, referral codes, customer type metadata, and transaction history.
- Sales create positive ledger transactions.
- Payments, refunds, and some adjustments reduce outstanding credit.
- Admins can view customer ledgers from `/customers/<customer_id>/ledger`.
- Customers can view their own account from `/my-account`.
- Ledger actions support payment, settlement, referral updates, and customer management.

### Returns

- Admins create returns from `/returns/new`.
- Return lines store item name, quantity, refund amount, unit price, and available catalogue cost price.
- Returns create refund transactions and wallet impact.
- Return detail pages can be viewed and printed.
- Deleting a return reverses the related wallet/ledger effects.

### Transactions

- `/transactions` provides an admin transaction feed.
- Transactions include reference links to bills, returns, payments, or settlements when available.
- Transaction data can be exported to Excel from the frontend.

### Dashboards

- Daily dashboard at `/`.
- Period dashboards for monthly, quarterly, and yearly summaries.
- Dashboard metrics include sales, payments, settlements, wallet impact, outstanding credit, customer activity, and hourly/period performance.

### Offers And Leads

- Public offer pages are available at `/offers` and `/offers/<offer_id>`.
- Admin offer management is available at `/admin/offers`.
- Offers support product name, description, active/hidden status, and image upload.
- Public offer interest can create leads.
- Admins can track lead status: Interested, Contacted, Converted, Rejected.
- Offer images can use local static storage or configured Supabase storage.

### Historical Database Cleaner

- Admin tool for cleaning old bill item names after catalogue naming corrections.
- Helps find high-frequency non-catalogue item names.
- Supports matching historical bill item names to catalogue items and updating selected historical names.

### Authentication And Roles

- Uses Flask-Security with SQLAlchemy.
- Roles:
  - `admin`
  - `customer`
- Admin-only routes use `@admin_required`.
- Customer pages use authenticated access and are restricted to the logged-in customer.
- Admin user and roles are seeded automatically if needed.

### PWA Support

- Manifest is injected into HTML responses.
- Service worker is served from `/sw.js`.
- PWA icons live under `static/images/`.
- Static assets may need cache-busting query strings when frontend behavior changes.

---

## Architecture

For deeper engineering documentation, see the [Developer Guide](docs/developer-guide/README.md).

### Backend

- `app.py` creates the Flask app, configures auth, registers blueprints, handles PWA injection, initializes tables, and seeds roles/users.
- `models.py` defines the core SQLAlchemy models.
- `dashboard.py` owns dashboard routes and dashboard aggregation logic.
- `auth_helpers.py` contains role and access helpers.
- `extensions.py` exposes the shared SQLAlchemy extension.

### Blueprints

- `routes/pages.py` - page routes for billing, catalogue, bills, customers, returns, transactions, and account views.
- `routes/items.py` - catalogue search, CRUD, import, price patching, and bulk cost updates.
- `routes/bills.py` - bill create/update/delete APIs.
- `routes/invoice.py` - public/authenticated estimate rendering.
- `routes/customers.py` - customer CRUD and customer search.
- `routes/ledger.py` - customer ledger APIs and settlement behavior.
- `routes/payments.py` - payment APIs.
- `routes/returns.py` - return/refund APIs.
- `routes/transactions.py` - paginated transaction feed.
- `routes/account.py` - customer self-service and admin utilities.
- `routes/offers.py` - public offers, admin offers, image handling, and lead management.

### Frontend

- Templates live in `templates/`.
- Page-specific JavaScript lives in `static/js/`.
- Page-specific CSS lives in `static/css/`.
- Shared app shell styling is in `static/css/app_shell.css`.

---

## Data Model Overview

Primary models:

- `User`, `Role`
- `Customer`
- `Wallet`
- `Transaction`
- `Item`
- `Bill`, `BillItem`
- `Return`, `ReturnItem`
- `Payment`
- `Offer`, `Lead`

Important data relationships:

- `Customer` can have one linked `User`.
- `Customer` has one `Wallet`.
- `Customer` has many `Bill`, `Payment`, `Transaction`, and `Lead` records.
- `Bill` has many `BillItem` records.
- `Return` has many `ReturnItem` records.
- `Offer` has many `Lead` records.

---

## Important Routes

### Admin Pages

- `/` - daily dashboard
- `/dashboard/monthly`
- `/dashboard/quarterly`
- `/dashboard/yearly`
- `/billing`
- `/catalog`
- `/bills`
- `/bills/<bill_id>`
- `/bills/edit/<bill_id>`
- `/customers`
- `/customers/<customer_id>/ledger`
- `/transactions`
- `/returns/new`
- `/returns/view/<return_id>`
- `/admin/profile`
- `/admin/offers`
- `/admin/historical-db-cleaner`

### Customer/Public Pages

- `/login`
- `/my-account`
- `/offers`
- `/offers/<offer_id>`
- `/invoice/<bill_id>`

### Health/PWA

- `/api/health`
- `/health`
- `/sw.js`

---

## Setup

1. Create and activate a Python virtual environment.

2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Configure environment variables as needed:

```env
SECRET_KEY=change-me
SECURITY_PASSWORD_SALT=change-me
SQLITE_DB_URL=sqlite:///db.sqlite3
DATABASE_URL=
SUPABASE_DB_URL=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=offer-images
```

4. Run the app:

```bash
python app.py
```

Default local URL:

```text
http://127.0.0.1:5000
```

If a Postgres/Supabase URL is configured but unavailable, the app falls back to SQLite.

---

## Database And Migrations

- Migrations live in `migrations/`.
- Existing migrations include the initial schema, offers/leads tables, and cost price columns.
- The app also calls `db.create_all()` during startup to ensure missing tables exist.

For migration-based workflows, use Flask-Migrate/Alembic commands configured for the project.

---

## Excel Import/Export

Catalogue import expects a header row with:

```text
name, category, default_price, max_price, final_price, cost_price
```

Required:

- `name`
- `default_price`

Optional:

- `category`
- `max_price`
- `final_price`
- `cost_price`

Existing items are matched by name and updated.

---

## Screenshots

Screenshots are stored under:

```text
static/images/screenshots/
```

Current screenshot assets include:

- `catalogue_search.png`
- `customer_ledger.png`
- `customer_login.png`
- `monthly_dashboard.png`
- `returns.png`

---

## Operational Notes

- Static files can be cached by the service worker. Use versioned query strings on changed JS/CSS assets when frontend behavior changes.
- `cost_price = 0` is valid and should not be treated as missing.
- Public estimate display can be controlled with `display_mode=mrp_discount` or `display_mode=final_only`.
- Admin offer styling is intentionally separated from public offer styling.

---

## Current Roadmap

- Keep improving catalogue maintenance speed for large inventories.
- Add stronger server-side pagination where large ledgers or catalogues become heavy.
- Expand cost/profit reporting from stored `cost_price` snapshots.
- Add inventory velocity and stock-out insights from historical sales.

---

## Summary

KSA is a practical retail ERP for fast counter work and clean back-office records. It connects billing, estimates, catalogue updates, customer credit, returns, offers, and transaction history into one workflow that matches how the business actually operates.
