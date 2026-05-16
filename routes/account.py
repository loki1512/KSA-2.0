from difflib import SequenceMatcher

from flask import Blueprint, jsonify, render_template, request
from email_validator import EmailNotValidError, validate_email
from flask_security import current_user, hash_password
from flask_security.utils import verify_and_update_password
from sqlalchemy import func, or_

from auth_helpers import admin_required
from extensions import db
from models import Bill, BillItem, Item, User


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


def _normalize_name(value):
    return " ".join((value or "").strip().lower().split())


def _fuzzy_score(left, right):
    normalized_left = _normalize_name(left)
    normalized_right = _normalize_name(right)
    if not normalized_left or not normalized_right:
        return 0
    if normalized_left == normalized_right:
        return 1
    return SequenceMatcher(None, normalized_left, normalized_right).ratio()


def _contains_all_tokens(value, tokens):
    haystack = _normalize_name(value)
    return bool(tokens) and all(token in haystack for token in tokens)


def _item_payload(item, score=None):
    price = item.max_price if item.max_price else item.default_price
    if item.max_price and price > item.max_price:
        price = item.max_price

    payload = {
        "id": item.id,
        "name": item.name,
        "category": item.category,
        "price": price,
        "default_price": item.default_price,
        "max_price": item.max_price,
        "final_price": item.final_price,
        "cost_price": float(item.cost_price) if item.cost_price else None
    }
    if score is not None:
        payload["score"] = round(score, 3)
    return payload


def _keyword_match_count(name, target_tokens):
    name_tokens = set(_search_tokens(name))
    return sum(1 for token in set(target_tokens) if token in name_tokens)


def _is_short_exact_keyword_match(name, target_tokens):
    name_tokens = _search_tokens(name)
    return (
        1 <= len(name_tokens) <= 2
        and all(token in set(target_tokens) for token in name_tokens)
    )


def _matches_historical_keyword_rule(name, target_tokens, min_keyword_matches):
    if _is_short_exact_keyword_match(name, target_tokens):
        return True
    return _keyword_match_count(name, target_tokens) >= min_keyword_matches


def _min_keyword_matches(value):
    try:
        return min(max(int(value), 1), 10)
    except (TypeError, ValueError):
        return 2


@account_bp.route("/api/admin/historical-db-cleaner/uncatalogued")
@admin_required
def uncatalogued_historical_bill_items():
    query = (request.args.get("q") or "").strip()
    page = max(request.args.get("page", default=1, type=int) or 1, 1)
    per_page = min(max(request.args.get("per_page", default=25, type=int) or 25, 5), 100)
    query_tokens = _search_tokens(query)

    catalogue_names = {
        _normalize_name(name)
        for (name,) in db.session.query(Item.name).all()
    }

    rows = (
        db.session.query(
            BillItem.item_name.label("name"),
            func.count(BillItem.id).label("count"),
            func.max(Bill.timestamp).label("latest_bill_timestamp")
        )
        .join(Bill, Bill.id == BillItem.bill_id)
        .group_by(BillItem.item_name)
        .all()
    )

    candidates = []
    for row in rows:
        normalized_name = _normalize_name(row.name)
        if not normalized_name or normalized_name in catalogue_names:
            continue

        score = _fuzzy_score(query, row.name) if query else 0
        if query and score < 0.45 and not _contains_all_tokens(row.name, query_tokens):
            continue

        candidates.append({
            "name": row.name,
            "count": int(row.count or 0),
            "latest_bill_timestamp": row.latest_bill_timestamp.isoformat() if row.latest_bill_timestamp else None,
            "score": round(score, 3)
        })

    if query:
        candidates.sort(key=lambda item: (-item["count"], -item["score"], item["name"].lower()))
    else:
        candidates.sort(key=lambda item: (-item["count"], item["name"].lower()))

    total = len(candidates)
    total_pages = max((total + per_page - 1) // per_page, 1)
    page = min(page, total_pages)
    start = (page - 1) * per_page
    page_items = candidates[start:start + per_page]

    for item in page_items:
        latest_row = (
            db.session.query(BillItem.unit_price)
            .join(Bill, Bill.id == BillItem.bill_id)
            .filter(BillItem.item_name == item["name"])
            .order_by(Bill.timestamp.desc(), BillItem.id.desc())
            .first()
        )
        item["latest_unit_price"] = latest_row.unit_price if latest_row else None

    return jsonify({
        "items": page_items,
        "page": page,
        "per_page": per_page,
        "total": total,
        "total_pages": total_pages
    })


@account_bp.route("/api/admin/historical-db-cleaner/similar-catalogue")
@admin_required
def similar_catalogue_items():
    query = (request.args.get("q") or "").strip()
    query_tokens = _search_tokens(query)

    if len(query) < 2:
        return jsonify([])

    matches = []
    for item in Item.query.all():
        haystack = " ".join([item.name or "", item.category or ""])
        score = _fuzzy_score(query, item.name)
        token_match = _contains_all_tokens(haystack, query_tokens)

        if _normalize_name(query) == _normalize_name(item.name):
            score = 1
        elif token_match:
            score = max(score, 0.75)

        if score >= 0.45 or token_match:
            matches.append(_item_payload(item, score))

    matches.sort(key=lambda item: (-item["score"], item["name"].lower()))
    return jsonify(matches[:10])


@account_bp.route("/api/admin/historical-db-cleaner/search")
@admin_required
def search_historical_bill_items():
    item_id = request.args.get("item_id", type=int)
    query = (request.args.get("q") or "").strip()
    old_name = (request.args.get("old_name") or "").strip()
    min_keyword_matches = _min_keyword_matches(request.args.get("min_keyword_matches"))

    target_item = db.session.get(Item, item_id) if item_id else None
    target_name = target_item.name if target_item else query
    tokens = _search_tokens(target_name)

    if old_name and target_item:
        current_count = (
            db.session.query(func.count(BillItem.id))
            .filter(BillItem.item_name == old_name)
            .scalar()
        )
        match_count = _keyword_match_count(old_name, tokens)
        short_exact = _is_short_exact_keyword_match(old_name, tokens)
        return jsonify({
            "target_item": {
                "id": target_item.id,
                "name": target_name
            },
            "min_keyword_matches": min_keyword_matches,
            "matches": [{
                "name": old_name,
                "count": current_count,
                "is_exact": _normalize_name(old_name) == _normalize_name(target_name),
                "keyword_matches": match_count,
                "is_short_exact_keyword_match": short_exact
            }]
        })

    if len(target_name) < 3 or not tokens:
        return jsonify({"message": "Search for a catalogue item name first"}), 400

    filters = [BillItem.item_name.ilike(f"%{token}%") for token in tokens]
    rows = (
        db.session.query(
            BillItem.item_name.label("name"),
            func.count(BillItem.id).label("count")
        )
        .filter(or_(*filters))
        .group_by(BillItem.item_name)
        .order_by(func.count(BillItem.id).desc(), BillItem.item_name.asc())
        .all()
    )
    matches = []
    for row in rows:
        match_count = _keyword_match_count(row.name, tokens)
        short_exact = _is_short_exact_keyword_match(row.name, tokens)
        if not _matches_historical_keyword_rule(row.name, tokens, min_keyword_matches):
            continue
        matches.append({
            "name": row.name,
            "count": row.count,
            "is_exact": row.name.strip().lower() == target_name.strip().lower(),
            "keyword_matches": match_count,
            "is_short_exact_keyword_match": short_exact
        })

    matches.sort(
        key=lambda item: (
            item["is_short_exact_keyword_match"],
            item["keyword_matches"],
            item["count"]
        ),
        reverse=True
    )

    return jsonify({
        "target_item": {
            "id": target_item.id if target_item else None,
            "name": target_name
        },
        "min_keyword_matches": min_keyword_matches,
        "matches": matches[:50]
    })


@account_bp.route("/api/admin/historical-db-cleaner/replace", methods=["POST"])
@admin_required
def replace_historical_bill_item_names():
    data = request.get_json(force=True)
    item_id = data.get("item_id")
    old_names = data.get("old_names") or []
    expected_count = data.get("expected_count")
    min_keyword_matches = _min_keyword_matches(data.get("min_keyword_matches"))
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
        fuzzy_match = _fuzzy_score(name, target_item.name) >= 0.45 if target_item else False
        if (
            not _matches_historical_keyword_rule(name, target_tokens, min_keyword_matches)
            and not fuzzy_match
        ):
            return jsonify({
                "message": f'"{name}" does not satisfy the keyword or fuzzy match rule'
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
