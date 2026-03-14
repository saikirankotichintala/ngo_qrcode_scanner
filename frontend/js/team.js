const API_BASE_URL = (window.NGO_CONFIG && window.NGO_CONFIG.API_BASE_URL) || "http://127.0.0.1:5000";

const VOLUNTEER_USERS = [
    {
        username: "volunteer",
        name: "Volunteer User",
        note: "Can register products and generate QR"
    }
];

let employeeTableBodyElement;
let volunteerListElement;
let employeeCountElement;
let volunteerCountElement;
let teamStatusElement;
let employeeSearchInput;
let employeeFromDateInput;
let employeeToDateInput;
let resetEmployeeFiltersButton;
let userRole = "";
let allEmployees = [];

function navigateTo(page) {
    window.location.href = page;
}

function getUserRole() {
    return (localStorage.getItem("ngo_role") || "").trim().toLowerCase();
}

function getAuthHeaders(extraHeaders) {
    const headers = Object.assign({}, extraHeaders || {});
    if (userRole) {
        headers["X-User-Role"] = userRole;
    }
    return headers;
}

function isAdminUser() {
    return userRole === "admin";
}

function setTeamStatus(message, type) {
    teamStatusElement.textContent = message;
    teamStatusElement.className = "status";

    if (type) {
        teamStatusElement.classList.add("status-" + type);
    }
}

function createListItem(title, subtitle) {
    const item = document.createElement("li");

    const titleText = document.createElement("p");
    const strong = document.createElement("strong");
    strong.textContent = title;
    titleText.appendChild(strong);

    const subtitleText = document.createElement("p");
    subtitleText.className = "muted";
    subtitleText.textContent = subtitle;

    item.appendChild(titleText);
    item.appendChild(subtitleText);
    return item;
}

function renderVolunteers() {
    volunteerListElement.innerHTML = "";

    VOLUNTEER_USERS.forEach(function (volunteer) {
        const label = volunteer.name + " (" + volunteer.username + ")";
        volunteerListElement.appendChild(createListItem(label, volunteer.note));
    });

    volunteerCountElement.textContent = String(VOLUNTEER_USERS.length);
}

function formatDate(isoDate) {
    if (!isoDate) {
        return "Date not available";
    }

    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) {
        return "Date not available";
    }

    return date.toLocaleDateString();
}

function createCell(text, className) {
    const td = document.createElement("td");
    td.textContent = text;
    if (className) {
        td.className = className;
    }
    return td;
}

function renderEmptyEmployeeRow() {
    employeeTableBodyElement.innerHTML = "";

    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.className = "muted table-empty";
    cell.textContent = "No employee matched this filter.";
    row.appendChild(cell);
    employeeTableBodyElement.appendChild(row);
}

async function handleEditEmployeeStory(employee) {
    if (!isAdminUser()) {
        setTeamStatus("Only admin can edit employees.", "error");
        return;
    }

    const editedStory = window.prompt(
        "Update story for " + (employee.name || "employee"),
        employee.story || ""
    );

    if (editedStory === null) {
        return;
    }

    const nextStory = editedStory.trim();
    if (!nextStory) {
        setTeamStatus("Employee story cannot be empty.", "error");
        return;
    }

    setTeamStatus("Updating employee story...", "info");

    try {
        const response = await fetch(API_BASE_URL + "/employee/" + encodeURIComponent(employee.id), {
            method: "PUT",
            headers: getAuthHeaders({
                "Content-Type": "application/json"
            }),
            body: JSON.stringify({
                story: nextStory
            })
        });
        await parseResponse(response);
        setTeamStatus("Employee story updated.", "success");
        await loadEmployees();
    } catch (error) {
        setTeamStatus(error.message, "error");
    }
}

async function handleDeleteEmployee(employee) {
    if (!isAdminUser()) {
        setTeamStatus("Only admin can delete employees.", "error");
        return;
    }

    const isConfirmed = window.confirm("Delete employee " + (employee.name || "-") + "?");
    if (!isConfirmed) {
        return;
    }

    setTeamStatus("Deleting employee...", "info");

    try {
        const response = await fetch(API_BASE_URL + "/employee/" + encodeURIComponent(employee.id), {
            method: "DELETE",
            headers: getAuthHeaders()
        });
        await parseResponse(response);
        setTeamStatus("Employee deleted.", "success");
        await loadEmployees();
    } catch (error) {
        setTeamStatus(error.message, "error");
    }
}

function createEmployeeActionCell(employee) {
    const actionCell = document.createElement("td");
    const actionWrap = document.createElement("div");
    actionWrap.className = "table-actions";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "secondary action-btn";
    editButton.textContent = "Edit Story";
    editButton.disabled = !isAdminUser();
    editButton.addEventListener("click", function () {
        handleEditEmployeeStory(employee);
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "danger action-btn";
    deleteButton.textContent = "Delete";
    deleteButton.disabled = !isAdminUser();
    deleteButton.addEventListener("click", function () {
        handleDeleteEmployee(employee);
    });

    actionWrap.appendChild(editButton);
    actionWrap.appendChild(deleteButton);
    actionCell.appendChild(actionWrap);
    return actionCell;
}

function createEmployeeRow(employee) {
    const row = document.createElement("tr");

    row.appendChild(createCell(employee.worker_id || "-", "mono-text"));
    row.appendChild(createCell(employee.name || "Unnamed employee"));
    row.appendChild(createCell(employee.story || "No story"));
    row.appendChild(createCell(formatDate(employee.created_at)));
    row.appendChild(createEmployeeActionCell(employee));

    return row;
}

function renderEmployees(employees) {
    if (!employees.length) {
        renderEmptyEmployeeRow();
        employeeCountElement.textContent = "0";
        return;
    }

    employeeTableBodyElement.innerHTML = "";
    employees.forEach(function (employee) {
        employeeTableBodyElement.appendChild(createEmployeeRow(employee));
    });

    employeeCountElement.textContent = String(employees.length);
}

function parseDateInputBoundary(dateText, endOfDay) {
    if (!dateText) {
        return null;
    }

    const date = new Date(dateText + (endOfDay ? "T23:59:59.999" : "T00:00:00.000"));
    if (Number.isNaN(date.getTime())) {
        return null;
    }
    return date;
}

function matchesEmployeeFilters(employee) {
    const searchQuery = (employeeSearchInput.value || "").trim().toLowerCase();
    const fromBoundary = parseDateInputBoundary(employeeFromDateInput.value, false);
    const toBoundary = parseDateInputBoundary(employeeToDateInput.value, true);
    const createdAt = new Date(employee.created_at || "");
    const hasValidCreatedAt = !Number.isNaN(createdAt.getTime());

    if (searchQuery) {
        const workerIdText = String(employee.worker_id || "").toLowerCase();
        const nameText = String(employee.name || "").toLowerCase();
        if (workerIdText.indexOf(searchQuery) === -1 && nameText.indexOf(searchQuery) === -1) {
            return false;
        }
    }

    if (fromBoundary && (!hasValidCreatedAt || createdAt < fromBoundary)) {
        return false;
    }

    if (toBoundary && (!hasValidCreatedAt || createdAt > toBoundary)) {
        return false;
    }

    return true;
}

function applyEmployeeFilters(showFilterStatus) {
    const filteredEmployees = allEmployees.filter(matchesEmployeeFilters);
    renderEmployees(filteredEmployees);

    if (showFilterStatus) {
        setTeamStatus(
            "Showing " +
                filteredEmployees.length +
                " of " +
                allEmployees.length +
                " employee(s).",
            "info"
        );
    }
}

function resetEmployeeFilters() {
    employeeSearchInput.value = "";
    employeeFromDateInput.value = "";
    employeeToDateInput.value = "";
    applyEmployeeFilters(true);
}

async function parseResponse(response) {
    const data = await response.json().catch(function () {
        return {};
    });

    if (!response.ok) {
        const error = new Error(data.error || "Failed to load employees");
        error.status = response.status;
        throw error;
    }

    return data;
}

async function loadEmployees() {
    setTeamStatus("Loading team details...", "info");

    try {
        const response = await fetch(API_BASE_URL + "/employees", {
            headers: getAuthHeaders()
        });
        const employees = await parseResponse(response);
        allEmployees = employees;
        applyEmployeeFilters(false);
        setTeamStatus("Team details updated.", "success");
    } catch (error) {
        allEmployees = [];
        renderEmployees([]);
        setTeamStatus(error.message, "error");
    }
}

function setupElements() {
    employeeTableBodyElement = document.getElementById("employeeDetails");
    volunteerListElement = document.getElementById("volunteerDetails");
    employeeCountElement = document.getElementById("employeeCount");
    volunteerCountElement = document.getElementById("volunteerCount");
    teamStatusElement = document.getElementById("teamStatus");
    employeeSearchInput = document.getElementById("employeeSearchInput");
    employeeFromDateInput = document.getElementById("employeeFromDate");
    employeeToDateInput = document.getElementById("employeeToDate");
    resetEmployeeFiltersButton = document.getElementById("resetEmployeeFilters");
}

function setupEvents() {
    document.getElementById("backToAdmin").addEventListener("click", function () {
        navigateTo("admin.html");
    });

    employeeSearchInput.addEventListener("input", function () {
        applyEmployeeFilters(true);
    });
    employeeFromDateInput.addEventListener("change", function () {
        applyEmployeeFilters(true);
    });
    employeeToDateInput.addEventListener("change", function () {
        applyEmployeeFilters(true);
    });
    resetEmployeeFiltersButton.addEventListener("click", resetEmployeeFilters);
}

document.addEventListener("DOMContentLoaded", function () {
    userRole = getUserRole();
    setupElements();
    setupEvents();
    renderVolunteers();
    loadEmployees();
});
