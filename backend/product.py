import base64
import binascii
import io
import mimetypes
import re
import uuid
from pathlib import Path
from urllib.parse import quote, unquote

import qrcode
from flask import Blueprint, jsonify, request, send_file, send_from_directory
from werkzeug.utils import secure_filename

from config import PRODUCT_IMAGE_DIR, QR_DIR
from db import bags_collection
from employee import find_employee
from helpers import (
    clean_text,
    error_response,
    infer_api_base_url,
    infer_frontend_base_url,
    parse_request_data,
    utc_now,
)

product_bp = Blueprint("product", __name__)
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
MIME_TYPE_TO_EXTENSION = {
    "image/jpg": ".jpg",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}
MAX_PRODUCT_IMAGE_BYTES = 8 * 1024 * 1024


def get_image_extension_from_upload(image_file, original_filename):
    extension = Path(original_filename).suffix.lower()
    if extension in ALLOWED_IMAGE_EXTENSIONS:
        return extension

    mime_type = clean_text(image_file.mimetype).lower()
    return MIME_TYPE_TO_EXTENSION.get(mime_type, "")


def normalize_filename(value):
    text = clean_text(value)
    if not text:
        return ""
    return Path(unquote(text)).name


def build_product_image_lookup_query(filename):
    encoded_filename = quote(filename, safe="")
    patterns = {
        rf"/product-image/{re.escape(filename)}(?:$|[?#])",
        rf"/product-image/{re.escape(encoded_filename)}(?:$|[?#])",
        rf"/product_images/{re.escape(filename)}(?:$|[?#])",
        rf"/product_images/{re.escape(encoded_filename)}(?:$|[?#])",
        rf"{re.escape(filename)}(?:$|[?#])",
        rf"{re.escape(encoded_filename)}(?:$|[?#])",
    }

    query_filters = [{"product_image_name": filename}]
    query_filters.extend(
        {"product_image_url": {"$regex": pattern, "$options": "i"}} for pattern in patterns
    )
    return {"$or": query_filters}


def save_product_image():
    image_file = request.files.get("product_image")
    if not image_file:
        return None, None

    original_filename = secure_filename(image_file.filename or "")
    extension = get_image_extension_from_upload(image_file, original_filename)

    if not extension:
        return None, error_response(
            "Invalid product image type. Allowed: jpg, jpeg, png, webp, gif "
            "(or matching image MIME type)"
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
        # Local disk can be ephemeral or unavailable in serverless hosts.
        # We still persist bytes in MongoDB and serve from there as fallback.
        pass

    mime_type = clean_text(image_file.mimetype).lower()

    return {
        "filename": image_filename,
        "data": image_bytes,
        "mime_type": (
            mime_type
            if mime_type.startswith("image/")
            else guess_image_mime_type(image_filename, mime_type)
        ),
    }, None


def guess_image_mime_type(filename, stored_mime_type=""):
    mime_type = clean_text(stored_mime_type)
    if mime_type.startswith("image/"):
        return mime_type

    guessed_type, _ = mimetypes.guess_type(filename)
    if guessed_type and guessed_type.startswith("image/"):
        return guessed_type

    return "application/octet-stream"


def decode_image_data(value):
    if isinstance(value, (bytes, bytearray)):
        return bytes(value)

    if isinstance(value, str):
        try:
            return base64.b64decode(value, validate=True)
        except (ValueError, binascii.Error):
            return b""

    return b""


def get_unique_employee_ids(data):
    raw_ids = []

    if request.is_json:
        payload_ids = data.get("employee_ids")
        if isinstance(payload_ids, list):
            raw_ids.extend(payload_ids)
        elif payload_ids is not None:
            raw_ids.append(payload_ids)
    else:
        raw_ids.extend(request.form.getlist("employee_ids"))

    single_employee_id = clean_text(data.get("employee_id"))
    if single_employee_id:
        raw_ids.append(single_employee_id)

    unique_ids = []
    seen_ids = set()
    for raw_id in raw_ids:
        employee_id = clean_text(raw_id)
        if not employee_id or employee_id in seen_ids:
            continue
        seen_ids.add(employee_id)
        unique_ids.append(employee_id)

    return unique_ids


@product_bp.route("/create-bag", methods=["POST"])
def create_bag():
    data = parse_request_data()

    product_name = clean_text(data.get("product_name") or data.get("bag_name"))
    material_used = clean_text(data.get("material_used"))
    employee_ids = get_unique_employee_ids(data)
    maker_name = clean_text(data.get("maker_name"))

    if not material_used:
        return error_response("material_used is required")

    employees = []
    if employee_ids:
        for employee_id in employee_ids:
            employee = find_employee(employee_id)
            if not employee:
                return error_response(
                    f"Employee not found for provided employee_id: {employee_id}", 404
                )
            employees.append(employee)
        maker_name = ", ".join(employee["name"] for employee in employees)

    if not maker_name:
        return error_response("Select at least one employee or provide maker_name")

    maker_names = [employee["name"] for employee in employees]
    employee_profiles = [
        {
            "id": employee["id"],
            "name": employee["name"],
            "story": clean_text(employee.get("story")),
        }
        for employee in employees
    ]
    combined_story = "\n\n".join(
        (
            f"{profile['name']}: {profile['story']}"
            if profile["story"]
            else f"{profile['name']}: No story added."
        )
        for profile in employee_profiles
    )

    image_asset, image_error = save_product_image()
    if image_error:
        return image_error

    api_base_url = infer_api_base_url()
    bag_id = str(uuid.uuid4())
    image_filename = image_asset["filename"] if image_asset else ""
    bag_record = {
        "id": bag_id,
        "product_name": product_name or "Handmade Bag",
        "employee_id": employee_ids[0] if employee_ids else "",
        "employee_ids": employee_ids,
        "maker_name": maker_name,
        "maker_names": maker_names if maker_names else ([maker_name] if maker_name else []),
        "employee_story": combined_story,
        "employee_profiles": employee_profiles,
        "material_used": material_used,
        "product_image_url": (
            f"{api_base_url}/product-image/{quote(image_filename, safe='')}"
            if image_filename
            else ""
        ),
        "product_image_name": image_filename,
        "created_at": utc_now(),
    }
    if image_asset:
        bag_record["product_image_data"] = image_asset["data"]
        bag_record["product_image_mime_type"] = image_asset["mime_type"]

    # Insert a copy because PyMongo mutates inserted dict with _id (ObjectId).
    bags_collection.insert_one(dict(bag_record))

    bag_response = dict(bag_record)
    bag_response.pop("product_image_data", None)
    bag_response.pop("product_image_mime_type", None)
    bag_response.pop("product_image_name", None)

    frontend_base_url = infer_frontend_base_url()
    bag_url = f"{frontend_base_url}/#/bag?id={bag_id}"
    qr_filename = f"{bag_id}.png"
    qr_file_path = QR_DIR / qr_filename
    try:
        qrcode.make(bag_url).save(qr_file_path)
    except OSError:
        pass

    return (
        jsonify(
            {
                "message": "Bag created",
                "bag": bag_response,
                "bag_url": bag_url,
                "qr_code_url": f"{api_base_url}/qr/{qr_filename}",
            }
        ),
        201,
    )


@product_bp.route("/product-image/<path:filename>", methods=["GET"])
def serve_product_image(filename):
    safe_filename = normalize_filename(filename)
    if not safe_filename:
        return error_response("Product image not found", 404)

    image_path = PRODUCT_IMAGE_DIR / safe_filename
    bag = bags_collection.find_one(
        build_product_image_lookup_query(safe_filename),
        {
            "_id": 1,
            "product_image_name": 1,
            "product_image_data": 1,
            "product_image_mime_type": 1,
        },
    )

    if bag and not clean_text(bag.get("product_image_name")):
        bags_collection.update_one(
            {"_id": bag["_id"]},
            {"$set": {"product_image_name": safe_filename}},
        )
        bag["product_image_name"] = safe_filename

    if image_path.exists():
        if bag and not bag.get("product_image_data"):
            try:
                image_bytes = image_path.read_bytes()
            except OSError:
                image_bytes = b""
            if image_bytes:
                bags_collection.update_one(
                    {"_id": bag["_id"]},
                    {
                        "$set": {
                            "product_image_data": image_bytes,
                            "product_image_mime_type": guess_image_mime_type(
                                safe_filename, bag.get("product_image_mime_type")
                            ),
                        }
                    },
                )
        return send_from_directory(str(PRODUCT_IMAGE_DIR), safe_filename)

    image_bytes = decode_image_data((bag or {}).get("product_image_data"))
    if not image_bytes:
        return error_response("Product image not found", 404)

    return send_file(
        io.BytesIO(image_bytes),
        mimetype=guess_image_mime_type(
            safe_filename, (bag or {}).get("product_image_mime_type")
        ),
    )
