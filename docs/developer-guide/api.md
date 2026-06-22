# API Guide

This page documents important internal APIs used by the frontend. Routes generally require authentication; admin APIs require admin access.

## Catalogue APIs

### Search Items

```http
GET /api/items/search?q=<query>
```

Used by billing and return item search.

Returns a short list of matching catalogue items.

### List Items

```http
GET /api/items
```

Returns all catalogue items for the Catalogue page.

Important fields:

- `id`
- `name`
- `category`
- `default_price`
- `max_price`
- `final_price`
- `cost_price`
- `updated_at`

### Create Item

```http
POST /api/items
Content-Type: application/json
```

Required:

- `name`
- `default_price`

Optional:

- `category`
- `max_price`
- `final_price`
- `cost_price`

### Update Item

```http
PUT /api/items/<item_id>
Content-Type: application/json
```

Full item update. Use this when name/category or multiple price fields are edited.

### Patch Item Price

```http
PATCH /api/items/<item_id>/price
Content-Type: application/json
```

Lightweight price update for default, max, and final prices.

### Patch Item Costs

```http
PATCH /api/items/costs
Content-Type: application/json
```

Bulk cost maintenance endpoint used by Catalogue Update Costs mode.

Payload:

```json
{
  "items": [
    { "id": 1, "cost_price": 100.25 },
    { "id": 2, "cost_price": null }
  ]
}
```

Rules:

- `items` must be a non-empty list.
- Each update needs an integer `id`.
- `cost_price` can be `null`.
- `cost_price` must be non-negative when provided.

### Delete Item

```http
DELETE /api/items/<item_id>
```

Deletes the catalogue item.

### Import Items

```http
POST /api/items/import
Content-Type: multipart/form-data
```

File column format:

```text
name, category, default_price, max_price, final_price, cost_price
```

## Bill APIs

Bill APIs live in `routes/bills.py`.

Common behavior:

- Create and update bill headers and line items.
- Store line-level discounts.
- Preserve final item amounts.
- Create/update transaction effects.

Use the route file as the source of truth before changing request shapes.

## Ledger And Payment APIs

Ledger and payment APIs live in:

- `routes/ledger.py`
- `routes/payments.py`
- `routes/transactions.py`

Guidelines:

- Preserve transaction references.
- Do not silently mutate historical transactions unless the route is explicitly for correction.
- Keep settlement behavior auditable.

## Returns APIs

Return APIs live in `routes/returns.py`.

Guidelines:

- Capture `cost_price` from catalogue at return creation time.
- Keep wallet and transaction effects consistent.
- Deleting a return must reverse the original effects.

## Offers APIs

Offer and lead APIs live in `routes/offers.py`.

Guidelines:

- Admin offer routes require admin access.
- Public offer pages should expose only active offers.
- Leads should keep offer/customer references when possible.

