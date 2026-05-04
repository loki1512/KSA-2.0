from flask import Blueprint, jsonify, render_template, request
from email_validator import EmailNotValidError, validate_email
from flask_security import current_user, hash_password
from flask_security.utils import verify_and_update_password
from sqlalchemy import func

from auth_helpers import admin_required
from extensions import db
from models import User


account_bp = Blueprint("account", __name__)


@account_bp.route("/admin/profile")
@admin_required
def admin_profile_page():
    return render_template("admin_profile.html")


@account_bp.route("/api/admin/profile", methods=["GET"])
@admin_required
def get_admin_profile():
    return jsonify({"email": current_user.email})


@account_bp.route("/api/admin/profile", methods=["PUT"])
@admin_required
def update_admin_profile():
    data = request.get_json(force=True)
    current_password = data.get("current_password", "")
    new_email = (data.get("email") or "").strip()
    new_password = data.get("password", "")
    confirm_password = data.get("password_confirm", "")

    if not current_password:
        return jsonify({"message": "Current password required"}), 400

    if not verify_and_update_password(current_password, current_user):
        return jsonify({"message": "Current password is incorrect"}), 400

    if not new_email and not new_password:
        return jsonify({"message": "Enter a new email or password"}), 400

    if new_email:
        try:
            new_email = validate_email(
                new_email,
                check_deliverability=False
            ).normalized.lower()
        except EmailNotValidError:
            return jsonify({"message": "Valid email required"}), 400

        conflict = User.query.filter(
            func.lower(User.email) == new_email.lower(),
            User.id != current_user.id
        ).first()
        if conflict:
            return jsonify({"message": "Email already in use"}), 400
        current_user.email = new_email

    if new_password:
        if len(new_password) < 6:
            return jsonify({"message": "Password must be at least 6 characters"}), 400
        if new_password != confirm_password:
            return jsonify({"message": "Passwords do not match"}), 400
        current_user.password = hash_password(new_password)

    db.session.commit()
    return jsonify({"message": "Profile updated successfully", "email": current_user.email})
