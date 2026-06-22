# Contribution Workflow

## Branching

Use focused branches:

```text
feature/catalog-cost-update
fix/estimate-display-mode
docs/developer-guide
```

## Commit Style

Keep commits small and behavior-oriented:

```text
Add catalogue batch cost update endpoint
Keep catalogue search visible in cost mode
Document developer setup workflow
```

## Before You Start

1. Pull the latest code.
2. Check `git status`.
3. Read relevant route/template/JS/CSS files.
4. Identify the owning domain.
5. Keep unrelated files unchanged.

## During Development

- Prefer existing patterns.
- Keep frontend changes page-scoped unless shared behavior is intentional.
- Keep backend validation close to the route.
- Protect admin-only operations.
- Update docs for new workflows or APIs.

## Before Commit

Run applicable checks:

```powershell
python -m py_compile app.py models.py dashboard.py
python -m py_compile routes\items.py
```

Manual smoke test the changed workflow.

Check diff:

```powershell
git diff --stat
git diff
```

## Pull Request Checklist

- Summary of user-facing changes.
- Summary of backend/API changes.
- Screenshots for UI changes when practical.
- Manual test steps.
- Migration notes if schema changed.
- Deployment notes if environment/static cache behavior changed.

## Code Review Standards

Reviews should prioritize:

- Data correctness.
- Ledger/wallet consistency.
- Auth and access control.
- Input validation.
- Regression risk in billing, returns, payments, and catalogue search.
- UI workflow clarity.

