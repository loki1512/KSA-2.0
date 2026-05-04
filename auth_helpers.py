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
