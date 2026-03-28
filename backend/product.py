import uuid
from pathlib import Path

import qrcode
from flask import Blueprint, jsonify, request, send_from_directory
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


def save_product_image():
    image_file = request.files.get("product_image")
    if not image_file:
        return "", None

    original_filename = secure_filename(image_file.filename or "")
    extension = Path(original_filename).suffix.lower()

    if extension not in ALLOWED_IMAGE_EXTENSIONS:
        return "", error_response(
            "Invalid product image type. Allowed: jpg, jpeg, png, webp, gif"
        )

    image_filename = f"{uuid.uuid4()}{extension}"
    image_path = PRODUCT_IMAGE_DIR / image_filename
    image_file.save(image_path)
    return image_filename, None


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

    image_filename, image_error = save_product_image()
    if image_error:
        return image_error

    api_base_url = infer_api_base_url()
    bag_id = str(uuid.uuid4())
    bag = {
        "id": bag_id,
        "employee_id": employee_ids[0] if employee_ids else "",
        "employee_ids": employee_ids,
        "maker_name": maker_name,
        "maker_names": maker_names if maker_names else ([maker_name] if maker_name else []),
        "employee_story": combined_story,
        "employee_profiles": employee_profiles,
        "material_used": material_used,
        "product_image_url": (
            f"{api_base_url}/product-image/{image_filename}" if image_filename else ""
        ),
        "created_at": utc_now(),
    }

    # Insert a copy because PyMongo mutates inserted dict with _id (ObjectId).
    bags_collection.insert_one(dict(bag))

    frontend_base_url = infer_frontend_base_url()
    bag_url = f"{frontend_base_url}/#/bag?id={bag_id}"
    qr_filename = f"{bag_id}.png"
    qr_file_path = QR_DIR / qr_filename
    qrcode.make(bag_url).save(qr_file_path)

    return (
        jsonify(
            {
                "message": "Bag created",
                "bag": bag,
                "bag_url": bag_url,
                "qr_code_url": f"{api_base_url}/qr/{qr_filename}",
            }
        ),
        201,
    )


@product_bp.route("/product-image/<path:filename>", methods=["GET"])
def serve_product_image(filename):
    return send_from_directory(str(PRODUCT_IMAGE_DIR), filename)
