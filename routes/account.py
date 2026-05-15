from flask import Blueprint, jsonify, render_template, request
from email_validator import EmailNotValidError, validate_email
from flask_security import current_user, hash_password
from flask_security.utils import verify_and_update_password
from sqlalchemy import case, func, or_

from auth_helpers import admin_required
from extensions import db
from models import BillItem, Item, User


account_bp = Blueprint("account", __name__)


@account_bp.route("/admin/profile")
@admin_required
def admin_profile_page():
    return render_template("admin_profile.html")


@account_bp.route("/admin/historical-db-cleaner")
@admin_required
def historical_db_cleaner_page():
    return render_template("historical_db_cleaner.html")


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


def _search_tokens(value):
    return [
        token
        for token in (value or "").strip().lower().split()
        if len(token) >= 2
    ]


@account_bp.route("/api/admin/historical-db-cleaner/search")
@admin_required
def search_historical_bill_items():
    item_id = request.args.get("item_id", type=int)
    query = (request.args.get("q") or "").strip()

    target_item = db.session.get(Item, item_id) if item_id else None
    target_name = target_item.name if target_item else query
    tokens = _search_tokens(target_name)

    if len(target_name) < 3 or not tokens:
        return jsonify({"message": "Search for a catalogue item name first"}), 400

    filters = [BillItem.item_name.ilike(f"%{token}%") for token in tokens]
    match_score = sum(
        case((BillItem.item_name.ilike(f"%{token}%"), 1), else_=0)
        for token in tokens
    ).label("match_score")
    rows = (
        db.session.query(
            BillItem.item_name.label("name"),
            func.count(BillItem.id).label("count"),
            match_score
        )
        .filter(or_(*filters))
        .group_by(BillItem.item_name)
        .order_by(match_score.desc(), func.count(BillItem.id).desc(), BillItem.item_name.asc())
        .limit(50)
        .all()
    )

    return jsonify({
        "target_item": {
            "id": target_item.id if target_item else None,
            "name": target_name
        },
        "matches": [
            {
                "name": row.name,
                "count": row.count,
                "is_exact": row.name.strip().lower() == target_name.strip().lower()
            }
            for row in rows
        ]
    })


@account_bp.route("/api/admin/historical-db-cleaner/replace", methods=["POST"])
@admin_required
def replace_historical_bill_item_names():
    data = request.get_json(force=True)
    item_id = data.get("item_id")
    old_names = data.get("old_names") or []
    expected_count = data.get("expected_count")
    confirm_text = (data.get("confirm_text") or "").strip()

    if not isinstance(item_id, int):
        return jsonify({"message": "Select a catalogue item first"}), 400

    target_item = db.session.get(Item, item_id)
    if not target_item:
        return jsonify({"message": "Catalogue item not found"}), 404

    if not isinstance(old_names, list):
        return jsonify({"message": "Select historical item names to replace"}), 400

    target_key = target_item.name.strip().lower()
    target_tokens = _search_tokens(target_item.name)
    cleaned_names = []
    seen = set()
    for value in old_names:
        name = str(value or "").strip()
        key = name.lower()
        if not name or key == target_key or key in seen:
            continue
        if not any(token in key for token in target_tokens):
            return jsonify({
                "message": f'"{name}" does not match the selected catalogue item keywords'
            }), 400
        cleaned_names.append(name)
        seen.add(key)

    if not cleaned_names:
        return jsonify({"message": "Select at least one non-exact historical name"}), 400

    if len(cleaned_names) > 50:
        return jsonify({"message": "Replace at most 50 historical names at once"}), 400

    required_confirmation = f"REPLACE WITH {target_item.name}"
    if confirm_text != required_confirmation:
        return jsonify({
            "message": f'Type "{required_confirmation}" to confirm'
        }), 400

    current_count = (
        db.session.query(func.count(BillItem.id))
        .filter(BillItem.item_name.in_(cleaned_names))
        .scalar()
    )

    if not isinstance(expected_count, int) or expected_count != current_count:
        return jsonify({
            "message": "Preview count changed. Search again before replacing.",
            "current_count": current_count
        }), 409

    updated_count = (
        BillItem.query
        .filter(BillItem.item_name.in_(cleaned_names))
        .update({BillItem.item_name: target_item.name}, synchronize_session=False)
    )

    db.session.commit()

    return jsonify({
        "message": "Historical bill item names updated",
        "updated_count": updated_count,
        "replaced_names": cleaned_names,
        "target_name": target_item.name
    })
