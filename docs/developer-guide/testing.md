# Testing And Quality

## Current State

The repository does not currently include a formal automated test suite. Until one is added, use a combination of syntax checks, focused manual checks, and careful route-level validation.

## Syntax Checks

Run Python compile checks on edited backend files:

```powershell
python -m py_compile routes\items.py
python -m py_compile app.py models.py dashboard.py
```

If Node.js is available, check edited JavaScript:

```powershell
node --check static\js\catalog.js
```

## Manual Smoke Test Checklist

After backend changes:

- Start the app with `python app.py`.
- Open `/api/health`.
- Login as admin.
- Visit the changed page.
- Confirm API requests return expected status codes.

After catalogue changes:

- Open `/catalog`.
- Search for an item.
- Add/edit a normal item.
- Toggle Update Costs mode.
- Filter by category.
- Toggle Missing cost only.
- Edit cost values.
- Save all.
- Reload and confirm values persisted.

After bill/estimate changes:

- Create or open a bill.
- Toggle display mode.
- Print estimate.
- Open public estimate link with `display_mode=final_only`.
- Confirm MRP/discount columns are hidden.

After ledger/returns changes:

- Create a customer.
- Create a bill.
- Record a payment.
- Create a return.
- Verify ledger and wallet values.
- Delete the return and verify reversal.

## Recommended Test Suite Roadmap

Add `pytest` coverage in this order:

1. App factory and health endpoint.
2. Auth-required and admin-required route behavior.
3. Catalogue item CRUD and validation.
4. `PATCH /api/items/costs`.
5. Bill creation and transaction creation.
6. Payments and settlements.
7. Returns and wallet reversal.
8. Offer/lead lifecycle.

## Review Checklist

Before merging:

- Does the change protect admin-only actions?
- Does it preserve ledger correctness?
- Does it validate input on the backend?
- Does it preserve existing data semantics?
- Does the frontend handle loading, empty, success, and error states?
- Does PWA cache busting need a version update?
- Does README or developer guide need an update?

