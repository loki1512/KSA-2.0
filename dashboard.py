from flask import Blueprint, render_template, request
from auth_helpers import admin_required
from datetime import datetime, date, timedelta
from calendar import monthrange
from sqlalchemy import func, cast, Date, distinct, and_
from models import Bill, BillItem, Customer, Payment, Transaction, Wallet
from extensions import db


def _is_postgres():
    return "postgresql" in str(db.engine.url)


def _date_col(col):
    if _is_postgres():
        return cast(col, Date)
    return func.date(col)


def _hour_col(col):
    if _is_postgres():
        return func.to_char(col, 'HH24')
    return func.strftime('%H', col)


def _payment_total_in_range(start_date, end_date):
    return (
        db.session.query(func.sum(Payment.amount))
        .filter(
            _date_col(Payment.timestamp) >= start_date,
            _date_col(Payment.timestamp) <= end_date,
        )
        .scalar()
        or 0
    )


def _outstanding_snapshot(as_of_date, limit=10):
    balance_expr = func.coalesce(func.sum(Transaction.amount), 0)
    customer_balances = (
        db.session.query(
            Transaction.customer_id.label("customer_id"),
            balance_expr.label("outstanding_amount"),
        )
        .filter(_date_col(Transaction.timestamp) <= as_of_date)
        .group_by(Transaction.customer_id)
        .having(balance_expr > 0)
        .subquery()
    )

    highest_credit_customers = (
        db.session.query(
            Customer.id.label("customer_id"),
            Customer.name.label("customer_name"),
            Customer.phone.label("customer_phone"),
            customer_balances.c.outstanding_amount.label("outstanding_amount"),
        )
        .join(customer_balances, customer_balances.c.customer_id == Customer.id)
        .order_by(customer_balances.c.outstanding_amount.desc())
        .limit(limit)
        .all()
    )

    total_outstanding = round(
        db.session.query(func.coalesce(func.sum(customer_balances.c.outstanding_amount), 0)).scalar() or 0,
        2,
    )

    return total_outstanding, highest_credit_customers


dashboard_bp = Blueprint("dashboard", __name__)


# ─────────────────────────────────────────────────────────
# DAILY DASHBOARD
# ─────────────────────────────────────────────────────────
@dashboard_bp.route("/")
@admin_required
def daily_dashboard():
    date_param = request.args.get("date")
    today = datetime.strptime(date_param, "%Y-%m-%d").date() if date_param else date.today()

    date_filter = (_date_col(Bill.timestamp) == today)

    # ── KPIs ──────────────────────────────────────────────
    total_sales = db.session.query(func.sum(Bill.final_amount))\
        .filter(date_filter).scalar() or 0

    total_bills = db.session.query(func.count(Bill.id))\
        .filter(date_filter).scalar() or 0

    avg_bill = round(total_sales / total_bills, 2) if total_bills else 0

    total_units = db.session.query(func.sum(BillItem.qty))\
        .join(Bill, Bill.id == BillItem.bill_id)\
        .filter(date_filter).scalar() or 0
    total_payments = round(_payment_total_in_range(today, today), 2)
    total_outstanding, highest_credit_customers = _outstanding_snapshot(today)

    # ── Hourly sales ──────────────────────────────────────
    hourly = db.session.query(
        _hour_col(Bill.timestamp).label("hour"),
        func.sum(Bill.final_amount)
    ).filter(date_filter)\
     .group_by("hour").order_by("hour").all()

    hours      = [h[0] for h in hourly]
    hour_sales = [float(h[1]) for h in hourly]

    # ── Top 10 items ──────────────────────────────────────
    top_items = db.session.query(
        BillItem.item_name,
        func.sum(BillItem.qty).label("qty"),
        func.sum(BillItem.final_item_amount).label("amount")
    ).join(Bill)\
     .filter(date_filter)\
     .group_by(BillItem.item_name)\
     .order_by(func.sum(BillItem.final_item_amount).desc())\
     .limit(10).all()

    # ── Customer counts ───────────────────────────────────
    # Count distinct linked customers + walk-ins separately
    linked_customers = db.session.query(func.count(distinct(Bill.customer_id)))\
        .filter(date_filter, Bill.customer_id.isnot(None)).scalar() or 0

    walkin_bills = db.session.query(func.count(Bill.id))\
        .filter(date_filter, Bill.customer_id.is_(None)).scalar() or 0

    total_customers = linked_customers + (1 if walkin_bills > 0 else 0)

    # New customers: their first-ever bill is today
    first_bill_subq = db.session.query(
        Bill.customer_id,
        func.min(_date_col(Bill.timestamp)).label("first_visit")
    ).filter(Bill.customer_id.isnot(None))\
     .group_by(Bill.customer_id).subquery()

    new_customers = db.session.query(func.count())\
        .select_from(first_bill_subq)\
        .filter(first_bill_subq.c.first_visit == today)\
        .scalar() or 0

    # ── Customers today (details) ─────────────────────────
    # Linked customers with transaction details
    linked_details = db.session.query(
        Customer.id.label("customer_id"),
        Customer.name.label("customer_name"),
        Customer.phone.label("customer_phone"),
        func.sum(Bill.final_amount).label("total_spent"),
        # Total paid today (PAYMENT transactions - stored as negative amounts)
        func.coalesce(
            func.sum(
                db.case(
                    (Transaction.transaction_type == 'PAYMENT', func.abs(Transaction.amount)),
                    else_=0
                )
            ), 0
        ).label("total_paid"),
        # Settled amount today (SETTLEMENT transactions)
        func.coalesce(
            func.sum(
                db.case(
                    (Transaction.transaction_type == 'SETTLEMENT', Transaction.amount),
                    else_=0
                )
            ), 0
        ).label("settled_amount"),
        # Wallet balance from Wallet table
        func.coalesce(Wallet.balance, 0).label("wallet_balance")
    ).join(Bill, Bill.customer_id == Customer.id)\
     .outerjoin(Transaction, db.and_(
        Transaction.customer_id == Customer.id,
        _date_col(Transaction.timestamp) == today
    ))\
     .outerjoin(Wallet, Wallet.customer_id == Customer.id)\
     .filter(date_filter)\
     .group_by(Customer.id, Customer.name, Customer.phone, Wallet.balance)\
     .order_by(func.sum(Bill.final_amount).desc())\
     .all()

    # Walk-in bills (no customer_id) — group by null
    walkin_total = db.session.query(func.sum(Bill.final_amount))\
        .filter(date_filter, Bill.customer_id.is_(None)).scalar() or 0

    customer_details = [
        {
            "customer_id":    row.customer_id,
            "customer_name":  row.customer_name,
            "customer_phone": row.customer_phone,
            "total_spent":    round(row.total_spent, 2),
            "total_paid":     round(float(row.total_paid or 0), 2),
            "settled_amount": round(float(row.settled_amount or 0), 2),
            "balance":        -float(row.wallet_balance or 0)  # Just negative of wallet
        }
        for row in linked_details
    ]

    if walkin_total > 0:
        customer_details.append({
            "customer_id":    None,
            "customer_name":  "Walk-in",
            "customer_phone": None,
            "total_spent":    round(walkin_total, 2),
            "total_paid":     0,
            "settled_amount": 0,
            "balance":        round(walkin_total, 2)
        })

    return render_template(
        "daily_dashboard.html",
        total_sales=round(total_sales, 2),
        total_bills=total_bills,
        avg_bill=avg_bill,
        total_units=total_units,
        total_payments=total_payments,
        total_outstanding=total_outstanding,
        highest_credit_customers=highest_credit_customers,
        hours=hours,
        hour_sales=hour_sales,
        top_items=top_items,
        total_customers=total_customers,
        new_customers=new_customers,
        customer_details=customer_details,
        selected_date=today.isoformat(),
        today_iso=date.today().isoformat(),
    )


# ─────────────────────────────────────────────────────────
# PERIOD DASHBOARD HELPER
# ─────────────────────────────────────────────────────────
def _period_dashboard_data(start_date, end_date):
    date_filter = and_(
        _date_col(Bill.timestamp) >= start_date,
        _date_col(Bill.timestamp) <= end_date,
    )

    # ── KPIs ──────────────────────────────────────────────
    total_sales = db.session.query(func.sum(Bill.final_amount))\
        .filter(date_filter).scalar() or 0
    total_bills = db.session.query(func.count(Bill.id))\
        .filter(date_filter).scalar() or 0
    avg_bill = round(total_sales / total_bills, 2) if total_bills else 0
    total_units = db.session.query(func.sum(BillItem.qty))\
        .join(Bill, Bill.id == BillItem.bill_id)\
        .filter(date_filter).scalar() or 0
    total_payments = round(_payment_total_in_range(start_date, end_date), 2)
    total_outstanding, highest_credit_customers = _outstanding_snapshot(end_date)

    # ── Top customers by bill count ────────────────────────
    top_customers_by_count = db.session.query(
        Customer.id.label("customer_id"),
        Customer.name.label("customer_name"),
        Customer.phone.label("customer_phone"),
        func.count(Bill.id).label("bill_count"),
        func.sum(Bill.final_amount).label("total_spent"),
    ).join(Bill, Bill.customer_id == Customer.id)\
     .filter(date_filter)\
     .group_by(Customer.id, Customer.name, Customer.phone)\
     .order_by(func.count(Bill.id).desc())\
     .limit(10).all()

    # ── Top customers by revenue ───────────────────────────
    top_customers_by_revenue = db.session.query(
        Customer.id.label("customer_id"),
        Customer.name.label("customer_name"),
        Customer.phone.label("customer_phone"),
        func.count(Bill.id).label("bill_count"),
        func.sum(Bill.final_amount).label("total_spent"),
    ).join(Bill, Bill.customer_id == Customer.id)\
     .filter(date_filter)\
     .group_by(Customer.id, Customer.name, Customer.phone)\
     .order_by(func.sum(Bill.final_amount).desc())\
     .limit(10).all()

    # ── Top products by quantity ───────────────────────────
    top_products_by_qty = db.session.query(
        BillItem.item_name,
        func.sum(BillItem.qty).label("qty"),
        func.sum(BillItem.final_item_amount).label("revenue"),
    ).join(Bill)\
     .filter(date_filter)\
     .group_by(BillItem.item_name)\
     .order_by(func.sum(BillItem.qty).desc())\
     .limit(10).all()

    # ── Top products by revenue ────────────────────────────
    top_products_by_revenue = db.session.query(
        BillItem.item_name,
        func.sum(BillItem.qty).label("qty"),
        func.sum(BillItem.final_item_amount).label("revenue"),
    ).join(Bill)\
     .filter(date_filter)\
     .group_by(BillItem.item_name)\
     .order_by(func.sum(BillItem.final_item_amount).desc())\
     .limit(10).all()

    # ── Day-wise sales for line chart ──────────────────────
    daily_sales = db.session.query(
        _date_col(Bill.timestamp).label("day"),
        func.sum(Bill.final_amount).label("sales"),
    ).filter(date_filter)\
     .group_by(_date_col(Bill.timestamp))\
     .order_by(_date_col(Bill.timestamp)).all()

    # Return ISO date strings so JS can parse them reliably
    days      = [str(d.day) for d in daily_sales]
    day_sales = [float(d.sales) for d in daily_sales]

    return dict(
        total_sales=round(total_sales, 2),
        total_bills=total_bills,
        avg_bill=avg_bill,
        total_units=total_units,
        total_payments=total_payments,
        total_outstanding=total_outstanding,
        highest_credit_customers=highest_credit_customers,
        top_customers_by_count=top_customers_by_count,
        top_customers_by_revenue=top_customers_by_revenue,
        top_products_by_qty=top_products_by_qty,
        top_products_by_revenue=top_products_by_revenue,
        days=days,
        day_sales=day_sales,
    )


# ─────────────────────────────────────────────────────────
# MONTHLY
# ─────────────────────────────────────────────────────────
@dashboard_bp.route("/dashboard/monthly")
@admin_required
def monthly_dashboard():
    year  = request.args.get("year",  date.today().year,  type=int)
    month = request.args.get("month", date.today().month, type=int)

    start_date = date(year, month, 1)
    end_date   = date(year, month, monthrange(year, month)[1])
    data       = _period_dashboard_data(start_date, end_date)
    label      = start_date.strftime("%B %Y")

    prev = start_date - timedelta(days=1)
    nxt  = end_date   + timedelta(days=1)

    return render_template(
        "period_dashboard.html",
        period="monthly",
        period_label=label,
        prev_url=f"/dashboard/monthly?year={prev.year}&month={prev.month}",
        next_url=f"/dashboard/monthly?year={nxt.year}&month={nxt.month}",
        **data,
    )


# ─────────────────────────────────────────────────────────
# QUARTERLY
# ─────────────────────────────────────────────────────────
@dashboard_bp.route("/dashboard/quarterly")
@admin_required
def quarterly_dashboard():
    year    = request.args.get("year",    date.today().year, type=int)
    quarter = request.args.get("quarter", (date.today().month - 1) // 3 + 1, type=int)

    start_month = (quarter - 1) * 3 + 1
    end_month   = start_month + 2
    start_date  = date(year, start_month, 1)
    end_date    = date(year, end_month, monthrange(year, end_month)[1])
    data        = _period_dashboard_data(start_date, end_date)
    label       = f"Q{quarter} {year}"

    prev_q    = quarter - 1; prev_year = year
    if prev_q < 1:  prev_q = 4; prev_year = year - 1
    next_q    = quarter + 1; next_year = year
    if next_q > 4:  next_q = 1; next_year = year + 1

    return render_template(
        "period_dashboard.html",
        period="quarterly",
        period_label=label,
        prev_url=f"/dashboard/quarterly?year={prev_year}&quarter={prev_q}",
        next_url=f"/dashboard/quarterly?year={next_year}&quarter={next_q}",
        **data,
    )


# ─────────────────────────────────────────────────────────
# YEARLY
# ─────────────────────────────────────────────────────────
@dashboard_bp.route("/dashboard/yearly")
@admin_required
def yearly_dashboard():
    year       = request.args.get("year", date.today().year, type=int)
    start_date = date(year, 1, 1)
    end_date   = date(year, 12, 31)
    data       = _period_dashboard_data(start_date, end_date)

    return render_template(
        "period_dashboard.html",
        period="yearly",
        period_label=str(year),
        prev_url=f"/dashboard/yearly?year={year - 1}",
        next_url=f"/dashboard/yearly?year={year + 1}",
        **data,
    )
