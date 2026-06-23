# Analytics Dashboard For Shopkeepers

The analytics dashboard is the shopkeeper's read-only business view. It helps you answer: How much did we sell? How much cash came back? Who owes money? Which products are moving? Are margins trustworthy?

Open it from the top navigation:

```text
Analytics
```

Use the period selector first. The dashboard can show Today, This Month, Last 30 Days, Last Month, or a Custom date range. Press Refresh after changing the period or dates.

## Top Tiles

Each top tile is clickable. Some open a detail popup; others move you to the related section. Hover the small `i` on the dashboard to see the same meaning in the page.

| Tile | What It Means | How To Use It |
| --- | --- | --- |
| Revenue | Total final bill amount in the selected period. The smaller line compares it with the previous equal-length period. | Use it as the main sales number for the period. Open it to see daily revenue, customer splits, categories, and top customers. |
| Collection Rate | Payments collected during the selected period divided by revenue for the same period. | If sales are high but collection rate is low, follow up on credit customers. |
| Gross Margin | Sales revenue minus known cost, using only bill item rows where cost price is filled and greater than zero. | Use it to understand profit only when cost data is well maintained. Check Margin Confidence before trusting it fully. |
| Outstanding | Total positive customer ledger balance as of the selected period end date. | Use it as the amount still to collect from customers. Open it to see aging buckets and debtors. |
| Repeat Customers | Percentage of active customers in this period who had their first bill before this period. | A higher percentage means customers are coming back. A low number means sales may depend too much on new walk-ins. |
| Top Customer Concentration | Percentage of revenue that came from the top five customers. | If this is too high, the shop depends heavily on a few customers. Protect those relationships and grow more regular buyers. |
| Top Product | Product with the highest revenue in the selected period, with revenue and units sold. | Use it for stocking and purchase planning. Check the Products tab for more top items. |
| Slow Items | Catalog items never sold or not sold in the last 30 days as of the period end date. | Use it to find items that may need promotion, reordering control, or catalog cleanup. |

## Executive Section

Use Executive first when you want a fast shop-health check.

| Section Or Tile | What It Means |
| --- | --- |
| Revenue Trend | Daily sales movement during the selected period. A sudden dip may mean a slow business day, missing bills, or seasonal demand change. |
| Revenue per customer | Total revenue divided by active customers. It shows how much each buying customer is worth on average. |
| Average bill | Total revenue divided by bill count. It shows the average invoice value. |
| Units per bill | Total quantity sold divided by bill count. It shows whether bills contain more or fewer items. |
| Revenue quality | A dashboard score based on collection rate, outstanding percentage, and repeat customer percentage. Higher means revenue is cleaner and less risky. |
| P0 Checklist | A priority list of the main business signals to review first: revenue growth, collection rate, debt aging, top debtors, repeat buying, concentration, top products, and margin. |

## Revenue Section

Use Revenue when you want to understand where sales came from.

| Section Or Tile | What It Means |
| --- | --- |
| Revenue Trend | Bar chart of daily revenue in the selected period. Open it for the daily table and drill-down tabs. |
| Average bill value | Total revenue divided by bills. Same meaning as average bill. |
| Revenue per customer | Total revenue divided by distinct customers billed in the period. |
| Revenue per bill | Total revenue divided by bills in the period. |
| Units per bill | Average item quantity sold per bill. |
| Categories | Top categories by revenue. Click a category to see item-level revenue, units, and known margin. |

## Customers Section

Use Customers when you want to know whether sales are coming from new buyers or regular buyers.

| Section Or Tile | What It Means |
| --- | --- |
| New vs Repeat | Splits revenue between customers whose first bill is inside the selected period and customers who bought before the period. |
| Active customers | Distinct customers with at least one bill in the selected period. |
| New customers | Customers whose first recorded bill falls inside the selected period. |
| Repeat customer % | Repeat customers divided by active customers. |
| Top 5 concentration | Revenue share from the five highest-spending customers. |

Click customer rows in drill-down popups to open a customer profile with total spent, outstanding balance, bills, repeat status, recent purchases, and recent payments.

## Credit Section

Use Credit when you want to collect pending balances.

| Section Or Tile | What It Means |
| --- | --- |
| Aging Buckets | Outstanding ledger balances grouped by how long the oldest open activity has been pending: 0-30, 31-60, 61-90, and 90+ days. |
| Top Debtors | Customers with the highest outstanding balances as of the selected period end date. |

Start with the 90+ days bucket and the largest debtors. These are usually the first follow-up calls.

## Products Section

Use Products when planning stock, purchasing, and promotions.

| Section Or Tile | What It Means |
| --- | --- |
| Top Products | Highest revenue products in the selected period, with revenue share and units sold. |
| Slow-moving products | Catalog items with no sale in the last 30 days, including never-sold items. |
| Dead / never-sold products | Planned future metric. It is currently a placeholder. |
| Rising products | Planned future metric for products with improving sales. It is currently a placeholder. |
| Cross-sell | Planned future metric for products commonly bought together. It is currently a placeholder. |

Use Top Products to avoid stock-outs. Use Slow Items to avoid overbuying items that are not moving.

## Profitability Section

Use Profitability only after checking cost data quality.

| Section Or Tile | What It Means |
| --- | --- |
| Margin by Category | Category gross margin calculated only from sales rows with valid cost price. |
| Revenue with valid cost | Sales revenue from bill item rows where cost price is known and greater than zero. |
| Known cost | Cost price multiplied by sold quantity for rows with valid cost. |
| Margin confidence | Revenue with valid cost divided by total revenue. Higher means margin numbers cover more sales. |
| Rule | Cost analytics only use rows where `cost_price > 0`. Blank or zero cost is ignored. |

If Margin Confidence is low, update item cost prices before making big profit decisions.

## Drill-Down Popups

Use Open buttons or clickable tiles to inspect the details behind a number.

- Revenue Detail: daily trend, new/repeat customers, category revenue, and top customers.
- Outstanding Debt: customer balances grouped by aging bucket.
- Known-Cost Margin: costed revenue, known cost, gross margin, and margin percentage.
- Slow Items: item name, category, default price, known cost, last sale, and days since sale.
- Customer Profile: customer details, spending, outstanding balance, recent purchases, and payments.

## Good Daily Routine

1. Select Today or This Month.
2. Check Revenue and Collection Rate.
3. Open Outstanding if collection rate is low.
4. Check Top Product and Slow Items before purchasing stock.
5. Check Repeat Customers and Top Customer Concentration to understand customer health.
6. Check Profitability only if Margin Confidence is high enough.

The dashboard is read-only. It will not create bills, payments, customers, products, returns, or ledger entries.
