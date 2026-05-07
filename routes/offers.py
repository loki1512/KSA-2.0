import mimetypes
import os
import re
from urllib import error, parse, request as urllib_request

from flask import Blueprint, current_app, jsonify, render_template, request, url_for
from markupsafe import Markup, escape
from werkzeug.utils import secure_filename

from auth_helpers import admin_required
from extensions import db
from models import Offer


offers_bp = Blueprint("offers", __name__)

ALLOWED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "gif"}


def _markdown_inline(text):
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"__([^_]+)__", r"<strong>\1</strong>", text)
    text = re.sub(r"(?<!\*)\*([^*\n]+)\*(?!\*)", r"<em>\1</em>", text)
    text = re.sub(r"(?<!_)_([^_\n]+)_(?!_)", r"<em>\1</em>", text)
    text = re.sub(
        r"\[([^\]]+)\]\((https?://[^)\s]+)\)",
        r'<a href="\2" target="_blank" rel="noopener">\1</a>',
        text,
    )
    return text


@offers_bp.app_template_filter("offer_markdown")
def offer_markdown(value):
    escaped = str(escape(value or "")).replace("\r\n", "\n").replace("\r", "\n")
    blocks = []
    list_items = []

    def flush_list():
        if list_items:
            blocks.append("<ul>" + "".join(list_items) + "</ul>")
            list_items.clear()

    for raw_line in escaped.split("\n"):
        line = raw_line.strip()
        if not line:
            flush_list()
            continue

        heading = re.match(r"^(#{1,3})\s+(.+)$", line)
        bullet = re.match(r"^[-*]\s+(.+)$", line)

        if heading:
            flush_list()
            level = len(heading.group(1))
            blocks.append(f"<h{level}>{_markdown_inline(heading.group(2))}</h{level}>")
        elif bullet:
            list_items.append(f"<li>{_markdown_inline(bullet.group(1))}</li>")
        else:
            flush_list()
            blocks.append(f"<p>{_markdown_inline(line)}</p>")

    flush_list()
    return Markup("".join(blocks))


def _upload_dir():
    path = os.path.join(current_app.static_folder, "offer_images")
    os.makedirs(path, exist_ok=True)
    return path


def _allowed_image(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_IMAGE_EXTENSIONS


def _supabase_enabled():
    return bool(
        current_app.config.get("SUPABASE_URL")
        and current_app.config.get("SUPABASE_SERVICE_ROLE_KEY")
        and current_app.config.get("SUPABASE_STORAGE_BUCKET")
    )


def _supabase_bucket():
    return current_app.config.get("SUPABASE_STORAGE_BUCKET", "offer-images")


def _supabase_public_url(path):
    if not path:
        return None
    base_url = current_app.config.get("SUPABASE_URL", "").rstrip("/")
    bucket = _supabase_bucket()
    encoded_path = parse.quote(path.lstrip("/"), safe="/")
    return f"{base_url}/storage/v1/object/public/{bucket}/{encoded_path}"


def _upload_to_supabase(file_storage, object_path):
    payload = file_storage.read()
    content_type = file_storage.mimetype or mimetypes.guess_type(object_path)[0] or "application/octet-stream"
    bucket = parse.quote(_supabase_bucket(), safe="")
    encoded_path = parse.quote(object_path, safe="/")
    endpoint = f"{current_app.config['SUPABASE_URL']}/storage/v1/object/{bucket}/{encoded_path}"
    token = current_app.config["SUPABASE_SERVICE_ROLE_KEY"]

    req = urllib_request.Request(
        endpoint,
        data=payload,
        method="POST",
        headers={
            "apikey": token,
            "Authorization": f"Bearer {token}",
            "Content-Type": content_type,
            "x-upsert": "false",
            "Cache-Control": "3600",
        },
    )

    try:
        with urllib_request.urlopen(req, timeout=30) as response:
            response.read()
    except error.HTTPError as exc:
        details = exc.read().decode("utf-8", errors="ignore").strip()
        raise ValueError(details or "Supabase upload failed") from exc
    except error.URLError as exc:
        raise ValueError("Could not reach Supabase Storage") from exc


def _save_offer_image(file_storage):
    if not file_storage or not file_storage.filename:
        return None, None
    if not _allowed_image(file_storage.filename):
        return None, "Upload a PNG, JPG, JPEG, WEBP, or GIF image"

    filename = secure_filename(file_storage.filename)
    root, ext = os.path.splitext(filename)
    unique_name = f"{root[:60]}-{os.urandom(4).hex()}{ext.lower()}"

    if _supabase_enabled():
        object_path = f"offers/{unique_name}"
        try:
            _upload_to_supabase(file_storage, object_path)
        except ValueError as exc:
            return None, str(exc)
        return object_path, None

    file_storage.save(os.path.join(_upload_dir(), unique_name))
    return f"offer_images/{unique_name}", None


def _offer_image_url(offer):
    image_path = (offer.image_path or "").strip()
    if not image_path:
        return None

    if image_path.startswith(("http://", "https://")):
        return image_path

    if image_path.startswith("offer_images/") or image_path.startswith("static/offer_images/"):
        normalized = image_path.removeprefix("static/")
        return url_for("static", filename=normalized)

    return _supabase_public_url(image_path)


def _offer_payload(offer):
    return {
        "id": offer.id,
        "product_name": offer.product_name,
        "offer_description": offer.offer_description,
        "image_path": offer.image_path,
        "image_url": _offer_image_url(offer),
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
    return render_template("offers.html", offers=offers, offer_image_url=_offer_image_url)


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

    image_path, upload_error = _save_offer_image(request.files.get("image"))
    if upload_error:
        return jsonify({"error": upload_error}), 400

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

    image_path, upload_error = _save_offer_image(request.files.get("image"))
    if upload_error:
        return jsonify({"error": upload_error}), 400

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
