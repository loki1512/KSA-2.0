import os

from flask import Blueprint, current_app, jsonify, render_template, request, url_for
from werkzeug.utils import secure_filename

from auth_helpers import admin_required
from extensions import db
from models import Offer


offers_bp = Blueprint("offers", __name__)

ALLOWED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "gif"}


def _upload_dir():
    path = os.path.join(current_app.static_folder, "offer_images")
    os.makedirs(path, exist_ok=True)
    return path


def _allowed_image(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_IMAGE_EXTENSIONS


def _save_offer_image(file_storage):
    if not file_storage or not file_storage.filename:
        return None
    if not _allowed_image(file_storage.filename):
        return False

    filename = secure_filename(file_storage.filename)
    root, ext = os.path.splitext(filename)
    unique_name = f"{root[:60]}-{os.urandom(4).hex()}{ext.lower()}"
    file_storage.save(os.path.join(_upload_dir(), unique_name))
    return f"offer_images/{unique_name}"


def _offer_payload(offer):
    return {
        "id": offer.id,
        "product_name": offer.product_name,
        "offer_description": offer.offer_description,
        "image_path": offer.image_path,
        "image_url": url_for("static", filename=offer.image_path) if offer.image_path else None,
        "is_active": bool(offer.is_active),
        "created_at": offer.created_at.isoformat() if offer.created_at else None,
    }


@offers_bp.route("/offers")
def public_offers_page():
    offers = (
        Offer.query
        .filter_by(is_active=True)
        .order_by(Offer.created_at.desc())
        .all()
    )
    return render_template("offers.html", offers=offers)


@offers_bp.route("/admin/offers")
@admin_required
def admin_offers_page():
    return render_template("admin_offers.html")


@offers_bp.route("/api/offers")
def list_active_offers():
    offers = (
        Offer.query
        .filter_by(is_active=True)
        .order_by(Offer.created_at.desc())
        .all()
    )
    return jsonify([_offer_payload(offer) for offer in offers])


@offers_bp.route("/api/admin/offers")
@admin_required
def admin_list_offers():
    offers = Offer.query.order_by(Offer.created_at.desc()).all()
    return jsonify([_offer_payload(offer) for offer in offers])


@offers_bp.route("/api/admin/offers", methods=["POST"])
@admin_required
def create_offer():
    product_name = (request.form.get("product_name") or "").strip()
    offer_description = (request.form.get("offer_description") or "").strip()
    is_active = request.form.get("is_active") == "true"

    if not product_name or not offer_description:
        return jsonify({"error": "Product name and offer description are required"}), 400

    image_path = _save_offer_image(request.files.get("image"))
    if image_path is False:
        return jsonify({"error": "Upload a PNG, JPG, JPEG, WEBP, or GIF image"}), 400

    offer = Offer(
        product_name=product_name,
        offer_description=offer_description,
        image_path=image_path,
        is_active=is_active,
    )
    db.session.add(offer)
    db.session.commit()

    return jsonify(_offer_payload(offer)), 201


@offers_bp.route("/api/admin/offers/<int:offer_id>", methods=["PUT"])
@admin_required
def update_offer(offer_id):
    offer = Offer.query.get_or_404(offer_id)
    product_name = (request.form.get("product_name") or "").strip()
    offer_description = (request.form.get("offer_description") or "").strip()

    if not product_name or not offer_description:
        return jsonify({"error": "Product name and offer description are required"}), 400

    image_path = _save_offer_image(request.files.get("image"))
    if image_path is False:
        return jsonify({"error": "Upload a PNG, JPG, JPEG, WEBP, or GIF image"}), 400

    offer.product_name = product_name
    offer.offer_description = offer_description
    offer.is_active = request.form.get("is_active") == "true"
    if image_path:
        offer.image_path = image_path

    db.session.commit()
    return jsonify(_offer_payload(offer))


@offers_bp.route("/api/admin/offers/<int:offer_id>", methods=["DELETE"])
@admin_required
def delete_offer(offer_id):
    offer = Offer.query.get_or_404(offer_id)
    db.session.delete(offer)
    db.session.commit()
    return jsonify({"success": True})
