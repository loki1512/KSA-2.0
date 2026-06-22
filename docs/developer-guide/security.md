# Security Guide

## Authentication

KSA uses Flask-Security with SQLAlchemy-backed `User` and `Role` models.

Login route:

```text
/login
```

Logout route:

```text
/logout
```

## Roles

Supported roles:

- `admin`
- `customer`

Admin-only operations must use `@admin_required`.

Customer pages must verify that the logged-in user can access the requested customer data.

## API Unauthorized Behavior

`app.py` customizes unauthenticated API behavior:

- API routes return JSON `401`.
- Page routes redirect to `/login`.

## Secrets

Required secrets:

- `SECRET_KEY`
- `SECURITY_PASSWORD_SALT`

Production deployments must not use development defaults.

## Customer Data Rules

Protect:

- Phone numbers.
- Addresses.
- Ledger balances.
- Payment history.
- Referral relationships.

Never expose another customer's ledger to a customer user.

## File Uploads

Offer image uploads are handled in `routes/offers.py`.

Guidelines:

- Restrict accepted file types.
- Store images in the configured location.
- Avoid trusting original filenames as safe paths.
- Keep public URLs scoped to offer image storage.

## Frontend Safety

When rendering user-controlled strings in JavaScript-built HTML:

- Escape `&`, `<`, `>`, `"`, and `'`.
- Avoid inserting raw HTML unless the content has been intentionally sanitized.

## Operational Security

- Change the seeded admin password after first setup.
- Use HTTPS in production.
- Keep Supabase service keys server-side only.
- Avoid logging secrets or customer financial data.

