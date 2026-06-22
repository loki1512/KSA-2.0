# Deployment And Operations

## Runtime

The app runs as a Flask application. `app.py` exposes `app = create_app()`.

Local command:

```powershell
python app.py
```

Production should run through a WSGI server or platform command.

## Docker

The repository includes a `Dockerfile`.

Typical build:

```bash
docker build -t ksa-app .
```

Typical run:

```bash
docker run -p 5000:5000 --env-file .env ksa-app
```

## Environment Variables

```env
SECRET_KEY=
SECURITY_PASSWORD_SALT=
SQLITE_DB_URL=
DATABASE_URL=
SUPABASE_DB_URL=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=offer-images
```

## Database Behavior

The app prefers Postgres/Supabase if configured and reachable. If not reachable, it falls back to SQLite.

For production, verify logs on startup to ensure the intended database is being used.

## Static Assets

Static assets are served from `static/`.

The PWA service worker caches static files. For deployed frontend changes:

- Update asset query strings in templates.
- Consider bumping service worker cache name if the app shell changes.

## Health Checks

Use:

```text
/api/health
```

Expected:

```json
{ "status": "ok" }
```

## Migrations

Before deploying schema changes:

1. Generate migration locally.
2. Review migration file.
3. Apply to staging.
4. Apply to production.

Commands:

```bash
flask db migrate -m "change name"
flask db upgrade
```

## Deployment Checklist

- Environment variables configured.
- Production database reachable.
- Admin password changed.
- Migrations applied.
- Static asset cache versions updated.
- Health endpoint passing.
- Login works.
- Catalogue search works.
- Billing workflow works.
- Ledger/payment/return flows smoke-tested.

