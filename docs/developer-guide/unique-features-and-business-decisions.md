# Unique Features And Business Decisions

This page explains what makes the KSA app more than a generic billing system. It documents the product choices behind the app so future changes preserve the business logic, not just the screens.

## Business Context

KSA is built for a high-trust retail and agency workflow where the same customer may buy on credit, return items later, make partial payments, receive offers, and ask for a printed or shared account view. The app therefore prioritizes speed at the counter, traceable balances, customer history, and practical reporting over heavy enterprise process.

Core assumptions:

- Admin users run the shop workflows.
- Customers may have account access, but most operational actions remain admin-controlled.
- Credit and payments are normal business activity, not exceptional cases.
- Historical bills and returns must remain understandable even after catalogue prices or names change.
- Reports must tolerate incomplete cost data without corrupting revenue or margin numbers.

## Ledger As Source Of Truth

Customer balances are driven by `Transaction` rows, not by mutating a single outstanding field.

Business decision:

- Sales increase what the customer owes.
- Payments reduce what the customer owes.
- Returns/refunds reduce what the customer owes and can add wallet credit.
- Settlements are explicit transactions that preserve an audit trail.

Why it matters:

- The shop can explain a customer's balance line by line.
- Partial payments and credit sales are supported naturally.
- Deleting or correcting a linked document can reverse its transaction effect.
- Dashboards and ledgers can calculate outstanding balances from a consistent history.

Developer rule:

- Preserve `reference_type` and `reference_id` whenever a transaction is tied to a bill, payment, return, or settlement.

## Separate Ledger And Wallet Balances

The app distinguishes customer debt from customer wallet credit.

Business decision:

- The ledger answers: "How much does the customer owe?"
- The wallet answers: "How much credit/refund value does the customer have?"

Why it matters:

- A refund can be stored as usable customer credit without hiding the ledger history.
- Customer pages can show outstanding balance and wallet balance separately.
- Staff can make clearer decisions at billing time.

Developer rule:

- Do not merge wallet balance into ledger balance unless the workflow explicitly creates a transaction that explains the movement.

## Cost Snapshots For Historical Margin

`BillItem` and `ReturnItem` store a `cost_price` snapshot at the time the document is created.

Business decision:

- Historical profit should reflect the cost known at sale or return time.
- Later catalogue cost edits should improve future reporting, not rewrite the past.

Why it matters:

- Margin analysis remains stable after catalogue maintenance.
- Old invoices and returns stay auditable.
- The business can gradually improve cost data without breaking revenue history.

Developer rule:

- Do not recalculate old bill or return item costs from the current catalogue unless the feature is explicitly a historical correction tool.

## Optional Cost Data Without Polluting Revenue

Cost price is useful but not always complete. The app treats missing or zero cost as unknown for margin analytics.

Business decision:

- Revenue metrics include all valid sales.
- Cost and margin metrics include only rows where cost is known and greater than zero.

Why it matters:

- Incomplete catalogue cost data does not understate profit by treating unknown cost as zero.
- Revenue, customer, product, and credit reporting still work even when cost maintenance is incomplete.
- The dashboard can show margin confidence separately from total revenue.

Developer rule:

- For margin/profit/cost analytics, filter to `cost_price IS NOT NULL AND cost_price > 0`.

## Catalogue Price Layers

Catalogue items carry multiple price fields: default price, maximum price, final price, and cost price.

Business decision:

- `default_price` is the base value used by billing.
- `max_price` acts as a ceiling or MRP-like reference.
- `final_price` can hold the preferred selling price.
- `cost_price` supports margin and profitability reporting.

Why it matters:

- Counter staff can bill quickly while still respecting pricing boundaries.
- Cost maintenance can happen separately from sales price maintenance.
- Pricing corrections do not require rebuilding the billing workflow.

Developer rule:

- Validate price relationships at route boundaries, and keep cost updates bulk-friendly for catalogue maintenance.

## Cost Reverse Discount Calculation

The billing workflow needs to support price negotiation while still protecting cost awareness.

Business decision:

- Staff may work backwards from a desired final selling price or discount.
- The app should preserve the original item price, line discount, final item amount, and cost snapshot.
- Cost price should be available for margin review, but it should not block billing when cost data is missing.

Why it matters:

- Counter staff can quickly quote realistic discounted prices without doing manual reverse math.
- The business can see whether a discounted sale still had enough margin when valid cost data exists.
- Historical bills remain explainable because the stored line shows both the discount decision and the final charged amount.

Developer rule:

- When adding or changing reverse discount logic, keep the calculation explicit: original/unit price, discount type, discount value, final line amount, quantity, and cost snapshot should remain separately inspectable.
- Do not overwrite `cost_price` with a derived discount value. Cost is the business input; discount is the selling decision.

## Fuzzy Catalogue Search

Catalogue search should behave more like a practical shop search than a strict database lookup.

Business decision:

- Search should match item names even when users type words in a different order.
- Search should support short partial tokens and abbreviations used at the counter.
- Examples that should point to the same product family include `gm switch`, `switch gm`, and `sw gm`.

Why it matters:

- Staff can find items quickly under counter pressure.
- Search remains usable even when catalogue names are long or inconsistently remembered.
- New staff do not need to memorize the exact stored item name before billing.

Developer rule:

- Tokenize and normalize search terms before matching.
- Prefer all-token matching for multi-word queries, regardless of word order.
- Support prefix/partial token matching where practical, so short terms like `sw` can match `switch`.
- Keep exact and stronger matches ranked above weaker fuzzy matches.
- Avoid changing stored catalogue names as part of search. Search should be flexible without mutating product data.

## Customer-Centric Workflow

Customers are first-class records with phone, village, customer type, referral code, wallet, ledger, bills, payments, returns, and offer leads.

Business decision:

- The customer profile is the operational center for account history.
- Phone numbers are used as practical identifiers for search and offer capture.
- Customer type supports business segmentation such as regular, premium, and electrician.

Why it matters:

- Staff can move from customer search to ledger, payment, return, bill, or profile update quickly.
- Repeat customers and trade customers can be analyzed separately.
- Offer leads can connect marketing interest to real customer accounts.

Developer rule:

- Keep customer ownership checks strict for customer-facing routes, and keep admin workflows fast for counter use.

## Referral And Lead Tracking

Customers have referral codes and optional referrer links. Offers can create leads connected to customers.

Business decision:

- Marketing should connect back to existing customer relationships.
- Public offer interest should not live outside the operational customer database.

Why it matters:

- A lead can be contacted, converted, rejected, or preserved after an offer changes.
- Existing customers can be recognized from a phone number.
- New offer respondents can become customer records with village context.

Developer rule:

- Preserve lead/customer/offer references where possible. If an offer is removed, the lead should still identify the customer and show that the offer was removed.

## Public Offers With Admin Control

The app includes a public offers page and an admin offer manager.

Business decision:

- Admins can publish or hide offers without deploying code.
- Product images and short descriptions make offers shareable.
- Public users can express interest without needing an account first.

Why it matters:

- Promotions become part of the same customer and lead workflow as billing.
- The business can run campaigns without a separate marketing system.
- Offer images can be stored locally in development or in Supabase storage when configured.

Developer rule:

- Public offer pages should expose only active offers. Admin offer and lead APIs must require admin access.

## Returns As Refund Notes And Account Events

Returns are stored as documents with line items and customer impact.

Business decision:

- A return creates a refund note, updates wallet credit, and creates a negative ledger transaction.
- Deleting a return reverses the wallet credit and removes the linked transaction.

Why it matters:

- Staff can print or review a return as a standalone document.
- Customer accounts stay consistent after returns.
- Return history supports future margin and customer behavior analysis.

Developer rule:

- Treat return creation as one logical transaction: return header, return items, wallet effect, and ledger effect must succeed or fail together.

## Interactive Analytics For Decisions

The `/analytics` page is read-only and built for drill-down analysis.

Business decision:

- The dashboard answers immediate business questions: revenue movement, collection rate, top debtors, repeat customer percentage, customer concentration, top products, slow-moving items, and known-cost margin.
- KPI cards lead to detail views instead of requiring separate reports.

Why it matters:

- Admin users can move from summary to evidence quickly.
- Credit risk, customer dependency, product movement, and margin quality are visible in one place.
- The dashboard can guide action without changing operational data.

Developer rule:

- Keep analytics endpoints read-only and admin-only. Avoid adding writes to dashboard drill-downs unless they are clearly separated from reporting.

## Historical Catalogue Cleaner

The admin profile area includes a historical database cleaner for uncatalogued or inconsistent bill item names.

Business decision:

- Old bill item names may not match the current catalogue.
- Corrections should be deliberate, reviewed, and bounded.

Why it matters:

- Name-based analytics become more useful after cleanup.
- Staff can repair historical data without directly editing the database.
- The app can improve reporting quality while preserving control.

Developer rule:

- Keep historical replacements limited and explicit. Do not silently rewrite bill history from background jobs.

## PWA-Oriented Access

The app registers a service worker and injects PWA manifest support.

Business decision:

- The system should feel quick and accessible on shop devices.
- Common static assets should load reliably after first use.

Why it matters:

- Counter workflows benefit from faster repeat loads.
- Mobile and tablet usage remains practical.
- Static asset changes require cache awareness.

Developer rule:

- When changing important frontend behavior, account for service worker caching and version static asset URLs where needed.

## Operational Design Principles

Use these principles when adding features:

- Prefer traceable account events over silent balance mutation.
- Keep billing, payment, return, and ledger writes atomic.
- Preserve historical documents as they were understood at the time.
- Keep customer workflows fast and searchable.
- Make analytics honest about incomplete data.
- Keep public marketing flows connected to customer records.
- Keep admin-only operations protected, especially money, ledger, customer, offer, and analytics routes.

## Feature Ownership Map

| Feature | Main Files | Business Owner In Code |
| --- | --- | --- |
| Billing and sale ledger effects | `routes/bills.py`, `models.py` | Bill, BillItem, Transaction |
| Payments and settlement | `routes/payments.py`, `routes/ledger.py` | Payment, Transaction |
| Customer account view | `routes/customers.py`, `routes/ledger.py` | Customer, Wallet, Transaction |
| Returns and refund notes | `routes/returns.py` | Return, ReturnItem, Wallet, Transaction |
| Catalogue and cost maintenance | `routes/items.py` | Item |
| Public offers and leads | `routes/offers.py` | Offer, Lead, Customer |
| Analytics dashboard | `routes/analytics.py` | Read-only reporting queries |
| Historical catalogue cleanup | `routes/account.py` | BillItem and Item name matching |
