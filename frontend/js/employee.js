const API_BASE_URL = (window.NGO_CONFIG && window.NGO_CONFIG.API_BASE_URL) || "http://127.0.0.1:5000";
const EMPLOYEE_QUEUE_KEY = "ngo_employee_registration_queue_v1";

let employeeForm;
let statusMsg;
let employeeList;
let employeeNameInput;
let employeeStoryInput;
let generateStoryBtn;
let improveStoryBtn;
let userRole = "";
let isEmployeeSyncInProgress = false;

function setStatus(message, type) {
    statusMsg.textContent = message;
    statusMsg.className = "status";

    if (type) {
        statusMsg.classList.add("status-" + type);
    }
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

async function parseResponse(response) {
    const data = await response.json().catch(function () {
        return {};
    });

    if (!response.ok) {
        const error = new Error(data.error || "Request failed");
        error.status = response.status;
        throw error;
    }

    return data;
}

function isNetworkError(error) {
    const message = String((error && error.message) || "").toLowerCase();
    const hasHttpStatus = typeof (error && error.status) === "number" && error.status > 0;
    if (hasHttpStatus) {
        return false;
    }

    return (
        message.indexOf("failed to fetch") !== -1 ||
        message.indexOf("networkerror") !== -1 ||
        message.indexOf("load failed") !== -1
    );
}

function getQueuedEmployees() {
    try {
        const rawQueue = localStorage.getItem(EMPLOYEE_QUEUE_KEY);
        if (!rawQueue) {
            return [];
        }

        const parsedQueue = JSON.parse(rawQueue);
        return Array.isArray(parsedQueue) ? parsedQueue : [];
    } catch (error) {
        return [];
    }
}

function saveQueuedEmployees(queue) {
    localStorage.setItem(EMPLOYEE_QUEUE_KEY, JSON.stringify(queue));
}

function queueEmployeeForSync(payload) {
    const queue = getQueuedEmployees();
    queue.push({
        id: String(Date.now()) + "-" + Math.random().toString(16).slice(2),
        payload: {
            name: payload.name,
            story: payload.story
        },
        queued_at: new Date().toISOString()
    });

    saveQueuedEmployees(queue);
    return queue.length;
}

function getQueuedEmployeeCount() {
    return getQueuedEmployees().length;
}

async function submitEmployee(payload) {
    const response = await fetch(API_BASE_URL + "/create-employee", {
        method: "POST",
        headers: getAuthHeaders({
            "Content-Type": "application/json"
        }),
        body: JSON.stringify(payload)
    });

    return parseResponse(response);
}

function buildQueueStatusMessage(syncedCount, skippedDuplicateCount, remainingCount) {
    const messageParts = [];

    if (syncedCount > 0) {
        messageParts.push(String(syncedCount) + " synced");
    }

    if (skippedDuplicateCount > 0) {
        messageParts.push(String(skippedDuplicateCount) + " duplicate skipped");
    }

    if (remainingCount > 0) {
        messageParts.push(String(remainingCount) + " pending");
    }

    if (!messageParts.length) {
        return "No queued employees to sync.";
    }

    return "Offline employee sync: " + messageParts.join(" | ");
}

async function syncQueuedEmployees(showStatusMessage) {
    if (isEmployeeSyncInProgress || !navigator.onLine) {
        return;
    }

    const queue = getQueuedEmployees();
    if (!queue.length) {
        return;
    }

    isEmployeeSyncInProgress = true;

    if (showStatusMessage) {
        setStatus("Syncing " + queue.length + " queued employee registration(s)...", "info");
    }

    const remainingQueue = [];
    let syncedCount = 0;
    let skippedDuplicateCount = 0;

    try {
        for (let index = 0; index < queue.length; index += 1) {
            const queuedItem = queue[index];

            try {
                await submitEmployee(queuedItem.payload || {});
                syncedCount += 1;
            } catch (error) {
                if (error.status === 409) {
                    skippedDuplicateCount += 1;
                    continue;
                }

                remainingQueue.push(queuedItem);

                if (isNetworkError(error)) {
                    Array.prototype.push.apply(remainingQueue, queue.slice(index + 1));
                    break;
                }
            }
        }
    } finally {
        saveQueuedEmployees(remainingQueue);
        isEmployeeSyncInProgress = false;
    }

    if (syncedCount > 0 || skippedDuplicateCount > 0) {
        await loadEmployees();
    }

    if (showStatusMessage || syncedCount > 0 || skippedDuplicateCount > 0) {
        const remainingCount = remainingQueue.length;
        const statusType = remainingCount ? "warning" : "success";
        setStatus(
            buildQueueStatusMessage(syncedCount, skippedDuplicateCount, remainingCount),
            statusType
        );
    }
}

async function handleDeleteEmployee(employee) {
    if (userRole !== "admin") {
        setStatus("Only admin can delete employees.", "error");
        return;
    }

    const isConfirmed = window.confirm("Delete employee: " + employee.name + "?");
    if (!isConfirmed) {
        return;
    }

    setStatus("Deleting employee...", "info");

    try {
        const response = await fetch(API_BASE_URL + "/employee/" + encodeURIComponent(employee.id), {
            method: "DELETE",
            headers: getAuthHeaders()
        });
        await parseResponse(response);
        setStatus("Employee deleted.", "success");
        await loadEmployees();
    } catch (error) {
        setStatus(error.message, "error");
    }
}

function buildEmployeeItem(employee) {
    const li = document.createElement("li");

    const nameLine = document.createElement("p");
    const nameBold = document.createElement("strong");
    nameBold.textContent = employee.name;
    nameLine.appendChild(nameBold);

    const storyLine = document.createElement("p");
    storyLine.className = "muted";
    storyLine.textContent = employee.story || "No story added.";

    li.appendChild(nameLine);
    li.appendChild(storyLine);

    if (userRole === "admin") {
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "danger small action-btn";
        deleteButton.textContent = "Delete Employee";
        deleteButton.addEventListener("click", function () {
            handleDeleteEmployee(employee);
        });
        li.appendChild(deleteButton);
    }

    return li;
}

function renderEmployees(employees) {
    employeeList.innerHTML = "";

    if (!employees.length) {
        const li = document.createElement("li");
        li.textContent = "No employees added yet.";
        employeeList.appendChild(li);
        return;
    }

    employees.forEach(function (employee) {
        employeeList.appendChild(buildEmployeeItem(employee));
    });
}

async function loadEmployees() {
    try {
        const response = await fetch(API_BASE_URL + "/employees", {
            headers: getAuthHeaders()
        });
        const employees = await parseResponse(response);
        renderEmployees(employees);
    } catch (error) {
        if (isNetworkError(error)) {
            const pendingCount = getQueuedEmployeeCount();
            if (pendingCount) {
                setStatus(
                    "Offline mode: " + pendingCount + " employee registration(s) pending sync.",
                    "warning"
                );
                return;
            }
            setStatus("Offline mode: unable to load employee list.", "warning");
            return;
        }

        setStatus(error.message, "error");
    }
}

function getEmployeePayload() {
    return {
        name: employeeNameInput.value.trim(),
        story: employeeStoryInput.value.trim()
    };
}

function setAgentBusyState(isBusy) {
    generateStoryBtn.disabled = isBusy;
    improveStoryBtn.disabled = isBusy;
}

async function requestStoryFromAi(mode) {
    const payload = getEmployeePayload();

    if (mode === "improve" && !payload.story) {
        setStatus("Write a draft story first, then click Fix & Improve.", "warning");
        return;
    }

    if (mode === "generate" && !payload.name && !payload.story) {
        setStatus("Please enter at least employee name before generating.", "warning");
        return;
    }

    setAgentBusyState(true);
    setStatus(mode === "generate" ? "Generating story with AI..." : "Improving story with AI...", "info");

    try {
        const response = await fetch(API_BASE_URL + "/ai/story", {
            method: "POST",
            headers: getAuthHeaders({
                "Content-Type": "application/json"
            }),
            body: JSON.stringify({
                name: payload.name,
                story: payload.story,
                mode: mode
            })
        });

        const data = await parseResponse(response);
        employeeStoryInput.value = (data.story || "").trim();
        setStatus("Story is ready. Review and save employee.", "success");
        employeeStoryInput.focus();
    } catch (error) {
        setStatus(error.message, "error");
    } finally {
        setAgentBusyState(false);
    }
}

async function handleEmployeeSubmit(event) {
    event.preventDefault();

    const payload = getEmployeePayload();
    if (!payload.name || !payload.story) {
        setStatus("Please fill name and story.", "error");
        return;
    }

    if (!navigator.onLine) {
        try {
            const pendingCount = queueEmployeeForSync(payload);
            setStatus(
                "No internet. Employee saved offline and queued (" + pendingCount + " pending).",
                "warning"
            );
            employeeForm.reset();
        } catch (error) {
            setStatus("No internet and local queue failed. Please retry when online.", "error");
        }
        return;
    }

    setStatus("Saving employee...", "info");

    try {
        await submitEmployee(payload);
        setStatus("Employee registered.", "success");
        employeeForm.reset();
        await loadEmployees();
    } catch (error) {
        if (isNetworkError(error)) {
            try {
                const pendingCount = queueEmployeeForSync(payload);
                setStatus(
                    "Connection lost. Employee saved offline and queued (" + pendingCount + " pending).",
                    "warning"
                );
                employeeForm.reset();
            } catch (queueError) {
                setStatus("Connection lost and local queue failed. Please retry when online.", "error");
            }
            return;
        }

        setStatus(error.message, "error");
    }
}

function goBackToAdmin() {
    window.location.href = "admin.html";
}

document.addEventListener("DOMContentLoaded", function () {
    userRole = getUserRole();

    employeeForm = document.getElementById("employeeForm");
    statusMsg = document.getElementById("statusMsg");
    employeeList = document.getElementById("employeeList");
    employeeNameInput = document.getElementById("employeeName");
    employeeStoryInput = document.getElementById("employeeStory");
    generateStoryBtn = document.getElementById("generateStoryBtn");
    improveStoryBtn = document.getElementById("improveStoryBtn");

    document.getElementById("backToAdmin").addEventListener("click", goBackToAdmin);
    employeeForm.addEventListener("submit", handleEmployeeSubmit);
    generateStoryBtn.addEventListener("click", function () {
        requestStoryFromAi("generate");
    });
    improveStoryBtn.addEventListener("click", function () {
        requestStoryFromAi("improve");
    });

    window.addEventListener("online", function () {
        syncQueuedEmployees(true);
    });

    window.addEventListener("offline", function () {
        const pendingCount = getQueuedEmployeeCount();
        if (pendingCount) {
            setStatus(
                "Offline mode: " + pendingCount + " employee registration(s) waiting to sync.",
                "warning"
            );
            return;
        }
        setStatus("Offline mode enabled. New employee registrations will be queued.", "warning");
    });

    loadEmployees();
    syncQueuedEmployees(false);
});
