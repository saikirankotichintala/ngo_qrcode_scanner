from datetime import datetime
from urllib.parse import urlparse

from flask import jsonify, request

from config import (
    API_BASE_URL,
    FALLBACK_API_BASE_URL,
    FALLBACK_FRONTEND_BASE_URL,
    FRONTEND_BASE_URL,
)


def utc_now():
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def clean_text(value):
    return str(value).strip() if value is not None else ""


def parse_request_data():
    data = request.get_json(silent=True)
    if isinstance(data, dict):
        return data
    return request.form.to_dict()


def error_response(message, status_code=400):
    return jsonify({"error": message}), status_code


def get_user_role():
    role = clean_text(request.headers.get("X-User-Role")).lower()
    if role:
        return role
    return clean_text(request.args.get("role")).lower()


def require_admin():
    if get_user_role() != "admin":
        return error_response("Admin access required", 403)
    return None


def parse_bool(value, default=False):
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def sanitize_base_url(url):
    text = clean_text(url)
    if not text or text.lower() == "null":
        return ""
    return text.rstrip("/")


def infer_frontend_base_url():
    if FRONTEND_BASE_URL:
        return FRONTEND_BASE_URL

    origin = sanitize_base_url(request.headers.get("Origin"))
    if origin:
        return origin

    referer = clean_text(request.headers.get("Referer"))
    if referer:
        parsed = urlparse(referer)
        if parsed.scheme and parsed.netloc:
            return f"{parsed.scheme}://{parsed.netloc}"

    return FALLBACK_FRONTEND_BASE_URL


def infer_api_base_url():
    if API_BASE_URL:
        return API_BASE_URL

    request_base = sanitize_base_url(request.url_root)
    if request_base:
        return request_base

    return FALLBACK_API_BASE_URL
