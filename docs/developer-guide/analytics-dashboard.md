# Interactive Analytics Dashboard

The interactive analytics dashboard is an admin-only page at:

```http
GET /analytics
```

It is separate from the existing daily, monthly, quarterly, and yearly dashboards. The page is designed for drill-down analytics: KPI cards open detail views, category rows open category detail, and customer rows open customer profiles.

## Analytics Dashboard 2.0 Changes

The 2.0 update turns the analytics page into a focused drill-down workspace instead of a static summary page.

Main changes:

- Adds an admin-only analytics blueprint registered from `app.py`.
- Adds a dedicated `/analytics` page with period controls, KPI cards, section tabs, Chart.js visualizations, and drill-down modals.
- Adds JSON endpoints for summary metrics, revenue detail, category detail, customer profiles, outstanding debt, and slow-moving items.
- Adds cross-page navigation links from the daily and period dashboards.
- Adds page-scoped JavaScript and CSS for dashboard state, charts, modal lifecycle, responsive layouts, and table rendering.
- Adds local SQLite indexes to improve dashboard query performance during development.

The dashboard is intentionally read-only. It does not create bills, payments, transactions, items, customers, or returns.

## Files Changed

- `routes/analytics.py`
  - New analytics blueprint mounted at `/analytics`.
  - Provides the page route and JSON APIs used by the dashboard.
- `templates/analytics_dashboard.html`
  - New dashboard page shell.
  - Includes executive KPI cards, period controls, tabbed analytics sections, chart areas, category/product/credit panels, and modal containers.
- `static/js/analytics_dashboard.js`
  - Loads dashboard data.
  - Renders Chart.js charts and drill-down tables.
  - Handles dashboard tab navigation, modal navigation, and customer profile drill-downs.
- `static/css/analytics_dashboard.css`
  - Page-specific layout, KPI cards, tabs, panels, tables, and modal styles.
- `app.py`
  - Registers `analytics_bp`.
- `templates/daily_dashboard.html`
  - Adds an `Analytics` nav link.
- `templates/period_dashboard.html`
  - Adds an `Analytics` nav link.
- `instance/db.sqlite3`
  - Local SQLite file was updated with dashboard performance indexes.

## Analytics APIs

All routes require admin access.

```http
GET /analytics/api/summary
GET /analytics/api/revenue/detail
GET /analytics/api/category/<category>/detail
GET /analytics/api/customer/<customer_id>/profile
GET /analytics/api/outstanding/detail
GET /analytics/api/items/slow-moving
```

The summary API powers the default executive view and returns the current P0 metrics:

- revenue growth percentage and previous-period comparison
- collection rate percentage
- aging bucket totals
- top debtors
- repeat customer percentage
- top customer concentration percentage
- top products
- margin by category using valid cost rows only

### API Data Contracts

`GET /analytics/api/summary` returns the dashboard landing payload:

- `period` and `previous_period`
- `revenue`: total, previous total, growth, change, bills, average bill, units, units per bill, revenue per customer, and new/repeat split
- `customers`: active, new, repeat, repeat percentage, and top-five customer concentration percentage
- `cash`: payments, collection rate, outstanding, outstanding percentage, top debtors, and aging bucket summaries
- `margin`: known cost, costed revenue, gross margin, margin percentage, cost rule note, and category margin rows
- `categories`, `top_products`, and `slow_items`

`GET /analytics/api/revenue/detail` returns:

- daily revenue rows for charts and the trend table
- new and repeat customer revenue groups
- category revenue with units, bill count, and revenue share
- top customers for the selected period

`GET /analytics/api/category/<category>/detail` returns category totals, item rows, and a daily category revenue trend. The frontend currently renders the totals and item table.

`GET /analytics/api/customer/<customer_id>/profile` returns profile details, lifetime summary, recent purchases, and recent payments for the customer modal.

`GET /analytics/api/outstanding/detail` returns aging buckets with customer rows. Outstanding is calculated from positive ledger transaction balances as of the selected period end date.

`GET /analytics/api/items/slow-moving` returns catalog items with no sale, or no sale within the requested cutoff window. The frontend currently calls it with `days=30`.

## Dashboard Layout

The analytics page is organized to keep the first screen focused:

- Executive: 8 default KPIs, revenue trend, decision snapshot, and P0 checklist.
- Revenue: revenue trend, average bill value, revenue per customer/bill, units per bill, and category revenue.
- Customers: new vs repeat revenue plus active/new/repeat/concentration metrics.
- Credit: aging buckets and top debtors.
- Products: top products and slow-moving product health.
- Profitability: gross margin, margin by category, and cost data quality.

Common query parameters:

- `period=today`
- `period=this_month`
- `period=last_30`
- `period=last_month`
- `period=custom&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD`

For custom periods, if `end_date` is earlier than `start_date`, the backend swaps the dates and returns a valid range.

## Frontend Behavior

`static/js/analytics_dashboard.js` keeps dashboard state in a single `state` object:

- selected period and custom date inputs
- summary API payload
- revenue detail API payload
- active modal chart
- executive and revenue-tab chart instances

Initial load fetches summary and revenue detail in parallel. The summary payload renders KPI cards, tab panels, lists, and snapshot values. The revenue detail payload renders the mini line chart and the revenue tab bar chart.

Interactive entry points:

- KPI cards with `data-modal` open revenue, outstanding, margin, or slow-items modals.
- KPI cards with `data-tab-target` switch to the related dashboard tab.
- Category rows call the category detail API and open a category modal.
- Customer rows call the customer profile API and open the customer modal.
- `Escape`, the backdrop, and close buttons close modals and destroy active modal charts.

When changing dashboard CSS or JavaScript behavior, remember the service worker cache note from [Frontend Guide](frontend.md): update static asset query strings if the template starts versioning these files.

## Cost Price Rule

Cost price is optional and must not distort analytics.

For all cost-dependent metrics, rows are included only when:

```sql
cost_price IS NOT NULL
AND cost_price > 0
```

This applies to:

- known cost
- gross margin
- margin percentage
- category/item margin calculations

Revenue, bill counts, units sold, customer counts, category revenue, outstanding credit, and slow-moving item detection do not require cost price and still include all relevant rows.

## Modal Behavior

Only one drill-down popup should be visible at a time.

The dashboard has two modal containers:

- `#analyticsModal` for normal drill-down views.
- `#customerModal` for customer profile views.

When a customer profile opens from another drill-down:

1. The analytics modal is hidden.
2. The analytics modal tabs/body are cleared.
3. Any active Chart.js modal chart is destroyed.
4. The customer modal is shown.

The CSS explicitly preserves `hidden` behavior for flex-based modals:

```css
.modal-backdrop[hidden],
.analytics-modal[hidden] {
  display: none !important;
}
```

This prevents stacked or overlapping modal windows.

## Query Notes

- Date filtering uses an inclusive date range by converting the selected end date to the next midnight and filtering with `< end`.
- PostgreSQL uses `CAST(timestamp AS DATE)` while SQLite uses `date(timestamp)` through `_date_col`.
- Category joins are case-insensitive and name-based with `lower(Item.name) == lower(BillItem.item_name)`.
- New vs repeat customers are derived from each customer's first bill date.
- Top customer concentration is calculated from the top five customers' revenue share for the selected period.
- Revenue quality is currently a frontend score derived from collection rate, outstanding percentage, and repeat customer percentage.

## Local Indexes Created

The local SQLite database at `instance/db.sqlite3` was updated with these indexes:

```sql
CREATE INDEX IF NOT EXISTS ix_bill_timestamp ON bill (timestamp);
CREATE INDEX IF NOT EXISTS ix_bill_customer_timestamp ON bill (customer_id, timestamp);
CREATE INDEX IF NOT EXISTS ix_bill_item_bill_id ON bill_item (bill_id);
CREATE INDEX IF NOT EXISTS ix_bill_item_name ON bill_item (item_name);
CREATE INDEX IF NOT EXISTS ix_bill_item_cost_positive ON bill_item (cost_price) WHERE cost_price > 0;
CREATE INDEX IF NOT EXISTS ix_payment_timestamp ON payment (timestamp);
CREATE INDEX IF NOT EXISTS ix_payment_customer_timestamp ON payment (customer_id, timestamp);
CREATE INDEX IF NOT EXISTS ix_transaction_customer_timestamp ON "transaction" (customer_id, timestamp);
CREATE INDEX IF NOT EXISTS ix_transaction_reference ON "transaction" (reference_type, reference_id);
CREATE INDEX IF NOT EXISTS ix_item_category ON item (category);
CREATE INDEX IF NOT EXISTS ix_item_cost_positive ON item (cost_price) WHERE cost_price > 0;
CREATE INDEX IF NOT EXISTS ix_customer_type ON customer (customer_type);
CREATE INDEX IF NOT EXISTS ix_customer_referred_by ON customer (referred_by_id);
CREATE INDEX IF NOT EXISTS ix_return_timestamp ON "return" (timestamp);
CREATE INDEX IF NOT EXISTS ix_return_customer_timestamp ON "return" (customer_id, timestamp);
CREATE INDEX IF NOT EXISTS ix_return_item_return_id ON return_item (return_id);
CREATE INDEX IF NOT EXISTS ix_return_item_name ON return_item (item_name);
CREATE INDEX IF NOT EXISTS ix_return_item_cost_positive ON return_item (cost_price) WHERE cost_price > 0;
```

## Verification Performed

Compiled Python files with the project virtual environment:

```powershell
.\myenv\Scripts\python.exe -m py_compile app.py routes\analytics.py
```

Smoke-tested with Flask test client after admin login:

- `/analytics`
- `/analytics/api/summary?period=this_month`
- `/analytics/api/revenue/detail?period=this_month`
- `/analytics/api/outstanding/detail?period=this_month`
- `/analytics/api/items/slow-moving?period=this_month&days=30`

All returned HTTP `200`.

## Known Limitations

- Category joins are currently name-based because `BillItem` does not store `item_id`.
- Outstanding aging is ledger-based because there are no bill-level due dates or payment allocations.
- Slow-moving item analysis uses sales history only; stock-on-hand is not available in the current schema.
- Real-time WebSocket updates are not implemented yet. The page uses manual refresh.
