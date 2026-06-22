# Getting Started

## Prerequisites

- Python 3.11+ recommended.
- A virtual environment.
- SQLite for local development, or Postgres/Supabase for production-like testing.
- Optional: Node.js only if you add frontend tooling. The current app uses plain JavaScript loaded directly by templates.

## Local Setup

Create and activate a virtual environment:

```powershell
python -m venv myenv
.\myenv\Scripts\Activate.ps1
```

Install dependencies:

```powershell
pip install -r requirements.txt
```

Create a local `.env` if needed:

```env
SECRET_KEY=dev-secret-change-me
SECURITY_PASSWORD_SALT=dev-salt-change-me
SQLITE_DB_URL=sqlite:///db.sqlite3
DATABASE_URL=
SUPABASE_DB_URL=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=offer-images
```

Run the app:

```powershell
python app.py
```

Open:

```text
http://127.0.0.1:5000
```

## Default Admin

On first startup, the app seeds an admin account if no admin exists:

```text
email: admin@ksa.com
password: admin@123
```

Change this for real deployments.

## Database Selection

`app.py` chooses a database in this order:

1. `SUPABASE_DB_URL`
2. `DATABASE_URL`
3. `SQLITE_DB_URL`

If a Postgres URL is configured but cannot be reached, the app falls back to SQLite.

## Health Checks

Use:

```text
/api/health
/health
```

Expected health API response:

```json
{ "status": "ok" }
```

## Common Local Issues

- If static JS/CSS changes do not appear, hard refresh the browser. The service worker caches static assets.
- If a frontend file is changed, use a versioned query string in the template, for example `catalog.js?v=20260622-cost-toggle-filter`.
- If login redirects happen during API checks, authenticate first or test with Flask's test client.
- If Postgres is slow/unavailable locally, unset `DATABASE_URL` and use SQLite.

