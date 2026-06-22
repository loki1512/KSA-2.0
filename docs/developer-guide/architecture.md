# Architecture

## Overview

KSA is a server-rendered Flask application with page-specific JavaScript. The backend owns authentication, data persistence, business rules, and HTML rendering. The frontend enhances pages with search, tables, modals, imports, exports, and workflow controls.

## Application Startup

`app.py` performs these responsibilities:

- Loads `.env`.
- Normalizes and selects the database URL.
- Configures Flask, SQLAlchemy, and Flask-Security.
- Registers all blueprints.
- Injects PWA manifest and service worker registration into HTML responses.
- Creates missing tables.
- Seeds roles and the first admin user.
- Ensures customers have linked user accounts and customer roles.

## Request Layers

```text
Browser
  -> Flask route / blueprint
    -> auth decorator / authorization check
      -> SQLAlchemy model/query
        -> template or JSON response
```

## Blueprint Responsibilities

- `routes/pages.py` renders admin/customer pages that do not need custom API behavior.
- `routes/items.py` owns catalogue APIs, item search, import/export support, price patching, and cost batch updates.
- `routes/bills.py` owns bill creation, updates, deletion, and bill ledger effects.
- `routes/invoice.py` owns public/authenticated estimate rendering.
- `routes/customers.py` owns customer CRUD and customer search.
- `routes/ledger.py` owns customer ledger views, settlement, and ledger mutations.
- `routes/payments.py` owns payment records and transaction updates.
- `routes/returns.py` owns return/refund creation, deletion, and wallet impact.
- `routes/transactions.py` owns the paginated transaction feed.
- `routes/account.py` owns customer self-service and admin utilities.
- `routes/offers.py` owns public offers, admin offers, image handling, and leads.
- `dashboard.py` owns dashboard pages and aggregation logic.

## Frontend Structure

Each major page has:

- A Jinja template in `templates/`.
- A matching JavaScript file in `static/js/` when interactivity is needed.
- A matching CSS file in `static/css/`.

Shared shell styling lives in `static/css/app_shell.css`.

## Business-Critical Flows

### Billing

1. Admin opens `/billing`.
2. Frontend searches catalogue items through `/api/items/search`.
3. Admin creates a bill.
4. Backend stores `Bill` and `BillItem` rows.
5. Backend creates related ledger `Transaction` rows.

### Payments

1. Admin records payment.
2. Backend creates `Payment`.
3. Backend creates a negative or reducing ledger `Transaction`.
4. Customer ledger and dashboard values change.

### Returns

1. Admin creates return from `/returns/new`.
2. Backend stores `Return` and `ReturnItem` rows.
3. Cost price is captured from catalogue when available.
4. Backend updates wallet/ledger effects.

### Catalogue Cost Maintenance

1. Admin opens `/catalog`.
2. Admin toggles Update Costs mode.
3. Frontend filters visible items by search/category/missing cost.
4. Admin edits table inputs.
5. Frontend sends one `PATCH /api/items/costs`.
6. Backend validates IDs and non-negative cost values, then commits.

