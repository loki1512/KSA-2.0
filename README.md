# KSA 3.0 | High-Velocity Retail ERP & Analytics
**A specialized Business Engine built for the "Negotiation-to-Settlement" lifecycle.** *Optimized for regional retail operations where speed, credit, and data integrity are the primary currencies.*

---

## 🛠️ The Philosophy: Software for Reality
KSA 3.0 is designed around real retail behavior, not idealized processes. It accepts the realities of:

* negotiated totals, not fixed margins
* customers buying on credit and paying later
* returns, refunds, and balance adjustments
* quick catalog updates in an evolving market

The goal is simple: make the sales counter fast, keep the ledger honest, and surface the cash signal clearly.

---

## 🚀 Core Features

### 1. Credit Tracking & Smart Cashflow
* Customer credit is tracked through the centralized `Transaction` ledger.
* Positive transaction values raise outstanding customer debt.
* Payments and refunds are stored as negative amounts to reduce credit.
* Wallet balances are updated automatically during returns and settlements.
* Daily dashboard KPIs highlight:
  * total outstanding credit
  * highest-credit customers
  * cash collected today
  * settlement and wallet impact

### 2. Dynamic Catalogue Management
* Items are stored as records with:
  * `name`
  * `category`
  * `default_price`
  * `max_price`
  * `final_price`
  * `cost_price`
* Search supports multi-keyword matching.
* Administrators can add items on the fly, allowing the catalog to expand as new stock arrives.
* Prices can be updated quickly through dedicated endpoints.

### 3. Ledger & Customer Lifecycle
* Every customer has:
  * a unique wallet record
  * a transaction history
  * a referral code and customer type metadata
* Ledgers can be viewed by admin and by customers for their own account.
* Admin-only ledger actions include:
  * clear ledger
  * settle ledger
  * delete customer and related records

### 4. Returns + Cost Addition
* Returns are created with line-level item details.
* `ReturnItem` records store `cost_price` if available from the catalog.
* Refunds post a negative transaction and credit the customer wallet.
* Return creation and deletion both keep wallet and ledger balances consistent.

### 5. RBAC & Security
* Uses `Flask-Security` plus custom role helpers.
* Two primary roles in the app:
  * `admin`
  * `customer`
* Admin-only endpoints are protected with `@admin_required`.
* Customers can authenticate and access only their own account and ledger.
* Public customer lookups are possible for phone-based verification in a login-free flow.

---

## 📌 App Flow

### Admin Workflow
1. **Login** as an admin via `/login`.
2. Land on **Daily Dashboard** for a quick view of:
   * sales, bills, and outstanding credit
   * top items and customer activity
   * hourly sales trends
3. Use **Catalog** to search and add new items immediately.
4. Create or update **customer records** and issue referrals.
5. Build a **bill** using the item search flow and apply discounts.
6. Record **payments** or perform a **settlement** when a customer clears their ledger.
7. Manage **returns** and observe how refunds alter wallet and transaction balances.

### Customer Workflow
1. Customer logs in or gets a customer account created by admin.
2. They can view their **my account** page and transactions.
3. Customers can inspect their own **ledger** and referral code.
4. They can use the catalog-driven billing flow only when allowed by admin-side business process.

---

## 🧠 Why These Features Matter

### Credit Tracking
Retail work environments often extend credit to trusted customers. KSA captures that by treating each sale and payment as ledger transactions, which makes historical customer debt immediately visible.

### Dynamic Cataloguing
A growing business needs a catalog that grows with stock arrival. The app supports item creation and pricing updates without database schema changes.

### Ledgers & Smart Cashflow
The dashboard is not just decorative. It synthesizes daily sales, payments, and outstanding credit into actionable metrics for the counter and the owner.

### Returns Cost Integrity
Returns are not just refunds — they preserve cost information so the business can later analyze true profit and loss.

### Role-Based Access Control (RBAC)
With separate admin and customer roles, the system keeps sensitive operations locked down while still allowing customers to view their own financial status.

---

## 🧩 Architecture Overview

* **Backend:** Flask app in `app.py`
* **Models:** `models.py` defines:
  * `User`, `Role`, `Customer`, `Wallet`, `Transaction`
  * `Item`, `Bill`, `BillItem`, `Return`, `ReturnItem`, `Payment`
* **Routes:** modular blueprints in `routes/`
* **Dashboard:** KPI and period dashboards in `dashboard.py`
* **Auth helpers:** `auth_helpers.py` handles role checks and customer login mappings

---

## 📝 Setup

1. Activate the Python environment.
2. Install dependencies from `requirements.txt`.
3. Configure `.env` with:
   * `SECRET_KEY`
   * `SECURITY_PASSWORD_SALT`
   * `DATABASE_URL` or `SQLITE_DB_URL`
   * `SUPABASE_DB_URL` if using Postgres
4. Run the Flask app normally with `flask run` or your preferred WSGI host.

> If `DATABASE_URL` is a Postgres URL but the database is unreachable, the app falls back to SQLite automatically.

---

## 📷 Screenshots (Placeholders)

* `![Daily Dashboard](images/screenshots/monthly_dashboard.png)`
* `![Catalog Item Search](images/screenshots/catalog_search.png)`
* `![Customer Ledger](images/screenshots/customer_ledger.png)`
* `![Returns & Refunds](images/screenshots/returns.png)`
* `![RBAC Login](images/screenshots/custommer_login.png)`



---

## 📈 Roadmap
- [x] **v1.0:** Billing & Catalogue Essentials
- [x] **v2.0:** Dashboard, Ledgers, Multi-Tab UI, and credit tracking
- [x] **v3.0:** Performance tuning, snapshot integrity, returns cost, RBAC enforcement
- [ ] **v3.1:** Server-side pagination for infinite ledger scrolling
- [ ] **v4.0:** Predictive stock-out alerts based on historical velocity

---

## 🧭 Key Takeaway
KSA 3.0 is not just a billing app. It is a practical retail operations platform that connects fast catalog entry, customer credit, returns, and daily cash intelligence into one coherent workflow.