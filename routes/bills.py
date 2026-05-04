from flask import Blueprint, request, jsonify
from flask_security import hash_password
from auth_helpers import admin_required, customer_placeholder_email
from extensions import db
from models import Bill, BillItem, Customer, Transaction, User, Wallet, Item, Role
from datetime import datetime
from zoneinfo import ZoneInfo
import uuid



bills_bp = Blueprint("bills", __name__)


def _customer_role():
    role = Role.query.filter_by(name="customer").first()
    if not role:
        role = Role(name="customer", description="Customer")
        db.session.add(role)
        db.session.flush()
    return role


# --------------------------------
# CREATE BILL
# --------------------------------
@bills_bp.route("/api/bills", methods=["POST"])
@admin_required
def save_bill():

    data = request.get_json(force=True)

    bill_discount = data.get("billDiscount") or {}

    customer = None
    customer_id = data.get("customer_id")
    
    # Handle walk-in customer creation with referral support
    if not customer_id and data.get("customer_name") and data.get("customer_phone"):
        # New walk-in customer - create them with optional referral
        name = data.get("customer_name", "").strip()
        phone = data.get("customer_phone", "").strip()
        address = data.get("customer_address", "").strip() or None
        referral_code = data.get("referral_code")
        
        # Check if customer already exists
        existing = Customer.query.filter_by(phone=phone).first()
        if existing:
            customer = existing
        else:
            # Look up referrer if referral code provided
            referrer = None
            if referral_code:
                referrer = Customer.query.filter_by(referral_code=referral_code).first()
            
            # Generate auto-referral code (same logic as /api/customers)
            name_part = (name or '')[:3]
            phone_part = (phone or '')[:3]
            auto_referral_code = name_part + phone_part
            
            # Create User account
            fake_password = uuid.uuid4().hex
            user = User(
                email=customer_placeholder_email(phone),
                password=hash_password(fake_password),
                active=True
            )
            user.roles.append(_customer_role())
            db.session.add(user)
            db.session.flush()
            
            # Create Customer with referral link
            customer = Customer(
                user_id=user.id,
                name=name,
                phone=phone,
                address=address,
                referred_by_id=referrer.id if referrer else None,
                customer_type="walkin",
                referral_code=auto_referral_code
            )
            db.session.add(customer)
            db.session.flush()
            
            # Create Wallet
            wallet = Wallet(customer_id=customer.id, balance=0.0)
            db.session.add(wallet)
    elif customer_id:
        customer = db.session.get(Customer, customer_id)
    
    date_str = (data.get("bill_date") or "").strip()
    if date_str:
        try:
            bill_timestamp = datetime.strptime(date_str, "%Y-%m-%d").replace(
                hour=12, minute=0, second=0, microsecond=0
            )
        except ValueError:
            return jsonify({"message": "Invalid bill date"}), 400
    else:
        bill_timestamp = datetime.now(ZoneInfo("Asia/Kolkata"))

    bill = Bill(
        subtotal=data["subtotal"],
        final_amount=data["finalTotal"],
        bill_discount_type=bill_discount.get("type"),
        bill_discount_value=bill_discount.get("value"),
        timestamp=bill_timestamp,
        customer=customer
    )

    # Add bill items
    
    for it in data["items"]:
        discount = it.get("discount") or {}

        # Look up item to get cost_price
        item_obj = Item.query.filter_by(name=it["name"]).first()
        cost_price = item_obj.cost_price if item_obj and item_obj.cost_price else None

        item = BillItem(
            item_name=it["name"],
            qty=it["qty"],
            cost_price=cost_price,
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
        "customer_id": customer.id if customer else None,
        "timestamp": bill.timestamp.astimezone(ZoneInfo("Asia/Kolkata")).isoformat()
    }), 201


# --------------------------------
# LIST BILLS
# --------------------------------
@bills_bp.route("/api/bills", methods=["GET"])
@admin_required
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
@admin_required
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
@admin_required
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
@admin_required
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
