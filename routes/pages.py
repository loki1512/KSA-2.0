from flask import Blueprint, render_template, abort
from flask_security import auth_required
from models import Bill, BillItem, Customer, Transaction
from sqlalchemy import func, desc
from extensions import db

pages_bp = Blueprint("pages", __name__)


@pages_bp.route("/ping")
def ping():
    return "pong"


# ---- Billing ----
@pages_bp.route("/billing")
@auth_required()
def index():
    return render_template("billing.html")


# ---- Catalog ----
@pages_bp.route("/catalog")
@auth_required()
def catalog():
    return render_template("catalog.html")


# ---- Bills list ----
@pages_bp.route("/bills")
@auth_required()
def bills_page():
    bills = Bill.query.order_by(Bill.timestamp.desc()).all()
    return render_template("bills.html", bills=bills)


# ---- Bill detail ----
@pages_bp.route("/bills/<int:bill_id>")
@auth_required()
def bill_detail_page(bill_id):
    bill  = Bill.query.get_or_404(bill_id)
    items = BillItem.query.filter_by(bill_id=bill.id).all()
    return render_template("bill_detail.html", bill=bill, items=items)


# ---- Edit bill ----
@pages_bp.route("/bills/edit/<int:bill_id>")
@auth_required()
def update_bill_page(bill_id):
    bill  = Bill.query.get_or_404(bill_id)
    items = BillItem.query.filter_by(bill_id=bill.id).all()

    items_data = [
        {
            "item_name":           i.item_name,
            "qty":                 i.qty,
            "unit_price":          i.unit_price,
            "item_discount_type":  i.item_discount_type,
            "item_discount_value": i.item_discount_value,
            "final_item_amount":   i.final_item_amount
        }
        for i in items
    ]

    return render_template(
        "update_bill.html",
        bill=bill,
        items=items,
        items_json=items_data
    )


# ---- All transactions feed ----
@pages_bp.route("/transactions")
@auth_required()
def transactions_page():
    return render_template("transactions.html")


# ---- Admin: customer list (top 200 by value) ----
@pages_bp.route("/customers")
@auth_required()
def customers_page():
    return render_template("customers.html")


# ---- Admin: single customer ledger ----
@pages_bp.route("/customers/<int:customer_id>/ledger")
@auth_required()
def customer_ledger_page(customer_id):
    customer = Customer.query.get_or_404(customer_id)
    return render_template("customer_ledger.html", customer=customer)

@pages_bp.route("/returns/new")
@auth_required()
def customer_returns():
    return render_template("returns.html")


# ---- Public: customer self-service portal ----
@pages_bp.route("/my-account")
def my_account():
    """No auth — customer enters phone number to view their ledger."""
    return render_template("my_account.html")