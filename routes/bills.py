from flask import Blueprint, request, jsonify
from extensions import db
from models import Bill, BillItem, Customer, Transaction
from datetime import datetime
from zoneinfo import ZoneInfo



bills_bp = Blueprint("bills", __name__)


# --------------------------------
# CREATE BILL
# --------------------------------
@bills_bp.route("/api/bills", methods=["POST"])
def save_bill():

    data = request.get_json(force=True)

    bill_discount = data.get("billDiscount") or {}

    customer = None
    if data.get("customer_id"):
        customer = db.session.get(Customer, data["customer_id"])
    if data["bill_date"]:date_str = data["bill_date"]
    else:
        date_str = datetime.now(ZoneInfo("Asia/Kolkata")).strftime("%Y-%m-%d")
    timestamp = datetime.strptime(date_str, "%Y-%m-%d") or datetime.now(ZoneInfo("Asia/Kolkata"))

    bill = Bill(
        subtotal=data["subtotal"],
        final_amount=data["finalTotal"],
        bill_discount_type=bill_discount.get("type"),
        bill_discount_value=bill_discount.get("value"),
        timestamp = timestamp ,
        customer=customer
    )

    # Add bill items
    for it in data["items"]:
        discount = it.get("discount") or {}

        item = BillItem(
            item_name=it["name"],
            qty=it["qty"],
            unit_price=it["rate"],
            item_discount_type=discount.get("type"),
            item_discount_value=discount.get("value"),
            final_item_amount=it["lineTotal"]
        )

        bill.items.append(item)

    db.session.add(bill)
    db.session.flush()

    # Create SALE transaction
    if customer:
        txn = Transaction(
            customer_id=customer.id,
            transaction_type="SALE",
            amount=bill.final_amount,
            reference_type="bill",
            reference_id=bill.id
        )
        db.session.add(txn)

    #-- Deduct from wallet -----
    if customer and customer.wallet :
        customer.wallet.balance -= bill.final_amount
        db.session.add(customer.wallet)

    db.session.commit()

    return jsonify({
        "bill_id": bill.id,
        "timestamp": bill.timestamp.astimezone(ZoneInfo("Asia/Kolkata")).isoformat()
    }), 201


# --------------------------------
# LIST BILLS
# --------------------------------
@bills_bp.route("/api/bills", methods=["GET"])
def list_bills():

    bills = Bill.query.order_by(Bill.timestamp.desc()).all()

    return jsonify([
        {
            "id": bill.id,
            "timestamp": bill.timestamp.isoformat(),
            "final_amount": bill.final_amount,
            "customer_name": bill.customer.name if bill.customer else None
        }
        for bill in bills
    ])


# --------------------------------
# BILL DETAILS
# --------------------------------
@bills_bp.route("/api/bills/<int:bill_id>", methods=["GET"])
def get_bill(bill_id):

    bill = Bill.query.get_or_404(bill_id)
    if not bill:
        return jsonify({"error": "Bill not found"}), 404
    return jsonify({
        "id": bill.id,
        "timestamp": bill.timestamp.isoformat(),

        "subtotal": bill.subtotal,
        "bill_discount_type": bill.bill_discount_type,
        "bill_discount_value": bill.bill_discount_value,
        "final_amount": bill.final_amount,

        "customer": {
            "id": bill.customer.id,
            "name": bill.customer.name,
            "phone": bill.customer.phone,
            "address": bill.customer.address
        } if bill.customer else None,

        "items": [
            {
                "item_name": i.item_name,
                "qty": i.qty,
                "unit_price": i.unit_price,
                "item_discount_type": i.item_discount_type,
                "item_discount_value": i.item_discount_value,
                "final_item_amount": i.final_item_amount
            }
            for i in bill.items
        ]
    })


# --------------------------------
# UPDATE BILL
# --------------------------------
@bills_bp.route("/api/bills/<int:bill_id>", methods=["PUT"])
def update_bill(bill_id):

    bill = Bill.query.get_or_404(bill_id)

    if bill.customer and bill.customer.wallet:
        wallet_change = bill.final_amount

    data = request.get_json(force=True)

    bill.subtotal = data["subtotal"]
    bill.final_amount = data["finalTotal"]

    bill_discount = data.get("billDiscount") or {}

    bill.bill_discount_type = bill_discount.get("type")
    bill.bill_discount_value = bill_discount.get("value")

    

    # Replace items
    bill.items.clear()

    for it in data["items"]:
        discount = it.get("discount") or {}

        item = BillItem(
            item_name=it["name"],
            qty=it["qty"],
            unit_price=it["rate"],
            item_discount_type=discount.get("type"),
            item_discount_value=discount.get("value"),
            final_item_amount=it["lineTotal"]
        )

        bill.items.append(item)

    # Update SALE transaction
    txn = Transaction.query.filter_by(
        reference_type="bill",
        reference_id=bill.id
    ).first()

    if txn:
        txn.amount = bill.final_amount
        txn.customer_id = bill.customer_id
        db.session.add(txn)
    
    #-- Adjust wallet balance if linked to a customer -----
    if bill.customer and bill.customer.wallet:
        new_wallet_change = bill.final_amount
        wallet_diff = new_wallet_change - wallet_change
        bill.customer.wallet.balance -= wallet_diff
        db.session.add(bill.customer.wallet)

    db.session.commit()

    return jsonify({"message": "Bill updated successfully"})


# --------------------------------
# DELETE BILL
# --------------------------------
@bills_bp.route("/api/bills/<int:bill_id>", methods=["DELETE"])
def delete_bill(bill_id):

    bill = Bill.query.get_or_404(bill_id)

    # Create bill deletion transaction (negative SALE to offset original SALE)
    if bill.customer:
        txn = Transaction(
            customer_id=bill.customer.id,
            transaction_type="BILL_DELETION",
            amount=-bill.final_amount,   # negative to offset original SALE
            reference_type="bill",
            reference_id=bill.id,
            notes="Bill deleted"
        )
        db.session.add(txn)

    db.session.delete(bill)
    # Adjust wallet if linked to a customer
    if bill.customer and bill.customer.wallet:
        bill.customer.wallet.balance += bill.final_amount
        db.session.add(bill.customer.wallet)
    db.session.commit()

    return jsonify({
        "message": "Bill deleted successfully"
    }), 200