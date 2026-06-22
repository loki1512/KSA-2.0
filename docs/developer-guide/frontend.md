# Frontend Guide

## Stack

The frontend is server-rendered Jinja plus page-specific vanilla JavaScript and CSS.

There is no bundler in the current workflow.

## File Conventions

Use one template, one CSS file, and one JS file per substantial page:

```text
templates/catalog.html
static/css/catalog.css
static/js/catalog.js
```

Shared shell styles belong in:

```text
static/css/app_shell.css
```

## JavaScript Conventions

- Use `'use strict';`.
- Keep state near the top of the page script.
- Keep DOM IDs stable and explicit.
- Avoid cross-page global dependencies.
- Expose functions on `window` only when templates use inline handlers.
- Validate inputs before sending API requests.
- Keep fetch error messages user-readable.

Example:

```javascript
window.saveCatalogItem = saveCatalogItem;
```

## CSS Conventions

- Prefer page-scoped classes.
- Match the existing visual system: restrained cards, clear tables, compact controls.
- Keep table layouts stable.
- Use responsive rules for narrow screens.
- Do not hide critical workflow controls in mode-specific CSS unless there is an explicit replacement.

## PWA And Cache Busting

The service worker caches static assets by URL. When changing JS or CSS behavior, update the query string in the template:

```html
<script src="/static/js/catalog.js?v=20260622-cost-toggle-filter"></script>
```

Use descriptive version names tied to the feature or date.

## Catalogue Update Costs Pattern

The Catalogue page demonstrates the preferred pattern for mode-based workflows:

- A visible toggle button with `aria-pressed`.
- Keep search/filter controls available.
- Hide only the controls that conflict with the current mode.
- Track dirty rows client-side.
- Save related updates in one bulk API request.
- Preserve a discard path.

## Forms

For admin forms:

- Label all inputs.
- Use `type="number"` with `min` and `step` for money fields.
- Keep required fields visually marked.
- Validate in JavaScript, then validate again on the backend.

## Tables

Tables should:

- Have clear column headings.
- Use right alignment for money/number columns.
- Keep actions in the last column.
- Provide empty states.
- Avoid layout shifts when row status changes.

