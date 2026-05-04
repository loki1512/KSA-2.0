from flask import Blueprint, request, jsonify
from flask_security import auth_required, current_user, hash_password
from email_validator import EmailNotValidError, validate_email
from auth_helpers import (
    admin_required,
    customer_placeholder_email,
    is_internal_email,
    public_customer_email,
)
from extensions import db
from models import Customer, Wallet, Bill, Transaction, User, Role
from sqlalchemy import func, desc, or_
import uuid

customers_bp = Blueprint("customers", __name__)


def _normalize_optional_email(value):
    value = (value or "").strip()
    if not value:
        return None
    try:
        return validate_email(value, check_deliverability=False).normalized.lower()
    except EmailNotValidError:
        return False


def _email_conflict(email, user_id=None):
    if not email:
        return None
    query = User.query.filter(func.lower(User.email) == email.lower())
    if user_id:
        query = query.filter(User.id != user_id)
    return query.first()


def _customer_role():
    role = Role.query.filter_by(name="customer").first()
    if not role:
        role = Role(name="customer", description="Customer")
        db.session.add(role)
        db.session.flush()
    return role


def _ensure_customer_role(user):
    role = _customer_role()
    if role not in user.roles:
        user.roles.append(role)


def _customer_payload(customer):
    transactions = (
        Transaction.query
        .filter_by(customer_id=customer.id)
        .order_by(Transaction.timestamp.desc())
        .all()
    )
    balance = sum(t.amount for t in transactions)
    return {
        "id": customer.id,
        "name": customer.name,
        "phone": customer.phone,
        "email": public_customer_email(customer.user),
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
    }


# --------------------------------
# CREATE CUSTOMER  (auto-creates User)
# --------------------------------
@customers_bp.route("/api/customers", methods=["POST"])
@admin_required
def create_customer():

    data = request.get_json(force=True)

    name          = data.get("name", "").strip()
    phone         = data.get("phone", "").strip()
    email         = _normalize_optional_email(data.get("email"))
    password      = data.get("password", "").strip()
    address       = data.get("address")
    village       = data.get("village")
    referral_code = data.get("referral_code")
    customer_type = data.get("customer_type", "regular")

    if not name or not phone:
        return jsonify({"message": "Name and phone required"}), 400

    if email is False:
        return jsonify({"message": "Valid email required"}), 400

    if password and len(password) < 6:
        return jsonify({"message": "Password must be at least 6 characters"}), 400

    existing = Customer.query.filter_by(phone=phone).first()
    if existing:
        return jsonify({"message": "Customer with this phone already exists"}), 400

    login_email = email or customer_placeholder_email(phone)
    if _email_conflict(login_email):
        return jsonify({"message": "Email already in use"}), 400

    referrer = None
    if referral_code:
        referrer = Customer.query.filter_by(referral_code=referral_code).first()

    user = User(
        email=login_email,
        password=hash_password(password or uuid.uuid4().hex),
        active=True
    )
    _ensure_customer_role(user)

    db.session.add(user)
    db.session.flush()

    # FIX: guard against village/name being None before slicing
    name_part    = (name    or '')[:3]
    phone_part   = (phone   or '')[-3:]
    village_part = (village or '')[:3]
    auto_referral_code = name_part + phone_part + village_part

    customer = Customer(
        user_id=user.id,
        name=name,
        phone=phone,
        address=address,
        village=village,
        referred_by_id=referrer.id if referrer else None,
        customer_type=customer_type,
        referral_code=auto_referral_code
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
@admin_required
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
# SEARCH DISTINCT VILLAGES
# --------------------------------
@customers_bp.route("/api/customers/villages")
@admin_required
def search_villages():

    q = request.args.get("q", "").strip()

    if not q:
        return jsonify([])

    tokens = q.lower().split()

    results = (
        db.session.query(
            Customer.village.label("village"),
            func.count(Customer.id).label("usage_count")
        )
        .filter(
            Customer.village.isnot(None),
            func.trim(Customer.village) != ""
        )
    )

    for token in tokens:
        results = results.filter(Customer.village.ilike(f"%{token}%"))

    villages = (
        results
        .group_by(Customer.village)
        .order_by(desc("usage_count"), Customer.village.asc())
        .limit(12)
        .all()
    )

    return jsonify([row.village for row in villages])


# --------------------------------
# SEARCH CUSTOMERS
# --------------------------------
@customers_bp.route("/api/customers/search")
@admin_required
def search_customers():

    q = request.args.get("q", "").strip()

    if not q:
        return jsonify([])

    tokens = q.lower().split()

    results = Customer.query

    for token in tokens:
        pattern = f"%{token}%"
        results = results.filter(
            or_(
                Customer.name.ilike(pattern),
                Customer.phone.ilike(pattern),
                Customer.village.ilike(pattern),
                Customer.referral_code.ilike(pattern),
                Customer.customer_type.ilike(pattern)
            )
        )

    customers = results.order_by(Customer.name).limit(30).all()

    return jsonify([
        {
            "id": c.id,
            "name": c.name,
            "phone": c.phone,
            "village": c.village,
            "referral_code": c.referral_code,
            "customer_type": c.customer_type,
            "wallet_balance": c.wallet.balance if c.wallet else 0.0
        }
        for c in customers
    ])


# --------------------------------
# PUBLIC: LOOKUP BY PHONE (for customer portal — no auth)
# --------------------------------
@customers_bp.route("/api/customers/lookup")
@admin_required
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
# CUSTOMER: OWN ACCOUNT LEDGER
# --------------------------------
@customers_bp.route("/api/my-account", methods=["GET"])
@auth_required()
def my_account_data():
    customer = current_user.customer
    if not customer:
        return jsonify({"message": "No customer account linked to this login"}), 404
    return jsonify(_customer_payload(customer))


# --------------------------------
# GET CUSTOMER
# --------------------------------
@customers_bp.route("/api/customers/<int:customer_id>", methods=["GET"])
@admin_required
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
        "email": public_customer_email(customer.user),
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
@admin_required
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
@admin_required
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
@admin_required
def top_customers():
    """Returns top 200 customers by total spend."""
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
# UPDATE CUSTOMER (full replace)
# --------------------------------
@customers_bp.route("/api/customers/<int:customer_id>", methods=["PUT"])
@admin_required
def update_customer(customer_id):

    customer = Customer.query.get_or_404(customer_id)
    data = request.get_json(force=True)
    user = User.query.get(customer.user_id)

    new_phone = data.get("phone", customer.phone)
    if new_phone != customer.phone:
        conflict = Customer.query.filter(
            Customer.phone == new_phone,
            Customer.id != customer_id
        ).first()
        if conflict:
            return jsonify({"message": "Customer with this phone already exists"}), 400

    email = _normalize_optional_email(data.get("email"))
    if email is False:
        return jsonify({"message": "Valid email required"}), 400

    if user and email and _email_conflict(email, user.id):
        return jsonify({"message": "Email already in use"}), 400

    customer.name          = data.get("name",          customer.name)
    customer.phone         = new_phone
    customer.address       = data.get("address",       customer.address)
    customer.village       = data.get("village",       customer.village)
    customer.customer_type = data.get("customer_type", customer.customer_type)

    if user:
        if email:
            user.email = email
        elif "email" in data:
            user.email = customer_placeholder_email(new_phone, customer.id)
        elif is_internal_email(user.email) and new_phone:
            user.email = customer_placeholder_email(new_phone, customer.id)

    # Allow referral_code to be updated directly
    if "referral_code" in data and data["referral_code"]:
        # Check uniqueness (exclude self)
        conflict = Customer.query.filter(
            Customer.referral_code == data["referral_code"],
            Customer.id != customer_id
        ).first()
        if conflict:
            return jsonify({"message": "Referral code already in use by another customer"}), 400
        customer.referral_code = data["referral_code"]

    # Optional password change — updates the linked User record
    password = data.get("password", "").strip()
    if password:
        if len(password) < 6:
            return jsonify({"message": "Password must be at least 6 characters"}), 400
        if user:
            user.password = hash_password(password)
            _ensure_customer_role(user)

    db.session.commit()
    return jsonify({"message": "Customer updated successfully"})


# --------------------------------
# PATCH CUSTOMER (partial update)
# --------------------------------
@customers_bp.route("/api/customers/<int:customer_id>", methods=["PATCH"])
@admin_required
def patch_customer(customer_id):

    customer = Customer.query.get_or_404(customer_id)
    data = request.get_json(force=True)

    for field in ["name", "phone", "address", "village", "customer_type", "referral_code"]:
        if field in data:
            setattr(customer, field, data[field])

    db.session.commit()
    return jsonify({"message": "Customer updated successfully"})


# --------------------------------
# UPDATE REFERRER
# --------------------------------
@customers_bp.route("/api/customers/<int:customer_id>/referrer", methods=["PUT"])
@admin_required
def update_referrer(customer_id):

    customer = Customer.query.get_or_404(customer_id)
    data = request.get_json(force=True)

    referral_code = data.get("referral_code")
    
    if not referral_code:
        # Clear the referrer
        customer.referred_by_id = None
        db.session.commit()
        return jsonify({
            "message": "Referrer removed successfully",
            "referred_by_id": None,
            "referred_by_name": None
        })

    # Look up the referrer by referral code
    referrer = Customer.query.filter_by(referral_code=referral_code).first()
    
    if not referrer:
        return jsonify({"message": "Invalid referral code"}), 400
    
    if referrer.id == customer_id:
        return jsonify({"message": "Cannot refer yourself"}), 400

    customer.referred_by_id = referrer.id
    db.session.commit()

    return jsonify({
        "message": "Referrer updated successfully",
        "referred_by_id": referrer.id,
        "referred_by_name": referrer.name
    })


# --------------------------------
# DELETE CUSTOMER
# --------------------------------
@customers_bp.route("/api/customers/<int:customer_id>", methods=["DELETE"])
@admin_required
def delete_customer(customer_id):

    customer = Customer.query.get_or_404(customer_id)
    db.session.delete(customer)
    db.session.commit()
    return jsonify({"message": "Customer deleted successfully"})
