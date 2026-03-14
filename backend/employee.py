import uuid
import re

from flask import Blueprint, jsonify

from db import employees_collection
from helpers import clean_text, error_response, parse_request_data, require_admin, utc_now

employee_bp = Blueprint("employee", __name__)
WORKER_ID_PREFIX = "WKR"
WORKER_ID_PADDING = 5
WORKER_ID_PATTERN = re.compile(rf"^{WORKER_ID_PREFIX}-(\d+)$", re.IGNORECASE)


def find_employee(employee_id):
    return employees_collection.find_one({"id": employee_id}, {"_id": 0})


def parse_worker_id_number(worker_id):
    text = clean_text(worker_id)
    match = WORKER_ID_PATTERN.match(text)
    if not match:
        return None
    return int(match.group(1))


def format_worker_id(number):
    return f"{WORKER_ID_PREFIX}-{number:0{WORKER_ID_PADDING}d}"


def get_used_worker_numbers():
    used_numbers = set()
    cursor = employees_collection.find({}, {"worker_id": 1, "_id": 0})
    for employee in cursor:
        worker_number = parse_worker_id_number(employee.get("worker_id"))
        if worker_number:
            used_numbers.add(worker_number)
    return used_numbers


def generate_next_worker_id(used_numbers):
    worker_number = 1
    while worker_number in used_numbers:
        worker_number += 1
    used_numbers.add(worker_number)
    return format_worker_id(worker_number)


def ensure_worker_id(employee, used_numbers):
    worker_id = clean_text(employee.get("worker_id"))
    if worker_id:
        worker_number = parse_worker_id_number(worker_id)
        if worker_number:
            used_numbers.add(worker_number)
            return employee

    worker_id = generate_next_worker_id(used_numbers)
    employees_collection.update_one({"id": employee["id"]}, {"$set": {"worker_id": worker_id}})
    employee["worker_id"] = worker_id
    return employee


@employee_bp.route("/create-employee", methods=["POST"])
def create_employee():
    data = parse_request_data()
    name = clean_text(data.get("name"))
    story = clean_text(data.get("story"))

    if not name:
        return error_response("Employee name is required")
    if not story:
        return error_response("Employee story is required")

    existing_employee = employees_collection.find_one(
        {"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}},
        {"_id": 0},
    )
    if existing_employee:
        return error_response("Employee already exists", 409)

    used_worker_numbers = get_used_worker_numbers()
    employee = {
        "id": str(uuid.uuid4()),
        "worker_id": generate_next_worker_id(used_worker_numbers),
        "name": name,
        "story": story,
        "created_at": utc_now(),
    }

    # Insert a copy because PyMongo mutates inserted dict with _id (ObjectId).
    employees_collection.insert_one(dict(employee))
    return jsonify({"message": "Employee created", "employee": employee}), 201


@employee_bp.route("/employees", methods=["GET"])
def get_employees():
    employees = list(employees_collection.find({}, {"_id": 0}).sort("created_at", -1))
    used_worker_numbers = get_used_worker_numbers()
    employees = [ensure_worker_id(employee, used_worker_numbers) for employee in employees]
    return jsonify(employees)


@employee_bp.route("/employee/<employee_id>", methods=["PUT"])
def update_employee(employee_id):
    admin_error = require_admin()
    if admin_error:
        return admin_error

    employee = find_employee(employee_id)
    if not employee:
        return error_response("Employee not found", 404)

    data = parse_request_data()
    updates = {}

    if "name" in data:
        name = clean_text(data.get("name"))
        if not name:
            return error_response("Employee name is required")

        existing_employee = employees_collection.find_one(
            {
                "id": {"$ne": employee_id},
                "name": {"$regex": f"^{re.escape(name)}$", "$options": "i"},
            },
            {"_id": 0},
        )
        if existing_employee:
            return error_response("Employee already exists", 409)
        updates["name"] = name

    if "story" in data:
        story = clean_text(data.get("story"))
        if not story:
            return error_response("Employee story is required")
        updates["story"] = story

    if not updates:
        return error_response("Provide at least one field to update: name or story")

    employees_collection.update_one({"id": employee_id}, {"$set": updates})
    employee.update(updates)
    return jsonify({"message": "Employee updated", "employee": employee})


@employee_bp.route("/employee/<employee_id>", methods=["DELETE"])
def delete_employee(employee_id):
    admin_error = require_admin()
    if admin_error:
        return admin_error

    employee = find_employee(employee_id)
    if not employee:
        return error_response("Employee not found", 404)

    employees_collection.delete_one({"id": employee_id})
    return jsonify({"message": "Employee deleted", "employee_id": employee_id})
