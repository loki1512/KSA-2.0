from flask import Blueprint, request, jsonify
from flask_security import auth_required, hash_password
from extensions import db, security
from models import Customer, Wallet, Bill, Transaction, User
from sqlalchemy import func, desc, or_
import uuid

customers_bp = Blueprint("customers", __name__)


# --------------------------------
# CREATE CUSTOMER  (auto-creates User)
# --------------------------------
@customers_bp.route("/api/customers", methods=["POST"])
@auth_required()
def create_customer():

    data = request.get_json(force=True)

    name          = data.get("name", "").strip()
    phone         = data.get("phone", "").strip()
    address       = data.get("address")
    village       = data.get("village")
    referral_code = data.get("referral_code")
    customer_type = data.get("customer_type", "regular")

    if not name or not phone:
        return jsonify({"message": "Name and phone required"}), 400

    existing = Customer.query.filter_by(phone=phone).first()
    if existing:
        return jsonify({"message": "Customer with this phone already exists"}), 400

    referrer = None
    if referral_code:
        referrer = Customer.query.filter_by(referral_code=referral_code).first()

    # Auto-create a User so the customer can (optionally) log in later.
    # Email derived from phone; password is a random UUID (not used for login).
    fake_email = f"{phone}@ksa.local"
    fake_password = uuid.uuid4().hex

    user = User(
        email=fake_email,
        password=hash_password(fake_password),
        active=True
    )

    db.session.add(user)
    db.session.flush()
    customer = Customer(
        user_id=user.id,
        name=name,
        phone=phone,
        address=address,
        village=village,
        referred_by_id=referrer.id if referrer else None,
        customer_type=customer_type,
        referral_code=name[:3]+phone[-3:]+village[:3]  # unique referral code
    )

    db.session.add(customer)
    db.session.flush()

    wallet = Wallet(customer_id=customer.id, balance=0.0)
    db.session.add(wallet)

    db.session.commit()

    return jsonify({
        "message": "Customer created successfully",
        "customer_id": customer.id,
        "referral_code": customer.referral_code
    }), 201


# --------------------------------
# LIST ALL CUSTOMERS
# --------------------------------
@customers_bp.route("/api/customers", methods=["GET"])
@auth_required()
def list_customers():

    customers = Customer.query.order_by(Customer.name).all()

    return jsonify([
        {
            "id": c.id,
            "name": c.name,
            "phone": c.phone,
            "village": c.village,
            "customer_type": c.customer_type,
            "wallet_balance": c.wallet.balance if c.wallet else 0.0
        }
        for c in customers
    ])


# --------------------------------
# SEARCH CUSTOMERS
# --------------------------------
@customers_bp.route("/api/customers/search")
@auth_required()
def search_customers():

    q = request.args.get("q", "").strip()

    if not q:
        return jsonify([])

    keywords = q.lower().split()

    results = Customer.query

    for kw in keywords:
        results = results.filter(
            or_(
                Customer.name.ilike(f"%{kw}%"),
                Customer.phone.ilike(f"%{kw}%"),
                Customer.village.ilike(f"%{kw}%"),
                Customer.customer_type.ilike(f"%{kw}%")
            )
        )

    customers = results.limit(30).all()

    return jsonify([
        {
            "id": c.id,
            "name": c.name,
            "phone": c.phone,
            "village": c.village,
            "customer_type": c.customer_type,
            "wallet_balance": c.wallet.balance if c.wallet else 0.0
        }
        for c in customers
    ])


# --------------------------------
# PUBLIC: LOOKUP BY PHONE (for customer portal — no auth)
# --------------------------------
@customers_bp.route("/api/customers/lookup")
def lookup_by_phone():
    """Public endpoint — customer enters their phone to see their ledger."""
    phone = request.args.get("phone", "").strip()

    if not phone or len(phone) < 10:
        return jsonify({"message": "Valid phone number required"}), 400

    customer = Customer.query.filter_by(phone=phone).first()

    if not customer:
        return jsonify({"message": "No account found for this number"}), 404

    transactions = (
        Transaction.query
        .filter_by(customer_id=customer.id)
        .order_by(Transaction.timestamp.desc())
        .all()
    )

    balance = sum(t.amount for t in transactions)

    return jsonify({
        "id": customer.id,
        "name": customer.name,
        "phone": customer.phone,
        "wallet_balance": customer.wallet.balance if customer.wallet else 0.0,
        "ledger_balance": balance,
        "transactions": [
            {
                "id": t.id,
                "type": t.transaction_type,
                "amount": t.amount,
                "reference_type": t.reference_type,
                "reference_id": t.reference_id,
                "timestamp": t.timestamp.isoformat()
            }
            for t in transactions
        ]
    })


# --------------------------------
# GET CUSTOMER
# --------------------------------
@customers_bp.route("/api/customers/<int:customer_id>", methods=["GET"])
@auth_required()
def get_customer(customer_id):

    customer = Customer.query.get_or_404(customer_id)

    referral_count = Customer.query.filter_by(
        referred_by_id=customer.id
    ).count()

    transactions = (
        Transaction.query
        .filter_by(customer_id=customer_id)
        .order_by(Transaction.timestamp.desc())
        .all()
    )

    ledger_balance = sum(t.amount for t in transactions)

    return jsonify({
        "id": customer.id,
        "name": customer.name,
        "phone": customer.phone,
        "address": customer.address,
        "village": customer.village,
        "referral_code": customer.referral_code,
        "customer_type": customer.customer_type,
        "referred_by": customer.referrer.name if customer.referrer else None,
        "referral_count": referral_count,
        "wallet_balance": customer.wallet.balance if customer.wallet else 0.0,
        "ledger_balance": ledger_balance
    })


# --------------------------------
# GET CUSTOMER BILLS
# --------------------------------
@customers_bp.route("/api/customers/<int:customer_id>/bills", methods=["GET"])
@auth_required()
def get_customer_bills(customer_id):

    Customer.query.get_or_404(customer_id)

    bills = (
        Bill.query
        .filter_by(customer_id=customer_id)
        .order_by(Bill.timestamp.desc())
        .all()
    )

    return jsonify([
        {
            "id": b.id,
            "timestamp": b.timestamp.isoformat(),
            "final_amount": b.final_amount,
            "subtotal": b.subtotal
        }
        for b in bills
    ])


# --------------------------------
# RECENT CUSTOMERS (last 200 by bill activity)
# --------------------------------
@customers_bp.route("/api/customers/recent", methods=["GET"])
@auth_required()
def recent_customers():

    bills = (
        Bill.query
        .filter(Bill.customer_id.isnot(None))
        .order_by(desc(Bill.timestamp))
        .limit(200)
        .all()
    )

    seen = set()
    customers = []

    for bill in bills:
        if bill.customer_id not in seen:
            seen.add(bill.customer_id)
            c = bill.customer
            customers.append({
                "id": c.id,
                "name": c.name,
                "phone": c.phone,
                "village": c.village,
                "wallet_balance": c.wallet.balance if c.wallet else 0
            })

    return jsonify(customers)


# --------------------------------
# TOP CUSTOMERS BY TOTAL SPEND
# --------------------------------
@customers_bp.route("/api/customers/top", methods=["GET"])
@auth_required()
def top_customers():
    """Returns first 200 customers ."""
    from sqlalchemy import func

    rows = (
        db.session.query(
            Customer,
            func.coalesce(func.sum(Bill.final_amount), 0).label("total_spent"),
            func.count(Bill.id).label("bill_count")
        )
        .outerjoin(Bill, Bill.customer_id == Customer.id)
        .group_by(Customer.id)
        .order_by(desc("total_spent"))
        .limit(200)
        .all()
    )
    
    print("Top customers query returned", len(rows), "rows")
    return jsonify([
        {
            "id": c.id,
            "name": c.name,
            "phone": c.phone,
            "village": c.village,
            "customer_type": c.customer_type,
            "wallet_balance": c.wallet.balance if c.wallet else 0.0,
            "total_spent": round(total, 2),
            "bill_count": bill_count
        }
        for c, total, bill_count in rows
    ])


# --------------------------------
# UPDATE CUSTOMER
# --------------------------------
@customers_bp.route("/api/customers/<int:customer_id>", methods=["PUT"])
@auth_required()
def update_customer(customer_id):

    customer = Customer.query.get_or_404(customer_id)
    data = request.get_json(force=True)

    customer.name          = data.get("name", customer.name)
    customer.phone         = data.get("phone", customer.phone)
    customer.address       = data.get("address", customer.address)
    customer.village       = data.get("village", customer.village)
    customer.customer_type = data.get("customer_type", customer.customer_type)

    db.session.commit()
    return jsonify({"message": "Customer updated successfully"})


# --------------------------------
# PATCH CUSTOMER
# --------------------------------
@customers_bp.route("/api/customers/<int:customer_id>", methods=["PATCH"])
@auth_required()
def patch_customer(customer_id):

    customer = Customer.query.get_or_404(customer_id)
    data = request.get_json(force=True)

    for field in ["name", "phone", "address", "village", "customer_type"]:
        if field in data:
            setattr(customer, field, data[field])

    db.session.commit()
    return jsonify({"message": "Customer updated successfully"})


# --------------------------------
# DELETE CUSTOMER
# --------------------------------
@customers_bp.route("/api/customers/<int:customer_id>", methods=["DELETE"])
@auth_required()
def delete_customer(customer_id):

    customer = Customer.query.get_or_404(customer_id)
    db.session.delete(customer)
    db.session.commit()
    return jsonify({"message": "Customer deleted successfully"})