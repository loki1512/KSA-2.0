from flask import Blueprint, request, jsonify
from flask_security import auth_required
from extensions import db
from models import Item
from sqlalchemy import func, and_
import pandas as pd

items_bp = Blueprint("items", __name__)


# --------------------------------
# SEARCH ITEMS (Billing search)
# --------------------------------
@items_bp.route("/api/items/search")
@auth_required()
def search_items():

    q = request.args.get("q", "").strip()

    if not q:
        return jsonify([])

    keywords = q.lower().split()

    conditions = [Item.name.ilike(f"%{kw}%") for kw in keywords]

    items = (
        Item.query
        .filter(and_(*conditions))
        .order_by(Item.name)
        .limit(10)
        .all()
    )

    results = []

    for i in items:
        # Selling price: final_price → default_price, capped at max_price
        price = i.max_price if i.max_price else i.default_price
        if i.max_price and price > i.max_price:
            price = i.max_price

        results.append({
            "id": i.id,
            "name": i.name,
            "category": i.category,
            "price": price,               # selling price shown in billing
            "default_price": i.default_price,
            "max_price": i.max_price,
            "final_price": i.final_price
        })

    return jsonify(results)


# --------------------------------
# GET ALL ITEMS
# --------------------------------
@items_bp.route("/api/items", methods=["GET"])
@auth_required()
def get_items():

    items = Item.query.order_by(Item.name).all()

    return jsonify([
        {
            "id": i.id,
            "name": i.name,
            "category": i.category,
            "default_price": i.default_price,
            "max_price": i.max_price,
            "final_price": i.final_price
        }
        for i in items
    ])


# --------------------------------
# ADD ITEM
# --------------------------------
@items_bp.route("/api/items", methods=["POST"])
@auth_required()
def add_item():

    data = request.get_json()

    name          = data.get("name", "").strip()
    category      = data.get("category")
    default_price = data.get("default_price")
    max_price     = data.get("max_price")
    final_price   = data.get("final_price")

    if not name or not isinstance(default_price, (int, float)):
        return jsonify({"error": "name and default_price are required"}), 400

    if max_price is not None and default_price > max_price:
        return jsonify({"error": "default_price cannot exceed max_price"}), 400

    if final_price is not None and max_price is not None and final_price > max_price:
        return jsonify({"error": "final_price cannot exceed max_price"}), 400

    existing = Item.query.filter(func.lower(Item.name) == name.lower()).first()
    if existing:
        return jsonify({"error": "Item already exists"}), 400

    item = Item(
        name=name,
        category=category,
        default_price=default_price,
        max_price=max_price,
        final_price=final_price
    )

    db.session.add(item)
    db.session.commit()

    return jsonify({"id": item.id}), 201


# --------------------------------
# UPDATE ITEM (full)
# --------------------------------
@items_bp.route("/api/items/<int:item_id>", methods=["PUT"])
@auth_required()
def update_item(item_id):

    item = Item.query.get_or_404(item_id)
    data = request.get_json()

    name          = data.get("name", "").strip()
    category      = data.get("category")
    default_price = data.get("default_price")
    max_price     = data.get("max_price")
    final_price   = data.get("final_price")

    if not name or not isinstance(default_price, (int, float)):
        return jsonify({"error": "name and default_price are required"}), 400

    duplicate = Item.query.filter(
        func.lower(Item.name) == name.lower(),
        Item.id != item_id
    ).first()
    if duplicate:
        return jsonify({"error": "Item name already exists"}), 400

    if max_price is not None and default_price > max_price:
        return jsonify({"error": "default_price cannot exceed max_price"}), 400

    if final_price is not None and max_price is not None and final_price > max_price:
        return jsonify({"error": "final_price cannot exceed max_price"}), 400

    item.name          = name
    item.category      = category
    item.default_price = default_price
    item.max_price     = max_price
    item.final_price   = final_price

    db.session.commit()

    return jsonify({"success": True})


# --------------------------------
# PATCH ITEM PRICE (dashboard quick-edit)
# --------------------------------
@items_bp.route("/api/items/<int:item_id>/price", methods=["PATCH"])
@auth_required()
def patch_item_price(item_id):
    """Lightweight endpoint — only updates prices, not name/category."""

    item = Item.query.get_or_404(item_id)
    data = request.get_json(force=True)

    default_price = data.get("default_price", item.default_price)
    max_price     = data.get("max_price", item.max_price)
    final_price   = data.get("final_price", item.final_price)

    if max_price is not None and default_price > max_price:
        return jsonify({"error": "default_price cannot exceed max_price"}), 400

    if final_price is not None and max_price is not None and final_price > max_price:
        return jsonify({"error": "final_price cannot exceed max_price"}), 400

    item.default_price = default_price
    item.max_price     = max_price
    item.final_price   = final_price

    db.session.commit()

    return jsonify({
        "success": True,
        "default_price": item.default_price,
        "max_price": item.max_price,
        "final_price": item.final_price
    })


# --------------------------------
# DELETE ITEM
# --------------------------------
@items_bp.route("/api/items/<int:item_id>", methods=["DELETE"])
@auth_required()
def delete_item(item_id):

    item = Item.query.get_or_404(item_id)
    db.session.delete(item)
    db.session.commit()

    return jsonify({"success": True})


# --------------------------------
# IMPORT ITEMS FROM EXCEL
# Excel columns: name | category | default_price | max_price | final_price
# --------------------------------
@items_bp.route("/api/items/import", methods=["POST"])
@auth_required()
def import_items():

    file = request.files.get("file")
    if not file:
        return jsonify({"error": "No file uploaded"}), 400

    df = pd.read_excel(file)

    added = updated = skipped = 0

    for _, row in df.iterrows():
        name     = str(row.get("name", "")).strip()
        category = row.get("category") if pd.notna(row.get("category")) else None

        try:
            default_price = float(row["default_price"])
            max_price     = float(row["max_price"])   if pd.notna(row.get("max_price"))   else None
            final_price   = float(row["final_price"]) if pd.notna(row.get("final_price")) else None
        except Exception:
            skipped += 1
            continue

        if not name:
            skipped += 1
            continue

        if max_price is not None and default_price > max_price:
            skipped += 1
            continue

        if final_price is not None and max_price is not None and final_price > max_price:
            skipped += 1
            continue

        item = Item.query.filter(func.lower(Item.name) == name.lower()).first()

        if item:
            item.category      = category
            item.default_price = default_price
            item.max_price     = max_price
            item.final_price   = final_price
            updated += 1
        else:
            db.session.add(Item(
                name=name,
                category=category,
                default_price=default_price,
                max_price=max_price,
                final_price=final_price
            ))
            added += 1

    db.session.commit()

    return jsonify({"added": added, "updated": updated, "skipped": skipped})