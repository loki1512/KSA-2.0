from functools import wraps

from flask import jsonify, redirect, request
from flask_security import auth_required, current_user


INTERNAL_EMAIL_DOMAIN = "@ksa.local"


def has_role(user, role_name):
    return bool(user and user.is_authenticated and user.has_role(role_name))


def is_admin(user=None):
    return has_role(user or current_user, "admin")


def is_customer(user=None):
    return has_role(user or current_user, "customer")


def is_internal_email(email):
    return bool(email and email.lower().endswith(INTERNAL_EMAIL_DOMAIN))


def customer_placeholder_email(phone=None, customer_id=None):
    token = (phone or "").strip()
    if token:
        return f"{token}{INTERNAL_EMAIL_DOMAIN}"
    return f"customer{customer_id or 'user'}{INTERNAL_EMAIL_DOMAIN}"


def public_customer_email(user):
    if not user or is_internal_email(user.email):
        return None
    return user.email


def forbidden_response():
    if request.path.startswith("/api/"):
        return jsonify({"error": "Forbidden"}), 403
    if current_user.is_authenticated and is_customer():
        return redirect("/my-account")
    return "Forbidden", 403


def admin_required(fn):
    @wraps(fn)
    @auth_required()
    def wrapper(*args, **kwargs):
        if not is_admin():
            return forbidden_response()
        return fn(*args, **kwargs)

    return wrapper


def create_customer_user(name, phone, email=None, password=None, address=None, village=None, customer_type="regular"):
    """Create a new customer with associated user account."""
    from extensions import db
    from models import User, Customer, Wallet, Role
    from flask_security import hash_password
    import uuid

    name = (name or "").strip()
    phone = (phone or "").strip()
    if not name or not phone:
        raise ValueError("Name and phone required")

    existing = Customer.query.filter_by(phone=phone).first()
    if existing:
        return existing

    login_email = email or customer_placeholder_email(phone)

    user = User(
        email=login_email,
        password=hash_password(password or uuid.uuid4().hex),
        active=True
    )
    # Add customer role
    customer_role = Role.query.filter_by(name="customer").first()
    if customer_role:
        user.roles.append(customer_role)

    db.session.add(user)
    db.session.flush()

    # Auto referral code
    name_part = name[:3]
    phone_part = phone[-3:]
    village_part = (village or "")[:3]
    auto_referral_code = name_part + phone_part + village_part

    customer = Customer(
        user_id=user.id,
        name=name,
        phone=phone,
        address=address,
        village=village,
        customer_type=customer_type,
        referral_code=auto_referral_code
    )

    db.session.add(customer)
    db.session.flush()

    wallet = Wallet(customer_id=customer.id, balance=0.0)
    db.session.add(wallet)
    db.session.commit()

    return customer
