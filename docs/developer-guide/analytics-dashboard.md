# Interactive Analytics Dashboard

The interactive analytics dashboard is an admin-only page at:

```http
GET /analytics
```

It is separate from the existing daily, monthly, quarterly, and yearly dashboards. The page is designed for drill-down analytics: KPI cards open detail views, category rows open category detail, and customer rows open customer profiles.

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
