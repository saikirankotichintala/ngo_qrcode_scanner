import io
import uuid
from pathlib import Path
from urllib.parse import urlparse

import qrcode
from flask import Blueprint, jsonify, request, send_file, send_from_directory
from werkzeug.utils import secure_filename

from config import PRODUCT_IMAGE_DIR, QR_DIR
from db import bags_collection
from helpers import (
    clean_text,
    error_response,
    infer_api_base_url,
    infer_frontend_base_url,
    parse_request_data,
    require_admin,
)

bag_bp = Blueprint("bag", __name__)
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
MAX_PRODUCT_IMAGE_BYTES = 8 * 1024 * 1024
BAG_PUBLIC_PROJECTION = {"_id": 0, "product_image_data": 0, "product_image_mime_type": 0}


def delete_file_if_exists(path: Path):
    if path.exists() and path.is_file():
        path.unlink()


def save_updated_product_image(image_file):
    original_filename = secure_filename(image_file.filename or "")
    extension = Path(original_filename).suffix.lower()

    if extension not in ALLOWED_IMAGE_EXTENSIONS:
        return None, error_response(
            "Invalid product image type. Allowed: jpg, jpeg, png, webp, gif"
        )

    image_bytes = image_file.read()
    if not image_bytes:
        return None, error_response("Uploaded product image is empty")

    if len(image_bytes) > MAX_PRODUCT_IMAGE_BYTES:
        return None, error_response("Product image must be 8MB or smaller")

    image_filename = f"{uuid.uuid4()}{extension}"
    image_path = PRODUCT_IMAGE_DIR / image_filename
    try:
        image_path.write_bytes(image_bytes)
    except OSError:
        return None, error_response(
            "Unable to save product image on server. Check persistent disk setup."
        )

    return image_filename, None


def get_image_name_from_url(image_url):
    image_text = str(image_url or "").strip()
    if not image_text:
        return ""
    parsed = urlparse(image_text)
    return Path(parsed.path).name


def normalize_product_image_url(image_url, image_name=""):
    resolved_name = clean_text(image_name) or get_image_name_from_url(image_url)
    image_name = Path(resolved_name).name
    if not image_name:
        return ""
    api_base_url = infer_api_base_url()
    return f"{api_base_url}/product-image/{image_name}"


def sanitize_bag_response(bag):
    if not bag:
        return bag

    bag.pop("status", None)
    bag.pop("sold_at", None)
    image_name = clean_text(bag.get("product_image_name")) or get_image_name_from_url(
        bag.get("product_image_url")
    )
    bag["product_image_url"] = normalize_product_image_url(
        bag.get("product_image_url"), image_name
    )
    bag.pop("product_image_data", None)
    bag.pop("product_image_mime_type", None)
    bag.pop("product_image_name", None)
    return bag


@bag_bp.route("/bag/<bag_id>", methods=["GET"])
def get_bag(bag_id):
    bag = bags_collection.find_one({"id": bag_id}, BAG_PUBLIC_PROJECTION)
    if not bag:
        return error_response("Bag not found", 404)
    return jsonify(sanitize_bag_response(bag))


@bag_bp.route("/all-bags", methods=["GET"])
def all_bags():
    bags = list(bags_collection.find({}, BAG_PUBLIC_PROJECTION).sort("created_at", -1))
    return jsonify([sanitize_bag_response(bag) for bag in bags])


@bag_bp.route("/bag/<bag_id>", methods=["PUT"])
def update_bag(bag_id):
    admin_error = require_admin()
    if admin_error:
        return admin_error

    bag = bags_collection.find_one({"id": bag_id}, BAG_PUBLIC_PROJECTION)
    if not bag:
        return error_response("Bag not found", 404)

    data = parse_request_data()
    updates = {}

    if "material_used" in data:
        material_used = clean_text(data.get("material_used"))
        if not material_used:
            return error_response("material_used is required")
        updates["material_used"] = material_used

    new_image_filename = ""
    image_file = request.files.get("product_image")
    if image_file:
        new_image_filename, image_error = save_updated_product_image(image_file)
        if image_error:
            return image_error
        api_base_url = infer_api_base_url()
        updates["product_image_url"] = f"{api_base_url}/product-image/{new_image_filename}"
        updates["product_image_name"] = new_image_filename

    if not updates:
        return error_response("Provide at least one field to update: material_used or product_image")

    bags_collection.update_one({"id": bag_id}, {"$set": updates})

    if new_image_filename:
        old_image_name = clean_text(bag.get("product_image_name")) or get_image_name_from_url(
            bag.get("product_image_url")
        )
        new_image_name = Path(new_image_filename).name
        if old_image_name and old_image_name != new_image_name:
            delete_file_if_exists(PRODUCT_IMAGE_DIR / old_image_name)

    bag.update(updates)
    return jsonify({"message": "Bag updated", "bag": sanitize_bag_response(bag)})


@bag_bp.route("/bag/<bag_id>", methods=["DELETE"])
def delete_bag(bag_id):
    admin_error = require_admin()
    if admin_error:
        return admin_error

    bag = bags_collection.find_one({"id": bag_id}, BAG_PUBLIC_PROJECTION)
    if not bag:
        return error_response("Bag not found", 404)

    bags_collection.delete_one({"id": bag_id})

    qr_file_path = QR_DIR / f"{bag_id}.png"
    delete_file_if_exists(qr_file_path)

    image_name = clean_text(bag.get("product_image_name")) or get_image_name_from_url(
        bag.get("product_image_url")
    )
    if image_name:
        delete_file_if_exists(PRODUCT_IMAGE_DIR / image_name)

    return jsonify({"message": "Bag deleted", "bag_id": bag_id})


@bag_bp.route("/qr/<path:filename>", methods=["GET"])
def serve_qr(filename):
    safe_filename = Path(filename).name
    if Path(safe_filename).suffix.lower() != ".png":
        return error_response("QR file not found", 404)

    bag_id = Path(safe_filename).stem
    bag = bags_collection.find_one({"id": bag_id}, {"_id": 0, "id": 1})
    if not bag:
        return error_response("QR file not found", 404)

    qr_path = QR_DIR / safe_filename
    if qr_path.exists():
        return send_from_directory(str(QR_DIR), safe_filename)

    frontend_base_url = infer_frontend_base_url()
    bag_url = f"{frontend_base_url}/#/bag?id={bag_id}"
    qr_image = qrcode.make(bag_url)

    # Try to persist QR for future requests, but never fail the request if disk write fails.
    try:
        qr_image.save(qr_path)
    except OSError:
        pass

    image_bytes = io.BytesIO()
    qr_image.save(image_bytes, format="PNG")
    image_bytes.seek(0)

    return send_file(image_bytes, mimetype="image/png")
