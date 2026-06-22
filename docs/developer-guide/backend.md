# Backend Guide

## Route Design

Use blueprints by domain:

- Catalogue work belongs in `routes/items.py`.
- Bill work belongs in `routes/bills.py`.
- Ledger/customer balance work belongs in `routes/ledger.py`, `routes/payments.py`, or `routes/returns.py`.
- Page rendering belongs in `routes/pages.py` unless a domain blueprint already owns the page.

## Authorization

Use the correct decorator:

```python
@admin_required
def admin_only_route():
    ...
```

For authenticated customer routes:

```python
@auth_required()
def customer_route():
    ...
```

For mixed admin/customer visibility, explicitly check ownership or role with helpers from `auth_helpers.py`.

## JSON API Style

Prefer:

- JSON request body for create/update APIs.
- Clear validation errors with HTTP 400.
- `404` when the referenced record does not exist.
- `401` for unauthenticated API requests.
- `403` for authenticated but unauthorized requests.

Example:

```python
if not isinstance(updates, list) or not updates:
    return jsonify({"error": "items are required"}), 400
```

## Database Writes

Use one transaction per logical user action.

Good examples:

- Create bill, bill items, and ledger transaction together.
- Create return, return items, wallet effect, and refund transaction together.
- Bulk update all edited cost prices in one commit.

Avoid partial commits inside loops unless there is a clear recovery strategy.

## Validation

Validate at route boundaries:

- Required fields.
- Numeric types.
- Non-negative money fields.
- Relationship ownership.
- Duplicate names where uniqueness matters.

Do not rely only on frontend validation.

## Money Values

The current app uses `Float` in several historical places and `Numeric` for catalogue `cost_price`. When adding new money fields, prefer `Numeric(10, 2)` unless compatibility with existing float fields is required.

When returning `Numeric` through JSON, convert it to `float` or string intentionally.

## Error Handling

For API endpoints, return JSON:

```python
return jsonify({"error": "message"}), 400
```

For page routes, use `get_or_404()` or `abort(404)` where appropriate.

## Adding A New Backend Feature

1. Choose the owning blueprint.
2. Add or update models only if the behavior requires persisted state.
3. Add migration if schema changes.
4. Add route validation.
5. Add role/ownership protection.
6. Update the relevant template/JS.
7. Add docs if the workflow or API is developer-facing.
8. Run syntax checks and relevant manual workflow checks.

