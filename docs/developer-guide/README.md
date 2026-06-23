# Developer Guide

This guide is the engineering handbook for KSA. It is written for developers who need to run, debug, extend, review, and ship the Flask application safely.

## Guide Pages

- [Getting Started](getting-started.md)
- [Architecture](architecture.md)
- [Data Model](data-model.md)
- [Backend Guide](backend.md)
- [API Guide](api.md)
- [Interactive Analytics Dashboard](analytics-dashboard.md)
- [Unique Features And Business Decisions](unique-features-and-business-decisions.md)
- [Frontend Guide](frontend.md)
- [Testing And Quality](testing.md)
- [Security Guide](security.md)
- [Deployment And Operations](deployment.md)
- [Contribution Workflow](contributing.md)

## Engineering Principles

- Keep counter workflows fast.
- Preserve ledger and wallet correctness over convenience.
- Prefer small, page-scoped frontend changes unless a shared pattern already exists.
- Keep route behavior explicit and protected by the correct role decorator.
- Treat printed/shared estimates as customer-facing documents.
- Keep catalogue and cost data accurate enough to support later margin reporting.

## Repository Map

```text
app.py                  Flask application factory, auth setup, blueprint registration
auth_helpers.py         Role/access helpers
dashboard.py            Daily and period dashboard aggregation/routes
extensions.py           Shared Flask extension instances
models.py               SQLAlchemy data model
routes/                 Page and API blueprints
templates/              Jinja templates
static/css/             Page and shell styles
static/js/              Page scripts
static/images/          Logos, PWA icons, screenshots
migrations/             Alembic migration history
requirements.txt        Python dependencies
Dockerfile              Container build definition
```

## First Things To Read

1. [Getting Started](getting-started.md)
2. [Architecture](architecture.md)
3. [Data Model](data-model.md)
4. [Backend Guide](backend.md)
5. [Frontend Guide](frontend.md)
