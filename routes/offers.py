from flask import Blueprint, jsonify, request
from sqlalchemy import desc
from extensions import db
from models import Offer
from auth_helpers import admin_required

offers_bp = Blueprint("offers", __name__)


@offers_bp.route("/api/offers", methods=["GET"])
@admin_required
def get_offers():
    show_inactive = request.args.get("show_inactive", "false").lower() == "true"
    query = Offer.query
    if not show_inactive:
        query = query.filter_by(is_active=True)
    offers = query.order_by(desc(Offer.created_at)).all()
    return jsonify([
        {
            "id": o.id,
            "product_name": o.product_name,
            "offer_description": o.offer_description,
            "is_active": o.is_active,
            "expiry_date": o.expiry_date.isoformat() if o.expiry_date else None,
            "created_at": o.created_at.isoformat()
        }
        for o in offers
    ])


@offers_bp.route("/api/offers", methods=["POST"])
@admin_required
def create_offer():
    data = request.get_json(force=True)
    product_name = data.get("product_name", "").strip()
    offer_description = data.get("offer_description", "").strip()
    is_active = data.get("is_active", False)
    expiry_date_str = data.get("expiry_date")

    if not product_name or not offer_description:
        return jsonify({"message": "Product name and description required"}), 400

    expiry_date = None
    if expiry_date_str:
        from datetime import datetime
        try:
            expiry_date = datetime.fromisoformat(expiry_date_str.replace('Z', '+00:00'))
        except ValueError:
            return jsonify({"message": "Invalid expiry date format"}), 400

    offer = Offer(
        product_name=product_name,
        offer_description=offer_description,
        is_active=is_active,
        expiry_date=expiry_date
    )
    db.session.add(offer)
    db.session.commit()

    return jsonify({
        "id": offer.id,
        "message": "Offer created successfully"
    }), 201


@offers_bp.route("/api/offers/<int:offer_id>", methods=["PUT"])
@admin_required
def update_offer(offer_id):
    offer = Offer.query.get_or_404(offer_id)
    data = request.get_json(force=True)

    product_name = data.get("product_name", "").strip()
    offer_description = data.get("offer_description", "").strip()
    is_active = data.get("is_active")
    expiry_date_str = data.get("expiry_date")

    if product_name:
        offer.product_name = product_name
    if offer_description:
        offer.offer_description = offer_description
    if is_active is not None:
        offer.is_active = is_active

    if expiry_date_str is not None:
        if expiry_date_str:
            from datetime import datetime
            try:
                offer.expiry_date = datetime.fromisoformat(expiry_date_str.replace('Z', '+00:00'))
            except ValueError:
                return jsonify({"message": "Invalid expiry date format"}), 400
        else:
            offer.expiry_date = None

    db.session.commit()
    return jsonify({"message": "Offer updated successfully"})


@offers_bp.route("/api/offers/<int:offer_id>", methods=["DELETE"])
@admin_required
def delete_offer(offer_id):
    offer = Offer.query.get_or_404(offer_id)
    db.session.delete(offer)
    db.session.commit()
    return jsonify({"message": "Offer deleted permanently"})