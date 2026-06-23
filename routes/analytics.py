from datetime import date, datetime, timedelta

from flask import Blueprint, jsonify, render_template, request
from sqlalchemy import Date, and_, case, cast, distinct, func, or_

from auth_helpers import admin_required
from extensions import db
from models import Bill, BillItem, Customer, Item, Payment, Return, ReturnItem, Transaction, Wallet


analytics_bp = Blueprint("analytics", __name__, url_prefix="/analytics")


def _is_postgres():
    return "postgresql" in str(db.engine.url)


def _date_col(col):
    if _is_postgres():
        return cast(col, Date)
    return func.date(col)


def _range_filter(col, start_date, end_date):
    start_dt = datetime.combine(start_date, datetime.min.time())
    end_dt = datetime.combine(end_date + timedelta(days=1), datetime.min.time())
    return and_(col >= start_dt, col < end_dt)


def _parse_date(value, fallback):
    if not value:
        return fallback
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return fallback


def _period_bounds():
    today = date.today()
    period = request.args.get("period", "this_month")

    if period == "today":
        return today, today, period
    if period == "last_30":
        return today - timedelta(days=29), today, period
    if period == "last_month":
        first_this_month = today.replace(day=1)
        last_month_end = first_this_month - timedelta(days=1)
        return last_month_end.replace(day=1), last_month_end, period
    if period == "custom":
        start_date = _parse_date(request.args.get("start_date"), today.replace(day=1))
        end_date = _parse_date(request.args.get("end_date"), today)
        if end_date < start_date:
            start_date, end_date = end_date, start_date
        return start_date, end_date, period

    return today.replace(day=1), today, "this_month"


def _previous_period_bounds(start_date, end_date):
    days = (end_date - start_date).days + 1
    previous_end = start_date - timedelta(days=1)
    previous_start = previous_end - timedelta(days=days - 1)
    return previous_start, previous_end


def _money(value):
    return round(float(value or 0), 2)


def _safe_pct(part, total):
    total = float(total or 0)
    return round((float(part or 0) / total) * 100, 1) if total else 0


def _pct_delta(current, previous):
    previous = float(previous or 0)
    if not previous:
        return 0
    return round(((float(current or 0) - previous) / previous) * 100, 1)


def _customer_first_bill_subquery():
    return (
        db.session.query(
            Bill.customer_id.label("customer_id"),
            func.min(_date_col(Bill.timestamp)).label("first_bill_date"),
            func.count(Bill.id).label("lifetime_bills"),
        )
        .filter(Bill.customer_id.isnot(None))
        .group_by(Bill.customer_id)
        .subquery()
    )


def _outstanding_rows(as_of_date=None, limit=None):
    balance_expr = func.coalesce(func.sum(Transaction.amount), 0)
    query = db.session.query(
        Transaction.customer_id.label("customer_id"),
        balance_expr.label("outstanding_amount"),
        func.min(_date_col(Transaction.timestamp)).label("oldest_activity"),
        func.max(_date_col(Transaction.timestamp)).label("latest_activity"),
    )
    if as_of_date:
        query = query.filter(_date_col(Transaction.timestamp) <= as_of_date)

    balances = (
        query.group_by(Transaction.customer_id)
        .having(balance_expr > 0)
        .subquery()
    )

    rows_query = (
        db.session.query(
            Customer.id.label("customer_id"),
            Customer.name.label("customer_name"),
            Customer.phone.label("customer_phone"),
            balances.c.outstanding_amount.label("outstanding_amount"),
            balances.c.oldest_activity.label("oldest_activity"),
            balances.c.latest_activity.label("latest_activity"),
        )
        .join(balances, balances.c.customer_id == Customer.id)
        .order_by(balances.c.outstanding_amount.desc())
    )

    if limit:
        rows_query = rows_query.limit(limit)

    return rows_query.all()


def _aging_payload(end_date):
    buckets = [
        ("0-30 days", 0, 30),
        ("31-60 days", 31, 60),
        ("61-90 days", 61, 90),
        ("90+ days", 91, None),
    ]
    payload = [{"bucket": label, "total": 0, "customers": []} for label, _, _ in buckets]

    for row in _outstanding_rows(end_date):
        activity_date = row.oldest_activity
        if isinstance(activity_date, str):
            activity_date = datetime.strptime(activity_date, "%Y-%m-%d").date()
        days_open = (end_date - activity_date).days if activity_date else 0
        item = {
            "customer_id": row.customer_id,
            "name": row.customer_name,
            "phone": row.customer_phone,
            "outstanding": _money(row.outstanding_amount),
            "days_open": days_open,
            "oldest_activity": str(row.oldest_activity) if row.oldest_activity else None,
        }
        for idx, (_, low, high) in enumerate(buckets):
            if days_open >= low and (high is None or days_open <= high):
                payload[idx]["customers"].append(item)
                payload[idx]["total"] += item["outstanding"]
                break

    for bucket in payload:
        bucket["total"] = _money(bucket["total"])
        bucket["customers"] = sorted(
            bucket["customers"],
            key=lambda customer: customer["outstanding"],
            reverse=True,
        )

    return payload


def _payment_amount_band(amount):
    value = float(amount or 0)
    if value >= 50000:
        return "50k_plus"
    if value >= 10000:
        return "10k_50k"
    if value >= 1000:
        return "1k_10k"
    return "under_1k"


def _payment_recency_bucket(payment_date, end_date):
    if isinstance(payment_date, datetime):
        payment_date = payment_date.date()
    if isinstance(payment_date, str):
        payment_date = datetime.strptime(payment_date[:10], "%Y-%m-%d").date()

    days = (end_date - payment_date).days if payment_date else 0
    if days <= 0:
        return "today"
    if days <= 7:
        return "1_7"
    return "8_30"


def _recent_payments_heatmap(end_date):
    start_date = end_date - timedelta(days=30)
    bands = [
        {"key": "50k_plus", "label": "Rs 50k+"},
        {"key": "10k_50k", "label": "Rs 10k-50k"},
        {"key": "1k_10k", "label": "Rs 1k-10k"},
        {"key": "under_1k", "label": "Under Rs 1k"},
    ]
    recency = [
        {"key": "today", "label": "Today"},
        {"key": "1_7", "label": "1-7 Days"},
        {"key": "8_30", "label": "8-30 Days"},
    ]
    cells = {
        band["key"]: {
            bucket["key"]: {"count": 0, "total": 0, "payments": []}
            for bucket in recency
        }
        for band in bands
    }

    rows = (
        db.session.query(Payment, Customer)
        .outerjoin(Customer, Customer.id == Payment.customer_id)
        .filter(_range_filter(Payment.timestamp, start_date, end_date))
        .order_by(Payment.timestamp.desc())
        .all()
    )

    for payment, customer in rows:
        band_key = _payment_amount_band(payment.amount)
        bucket_key = _payment_recency_bucket(payment.timestamp, end_date)
        cell = cells[band_key][bucket_key]
        cell["count"] += 1
        cell["total"] += float(payment.amount or 0)
        cell["payments"].append({
            "payment_id": payment.id,
            "customer_id": payment.customer_id,
            "customer_name": customer.name if customer else "Walk-in",
            "phone": customer.phone if customer else None,
            "amount": _money(payment.amount),
            "method": payment.method,
            "date": payment.timestamp.date().isoformat() if payment.timestamp else None,
            "notes": payment.notes,
        })

    for band in bands:
        for bucket in recency:
            cell = cells[band["key"]][bucket["key"]]
            cell["total"] = _money(cell["total"])

    return {
        "basis": f"{start_date.isoformat()} to {end_date.isoformat()}",
        "bands": bands,
        "recency": recency,
        "cells": cells,
    }


def _top_category_for_customer(customer_id, start_date=None, end_date=None):
    query = (
        db.session.query(
            func.coalesce(Item.category, "Uncategorized").label("category"),
            func.sum(BillItem.final_item_amount).label("revenue"),
        )
        .join(Bill, Bill.id == BillItem.bill_id)
        .outerjoin(Item, func.lower(Item.name) == func.lower(BillItem.item_name))
        .filter(Bill.customer_id == customer_id)
    )
    if start_date and end_date:
        query = query.filter(_range_filter(Bill.timestamp, start_date, end_date))

    row = (
        query.group_by(func.coalesce(Item.category, "Uncategorized"))
        .order_by(func.sum(BillItem.final_item_amount).desc())
        .first()
    )
    return row.category if row else None


@analytics_bp.route("")
@admin_required
def analytics_dashboard():
    return render_template("analytics_dashboard.html")


@analytics_bp.route("/api/summary")
@admin_required
def dashboard_summary():
    start_date, end_date, period = _period_bounds()
    previous_start, previous_end = _previous_period_bounds(start_date, end_date)
    bill_range = _range_filter(Bill.timestamp, start_date, end_date)
    previous_bill_range = _range_filter(Bill.timestamp, previous_start, previous_end)
    payment_range = _range_filter(Payment.timestamp, start_date, end_date)

    total_revenue = _money(db.session.query(func.sum(Bill.final_amount)).filter(bill_range).scalar())
    previous_revenue = _money(db.session.query(func.sum(Bill.final_amount)).filter(previous_bill_range).scalar())
    total_bills = db.session.query(func.count(Bill.id)).filter(bill_range).scalar() or 0
    active_customers = db.session.query(func.count(distinct(Bill.customer_id))).filter(bill_range, Bill.customer_id.isnot(None)).scalar() or 0
    total_units = _money(
        db.session.query(func.sum(BillItem.qty))
        .join(Bill, Bill.id == BillItem.bill_id)
        .filter(bill_range)
        .scalar()
    )
    total_payments = _money(db.session.query(func.sum(Payment.amount)).filter(payment_range).scalar())

    first_bill = _customer_first_bill_subquery()
    customer_type_rows = (
        db.session.query(
            case((first_bill.c.first_bill_date >= start_date, "new"), else_="repeat").label("customer_type"),
            func.count(distinct(Bill.customer_id)).label("customers"),
            func.sum(Bill.final_amount).label("revenue"),
        )
        .join(first_bill, first_bill.c.customer_id == Bill.customer_id)
        .filter(bill_range, Bill.customer_id.isnot(None))
        .group_by("customer_type")
        .all()
    )
    by_type = {
        "new": {"customers": 0, "revenue": 0},
        "repeat": {"customers": 0, "revenue": 0},
    }
    for row in customer_type_rows:
        by_type[row.customer_type] = {
            "customers": int(row.customers or 0),
            "revenue": _money(row.revenue),
        }

    cost_filter = and_(bill_range, BillItem.cost_price.isnot(None), BillItem.cost_price > 0)
    cost_basis = db.session.query(
        func.sum(BillItem.cost_price * BillItem.qty),
        func.sum(BillItem.final_item_amount),
    ).join(Bill, Bill.id == BillItem.bill_id).filter(cost_filter).first()
    known_cost = _money(cost_basis[0] if cost_basis else 0)
    costed_revenue = _money(cost_basis[1] if cost_basis else 0)
    gross_margin = _money(costed_revenue - known_cost)

    margin_category_rows = (
        db.session.query(
            func.coalesce(Item.category, "Uncategorized").label("category"),
            func.sum(BillItem.cost_price * BillItem.qty).label("known_cost"),
            func.sum(BillItem.final_item_amount).label("costed_revenue"),
        )
        .join(Bill, Bill.id == BillItem.bill_id)
        .outerjoin(Item, func.lower(Item.name) == func.lower(BillItem.item_name))
        .filter(cost_filter)
        .group_by(func.coalesce(Item.category, "Uncategorized"))
        .order_by((func.sum(BillItem.final_item_amount) - func.sum(BillItem.cost_price * BillItem.qty)).desc())
        .limit(8)
        .all()
    )

    category_rows = (
        db.session.query(
            func.coalesce(Item.category, "Uncategorized").label("category"),
            func.sum(BillItem.final_item_amount).label("revenue"),
        )
        .join(Bill, Bill.id == BillItem.bill_id)
        .outerjoin(Item, func.lower(Item.name) == func.lower(BillItem.item_name))
        .filter(bill_range)
        .group_by(func.coalesce(Item.category, "Uncategorized"))
        .order_by(func.sum(BillItem.final_item_amount).desc())
        .limit(6)
        .all()
    )

    outstanding_rows = _outstanding_rows(end_date)
    total_outstanding = _money(sum(float(row.outstanding_amount or 0) for row in outstanding_rows))
    top_debtors = [
        {
            "customer_id": row.customer_id,
            "name": row.customer_name,
            "phone": row.customer_phone,
            "outstanding": _money(row.outstanding_amount),
        }
        for row in outstanding_rows[:5]
    ]
    aging_buckets = _aging_payload(end_date)

    top_customer_revenue = (
        db.session.query(
            Bill.customer_id.label("customer_id"),
            func.sum(Bill.final_amount).label("revenue"),
        )
        .filter(bill_range, Bill.customer_id.isnot(None))
        .group_by(Bill.customer_id)
        .order_by(func.sum(Bill.final_amount).desc())
        .limit(5)
        .all()
    )
    top_customer_total = sum(float(row.revenue or 0) for row in top_customer_revenue)

    top_product_rows = (
        db.session.query(
            BillItem.item_name.label("item_name"),
            func.sum(BillItem.final_item_amount).label("revenue"),
            func.sum(BillItem.qty).label("units"),
        )
        .join(Bill, Bill.id == BillItem.bill_id)
        .filter(bill_range)
        .group_by(BillItem.item_name)
        .order_by(func.sum(BillItem.final_item_amount).desc())
        .limit(8)
        .all()
    )

    slow_cutoff = end_date - timedelta(days=30)
    last_sale = (
        db.session.query(
            BillItem.item_name.label("item_name"),
            func.max(_date_col(Bill.timestamp)).label("last_sale_date"),
        )
        .join(Bill, Bill.id == BillItem.bill_id)
        .filter(_date_col(Bill.timestamp) <= end_date)
        .group_by(BillItem.item_name)
        .subquery()
    )
    slow_items = (
        db.session.query(func.count(Item.id))
        .outerjoin(last_sale, func.lower(last_sale.c.item_name) == func.lower(Item.name))
        .filter(or_(last_sale.c.last_sale_date.is_(None), last_sale.c.last_sale_date < slow_cutoff))
        .scalar()
        or 0
    )

    return jsonify({
        "period": {"key": period, "start": start_date.isoformat(), "end": end_date.isoformat()},
        "previous_period": {"start": previous_start.isoformat(), "end": previous_end.isoformat()},
        "revenue": {
            "total": total_revenue,
            "previous_total": previous_revenue,
            "growth_pct": _pct_delta(total_revenue, previous_revenue),
            "change": _money(total_revenue - previous_revenue),
            "bills": total_bills,
            "avg_bill": _money(total_revenue / total_bills) if total_bills else 0,
            "units": total_units,
            "units_per_bill": _money(total_units / total_bills) if total_bills else 0,
            "revenue_per_customer": _money(total_revenue / active_customers) if active_customers else 0,
            "by_type": by_type,
        },
        "customers": {
            "active": int(active_customers),
            "new": by_type["new"]["customers"],
            "repeat": by_type["repeat"]["customers"],
            "repeat_pct": _safe_pct(by_type["repeat"]["customers"], active_customers),
            "top_customer_concentration_pct": _safe_pct(top_customer_total, total_revenue),
        },
        "cash": {
            "payments": total_payments,
            "collection_rate_pct": _safe_pct(total_payments, total_revenue),
            "outstanding": total_outstanding,
            "outstanding_pct": _safe_pct(total_outstanding, total_revenue),
            "top_debtors": top_debtors,
            "aging_buckets": [{"bucket": bucket["bucket"], "total": bucket["total"], "count": len(bucket["customers"])} for bucket in aging_buckets],
        },
        "margin": {
            "known_cost": known_cost,
            "costed_revenue": costed_revenue,
            "gross_margin": gross_margin,
            "margin_pct": _safe_pct(gross_margin, costed_revenue),
            "note": "Cost-based metrics ignore rows with blank or zero cost price.",
            "by_category": [
                {
                    "category": row.category,
                    "known_cost": _money(row.known_cost),
                    "costed_revenue": _money(row.costed_revenue),
                    "margin": _money(float(row.costed_revenue or 0) - float(row.known_cost or 0)),
                    "margin_pct": _safe_pct(float(row.costed_revenue or 0) - float(row.known_cost or 0), row.costed_revenue),
                }
                for row in margin_category_rows
            ],
        },
        "categories": [
            {"category": row.category, "revenue": _money(row.revenue), "pct": _safe_pct(row.revenue, total_revenue)}
            for row in category_rows
        ],
        "top_products": [
            {
                "name": row.item_name,
                "revenue": _money(row.revenue),
                "units": _money(row.units),
                "pct": _safe_pct(row.revenue, total_revenue),
            }
            for row in top_product_rows
        ],
        "slow_items": int(slow_items),
    })


@analytics_bp.route("/api/revenue/detail")
@admin_required
def revenue_detail():
    start_date, end_date, period = _period_bounds()
    bill_range = _range_filter(Bill.timestamp, start_date, end_date)

    daily_rows = (
        db.session.query(
            _date_col(Bill.timestamp).label("day"),
            func.sum(Bill.final_amount).label("revenue"),
            func.count(Bill.id).label("bills"),
        )
        .filter(bill_range)
        .group_by(_date_col(Bill.timestamp))
        .order_by(_date_col(Bill.timestamp))
        .all()
    )

    first_bill = _customer_first_bill_subquery()
    customer_rows = (
        db.session.query(
            Customer.id.label("customer_id"),
            Customer.name.label("name"),
            Customer.phone.label("phone"),
            case((first_bill.c.first_bill_date >= start_date, "new"), else_="repeat").label("customer_type"),
            func.sum(Bill.final_amount).label("revenue"),
            func.count(Bill.id).label("bills"),
            first_bill.c.lifetime_bills.label("lifetime_bills"),
            func.min(_date_col(Bill.timestamp)).label("first_purchase"),
            func.max(_date_col(Bill.timestamp)).label("last_purchase"),
        )
        .join(Bill, Bill.customer_id == Customer.id)
        .join(first_bill, first_bill.c.customer_id == Customer.id)
        .filter(bill_range)
        .group_by(Customer.id, Customer.name, Customer.phone, first_bill.c.first_bill_date, first_bill.c.lifetime_bills)
        .order_by(func.sum(Bill.final_amount).desc())
        .limit(40)
        .all()
    )

    grouped = {
        "new": {"total": 0, "count": 0, "customers": []},
        "repeat": {"total": 0, "count": 0, "customers": []},
    }
    for row in customer_rows:
        payload = {
            "customer_id": row.customer_id,
            "name": row.name,
            "phone": row.phone,
            "revenue": _money(row.revenue),
            "bills": int(row.bills or 0),
            "previous_purchases": max(int(row.lifetime_bills or 0) - int(row.bills or 0), 0),
            "first_purchase": str(row.first_purchase),
            "last_purchase": str(row.last_purchase),
            "category_preference": _top_category_for_customer(row.customer_id, start_date, end_date),
        }
        grouped[row.customer_type]["total"] += payload["revenue"]
        grouped[row.customer_type]["count"] += 1
        grouped[row.customer_type]["customers"].append(payload)

    category_rows = (
        db.session.query(
            func.coalesce(Item.category, "Uncategorized").label("category"),
            func.sum(BillItem.final_item_amount).label("revenue"),
            func.sum(BillItem.qty).label("units"),
            func.count(distinct(Bill.id)).label("bills"),
        )
        .join(Bill, Bill.id == BillItem.bill_id)
        .outerjoin(Item, func.lower(Item.name) == func.lower(BillItem.item_name))
        .filter(bill_range)
        .group_by(func.coalesce(Item.category, "Uncategorized"))
        .order_by(func.sum(BillItem.final_item_amount).desc())
        .all()
    )
    total_revenue = sum(float(row.revenue or 0) for row in category_rows)

    top_customers = sorted(
        grouped["new"]["customers"] + grouped["repeat"]["customers"],
        key=lambda item: item["revenue"],
        reverse=True,
    )[:15]

    return jsonify({
        "period": {"key": period, "start": start_date.isoformat(), "end": end_date.isoformat()},
        "daily_revenue": [
            {"date": str(row.day), "revenue": _money(row.revenue), "bills": int(row.bills or 0)}
            for row in daily_rows
        ],
        "by_customer_type": grouped,
        "by_category": [
            {
                "category": row.category,
                "revenue": _money(row.revenue),
                "units": _money(row.units),
                "bills": int(row.bills or 0),
                "pct": _safe_pct(row.revenue, total_revenue),
            }
            for row in category_rows
        ],
        "top_customers": top_customers,
    })


@analytics_bp.route("/api/category/<path:category>/detail")
@admin_required
def category_detail(category):
    start_date, end_date, period = _period_bounds()
    bill_range = _range_filter(Bill.timestamp, start_date, end_date)
    category_expr = func.coalesce(Item.category, "Uncategorized")

    item_rows = (
        db.session.query(
            BillItem.item_name.label("item_name"),
            func.sum(BillItem.qty).label("units"),
            func.sum(BillItem.final_item_amount).label("revenue"),
            func.sum(case((and_(BillItem.cost_price.isnot(None), BillItem.cost_price > 0), BillItem.cost_price * BillItem.qty), else_=0)).label("known_cost"),
            func.sum(case((and_(BillItem.cost_price.isnot(None), BillItem.cost_price > 0), BillItem.final_item_amount), else_=0)).label("costed_revenue"),
        )
        .join(Bill, Bill.id == BillItem.bill_id)
        .outerjoin(Item, func.lower(Item.name) == func.lower(BillItem.item_name))
        .filter(bill_range, category_expr == category)
        .group_by(BillItem.item_name)
        .order_by(func.sum(BillItem.final_item_amount).desc())
        .limit(50)
        .all()
    )

    trend_rows = (
        db.session.query(
            _date_col(Bill.timestamp).label("day"),
            func.sum(BillItem.final_item_amount).label("revenue"),
        )
        .join(Bill, Bill.id == BillItem.bill_id)
        .outerjoin(Item, func.lower(Item.name) == func.lower(BillItem.item_name))
        .filter(bill_range, category_expr == category)
        .group_by(_date_col(Bill.timestamp))
        .order_by(_date_col(Bill.timestamp))
        .all()
    )

    total = sum(float(row.revenue or 0) for row in item_rows)

    return jsonify({
        "period": {"key": period, "start": start_date.isoformat(), "end": end_date.isoformat()},
        "category": category,
        "revenue": {"total": _money(total)},
        "items": [
            {
                "name": row.item_name,
                "units": _money(row.units),
                "revenue": _money(row.revenue),
                "known_cost": _money(row.known_cost),
                "margin": _money(float(row.costed_revenue or 0) - float(row.known_cost or 0)),
                "margin_pct": _safe_pct(float(row.costed_revenue or 0) - float(row.known_cost or 0), row.costed_revenue),
            }
            for row in item_rows
        ],
        "trend": [{"date": str(row.day), "revenue": _money(row.revenue)} for row in trend_rows],
    })


@analytics_bp.route("/api/customer/<int:customer_id>/profile")
@admin_required
def customer_profile(customer_id):
    customer = Customer.query.get_or_404(customer_id)
    bills = Bill.query.filter_by(customer_id=customer.id).order_by(Bill.timestamp.desc()).limit(12).all()
    payments = Payment.query.filter_by(customer_id=customer.id).order_by(Payment.timestamp.desc()).limit(8).all()
    lifetime = (
        db.session.query(
            func.sum(Bill.final_amount).label("spent"),
            func.count(Bill.id).label("bills"),
            func.min(_date_col(Bill.timestamp)).label("first_purchase"),
            func.max(_date_col(Bill.timestamp)).label("last_purchase"),
        )
        .filter(Bill.customer_id == customer.id)
        .first()
    )

    outstanding = _money(sum(float(row.outstanding_amount or 0) for row in _outstanding_rows() if row.customer_id == customer.id))

    return jsonify({
        "customer": {
            "id": customer.id,
            "name": customer.name,
            "phone": customer.phone,
            "address": customer.address,
            "village": customer.village,
            "customer_type": customer.customer_type,
        },
        "summary": {
            "total_spent": _money(lifetime.spent if lifetime else 0),
            "bills_count": int(lifetime.bills or 0) if lifetime else 0,
            "outstanding": outstanding,
            "first_purchase": str(lifetime.first_purchase) if lifetime and lifetime.first_purchase else None,
            "last_purchase": str(lifetime.last_purchase) if lifetime and lifetime.last_purchase else None,
            "is_repeat": bool(lifetime and (lifetime.bills or 0) > 1),
        },
        "purchases": [
            {
                "bill_id": bill.id,
                "date": bill.timestamp.date().isoformat() if bill.timestamp else None,
                "amount": _money(bill.final_amount),
                "items_count": len(bill.items),
                "categories": sorted({item.category or "Uncategorized" for item in Item.query.filter(Item.name.in_([bi.item_name for bi in bill.items])).all()}),
            }
            for bill in bills
        ],
        "payments": [
            {
                "payment_id": payment.id,
                "date": payment.timestamp.date().isoformat() if payment.timestamp else None,
                "amount": _money(payment.amount),
                "method": payment.method,
            }
            for payment in payments
        ],
    })


@analytics_bp.route("/api/outstanding/detail")
@admin_required
def outstanding_detail():
    end_date = _period_bounds()[1]
    payload = _aging_payload(end_date)

    return jsonify({
        "total_outstanding": _money(sum(bucket["total"] for bucket in payload)),
        "aging_buckets": payload,
        "recent_payments": _recent_payments_heatmap(end_date),
        "note": "Aging is based on oldest open ledger activity because bill-level due dates are not in the schema.",
    })


@analytics_bp.route("/api/items/slow-moving")
@admin_required
def slow_items_detail():
    start_date, end_date, period = _period_bounds()
    cutoff_days = request.args.get("days", 30, type=int)
    cutoff_date = end_date - timedelta(days=cutoff_days)

    sales = (
        db.session.query(
            BillItem.item_name.label("item_name"),
            func.max(_date_col(Bill.timestamp)).label("last_sale_date"),
            func.sum(BillItem.qty).label("units_sold"),
            func.sum(BillItem.final_item_amount).label("revenue"),
        )
        .join(Bill, Bill.id == BillItem.bill_id)
        .filter(_date_col(Bill.timestamp) <= end_date)
        .group_by(BillItem.item_name)
        .subquery()
    )

    rows = (
        db.session.query(
            Item.id,
            Item.name,
            Item.category,
            Item.default_price,
            Item.cost_price,
            sales.c.last_sale_date,
            sales.c.units_sold,
            sales.c.revenue,
        )
        .outerjoin(sales, func.lower(sales.c.item_name) == func.lower(Item.name))
        .filter(or_(sales.c.last_sale_date.is_(None), sales.c.last_sale_date < cutoff_date))
        .order_by(sales.c.last_sale_date.asc().nullsfirst() if _is_postgres() else sales.c.last_sale_date.asc(), Item.name.asc())
        .limit(100)
        .all()
    )

    return jsonify({
        "period": {"key": period, "start": start_date.isoformat(), "end": end_date.isoformat()},
        "cutoff_days": cutoff_days,
        "total_slow_items": len(rows),
        "items": [
            {
                "item_id": row.id,
                "name": row.name,
                "category": row.category or "Uncategorized",
                "default_price": _money(row.default_price),
                "cost_price": _money(row.cost_price) if row.cost_price and float(row.cost_price) > 0 else None,
                "last_sale_date": str(row.last_sale_date) if row.last_sale_date else None,
                "days_since_sale": (end_date - (datetime.strptime(row.last_sale_date, "%Y-%m-%d").date() if isinstance(row.last_sale_date, str) else row.last_sale_date)).days if row.last_sale_date else None,
                "sales_to_date": _money(row.revenue),
                "units_to_date": _money(row.units_sold),
            }
            for row in rows
        ],
    })
