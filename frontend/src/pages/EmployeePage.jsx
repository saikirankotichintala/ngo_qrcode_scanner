import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL } from "../lib/api";
import { getAuthHeaders, getUserRole } from "../lib/auth";
import { getCachedEmployees, saveCachedEmployees } from "../lib/employeeCache";
import { isNetworkError, parseResponse } from "../lib/network";

const EMPLOYEE_QUEUE_KEY = "ngo_employee_registration_queue_v1";

function getQueuedEmployees() {
  try {
    const rawQueue = window.localStorage.getItem(EMPLOYEE_QUEUE_KEY);
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
  window.localStorage.setItem(EMPLOYEE_QUEUE_KEY, JSON.stringify(queue));
}

function queueEmployeeForSync(payload) {
  const queue = getQueuedEmployees();
  queue.push({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
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

function buildQueuedEmployeesPreview() {
  return getQueuedEmployees().map((queuedItem, index) => {
    const payload = queuedItem.payload || {};
    const name = String(payload.name || "").trim() || "Pending employee";
    const story = String(payload.story || "").trim();
    return {
      id: `queued-${queuedItem.id || index}`,
      name,
      story,
      is_pending_sync: true
    };
  });
}

function buildQueueStatusMessage(syncedCount, skippedDuplicateCount, remainingCount) {
  const messageParts = [];

  if (syncedCount > 0) {
    messageParts.push(`${syncedCount} synced`);
  }

  if (skippedDuplicateCount > 0) {
    messageParts.push(`${skippedDuplicateCount} duplicate skipped`);
  }

  if (remainingCount > 0) {
    messageParts.push(`${remainingCount} pending`);
  }

  if (!messageParts.length) {
    return "No queued employees to sync.";
  }

  return `Offline employee sync: ${messageParts.join(" | ")}`;
}

export default function EmployeePage() {
  const navigate = useNavigate();
  const [employeeName, setEmployeeName] = useState("");
  const [employeeStory, setEmployeeStory] = useState("");
  const [employees, setEmployees] = useState([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState("");
  const [isAgentBusy, setIsAgentBusy] = useState(false);
  const userRole = getUserRole();
  const syncInProgressRef = useRef(false);
  const storyTextAreaRef = useRef(null);

  const setStatus = useCallback((message, type = "") => {
    setStatusMessage(message);
    setStatusType(type);
  }, []);

  const submitEmployee = useCallback(async (payload) => {
    const response = await fetch(`${API_BASE_URL}/create-employee`, {
      method: "POST",
      headers: getAuthHeaders({
        "Content-Type": "application/json"
      }),
      body: JSON.stringify(payload)
    });

    return parseResponse(response);
  }, []);

  const loadEmployees = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/employees`, {
        headers: getAuthHeaders()
      });
      const data = await parseResponse(response, "Failed to load employees");
      setEmployees(data);
      saveCachedEmployees(data);
    } catch (error) {
      if (isNetworkError(error)) {
        const cachedEmployees = getCachedEmployees();
        const queuedEmployees = buildQueuedEmployeesPreview();
        const offlineEmployees = [...queuedEmployees, ...cachedEmployees];

        if (offlineEmployees.length) {
          setEmployees(offlineEmployees);

          if (cachedEmployees.length && queuedEmployees.length) {
            setStatus(
              `Offline mode: showing ${cachedEmployees.length} cached and ${queuedEmployees.length} pending employee(s).`,
              "warning"
            );
          } else if (cachedEmployees.length) {
            setStatus(
              `Offline mode: showing ${cachedEmployees.length} cached employee(s).`,
              "warning"
            );
          } else {
            setStatus(
              `Offline mode: showing ${queuedEmployees.length} pending employee registration(s).`,
              "warning"
            );
          }
          return;
        }

        setStatus("Offline mode: unable to load employee list.", "warning");
        return;
      }

      setStatus(error.message, "error");
    }
  }, [setStatus]);

  const syncQueuedEmployees = useCallback(
    async (showStatusMessage) => {
      if (syncInProgressRef.current || !navigator.onLine) {
        return;
      }

      const queue = getQueuedEmployees();
      if (!queue.length) {
        return;
      }

      syncInProgressRef.current = true;

      if (showStatusMessage) {
        setStatus(`Syncing ${queue.length} queued employee registration(s)...`, "info");
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
              remainingQueue.push(...queue.slice(index + 1));
              break;
            }
          }
        }
      } finally {
        saveQueuedEmployees(remainingQueue);
        syncInProgressRef.current = false;
      }

      if (syncedCount > 0 || skippedDuplicateCount > 0) {
        await loadEmployees();
      }

      if (showStatusMessage || syncedCount > 0 || skippedDuplicateCount > 0) {
        const remainingCount = remainingQueue.length;
        const nextStatusType = remainingCount ? "warning" : "success";
        setStatus(
          buildQueueStatusMessage(syncedCount, skippedDuplicateCount, remainingCount),
          nextStatusType
        );
      }
    },
    [loadEmployees, setStatus, submitEmployee]
  );

  const handleDeleteEmployee = useCallback(
    async (employee) => {
      if (userRole !== "admin") {
        setStatus("Only admin can delete employees.", "error");
        return;
      }

      const isConfirmed = window.confirm(`Delete employee: ${employee.name}?`);
      if (!isConfirmed) {
        return;
      }

      setStatus("Deleting employee...", "info");

      try {
        const response = await fetch(`${API_BASE_URL}/employee/${encodeURIComponent(employee.id)}`, {
          method: "DELETE",
          headers: getAuthHeaders()
        });
        await parseResponse(response);
        setStatus("Employee deleted.", "success");
        await loadEmployees();
      } catch (error) {
        setStatus(error.message, "error");
      }
    },
    [loadEmployees, setStatus, userRole]
  );

  const requestStoryFromAi = useCallback(
    async (mode) => {
      const payload = {
        name: employeeName.trim(),
        story: employeeStory.trim()
      };

      if (mode === "improve" && !payload.story) {
        setStatus("Write a draft story first, then click Fix & Improve.", "warning");
        return;
      }

      if (mode === "generate" && !payload.name && !payload.story) {
        setStatus("Please enter at least employee name before generating.", "warning");
        return;
      }

      setIsAgentBusy(true);
      setStatus(mode === "generate" ? "Generating story with AI..." : "Improving story with AI...", "info");

      try {
        const response = await fetch(`${API_BASE_URL}/ai/story`, {
          method: "POST",
          headers: getAuthHeaders({
            "Content-Type": "application/json"
          }),
          body: JSON.stringify({
            name: payload.name,
            story: payload.story,
            mode
          })
        });

        const data = await parseResponse(response);
        setEmployeeStory((data.story || "").trim());
        setStatus("Story is ready. Review and save employee.", "success");
        storyTextAreaRef.current?.focus();
      } catch (error) {
        setStatus(error.message, "error");
      } finally {
        setIsAgentBusy(false);
      }
    },
    [employeeName, employeeStory, setStatus]
  );

  async function handleEmployeeSubmit(event) {
    event.preventDefault();

    const payload = {
      name: employeeName.trim(),
      story: employeeStory.trim()
    };

    if (!payload.name || !payload.story) {
      setStatus("Please fill name and story.", "error");
      return;
    }

    if (!navigator.onLine) {
      try {
        const pendingCount = queueEmployeeForSync(payload);
        setStatus(
          `No internet. Employee saved offline and queued (${pendingCount} pending).`,
          "warning"
        );
        setEmployeeName("");
        setEmployeeStory("");
      } catch (error) {
        setStatus("No internet and local queue failed. Please retry when online.", "error");
      }
      return;
    }

    setStatus("Saving employee...", "info");

    try {
      await submitEmployee(payload);
      setStatus("Employee registered.", "success");
      setEmployeeName("");
      setEmployeeStory("");
      await loadEmployees();
    } catch (error) {
      if (isNetworkError(error)) {
        try {
          const pendingCount = queueEmployeeForSync(payload);
          setStatus(
            `Connection lost. Employee saved offline and queued (${pendingCount} pending).`,
            "warning"
          );
          setEmployeeName("");
          setEmployeeStory("");
        } catch (queueError) {
          setStatus("Connection lost and local queue failed. Please retry when online.", "error");
        }
        return;
      }

      setStatus(error.message, "error");
    }
  }

  useEffect(() => {
    loadEmployees();
    syncQueuedEmployees(false);

    const handleOnline = () => {
      syncQueuedEmployees(true);
    };

    const handleOffline = () => {
      const pendingCount = getQueuedEmployeeCount();
      if (pendingCount) {
        setStatus(
          `Offline mode: ${pendingCount} employee registration(s) waiting to sync.`,
          "warning"
        );
        return;
      }
      setStatus("Offline mode enabled. New employee registrations will be queued.", "warning");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [loadEmployees, setStatus, syncQueuedEmployees]);

  return (
    <main className="page">
      <section className="card">
        <button type="button" className="secondary small" onClick={() => navigate("/admin")}>
          Back to Dashboard
        </button>

        <h1>Employee Registration</h1>
        <p className="subtitle">Add artisan profile details</p>

        <form className="stack" onSubmit={handleEmployeeSubmit}>
          <label htmlFor="employeeName">Employee Name</label>
          <input
            id="employeeName"
            type="text"
            value={employeeName}
            onChange={(event) => setEmployeeName(event.target.value)}
            required
          />

          <label htmlFor="employeeStory">Story</label>
          <textarea
            id="employeeStory"
            rows={4}
            spellCheck
            ref={storyTextAreaRef}
            value={employeeStory}
            onChange={(event) => setEmployeeStory(event.target.value)}
            required
          />

          <div className="agent-box">
            <p className="agent-title">AI Story Assistant</p>
            <p className="agent-help">
              Generate a strong story or fix spelling and grammar before saving.
            </p>
            <div className="agent-actions">
              <button
                id="generateStoryBtn"
                type="button"
                className="secondary"
                disabled={isAgentBusy}
                onClick={() => requestStoryFromAi("generate")}
              >
                Generate Story with AI
              </button>
              <button
                id="improveStoryBtn"
                type="button"
                className="secondary"
                disabled={isAgentBusy}
                onClick={() => requestStoryFromAi("improve")}
              >
                Fix &amp; Improve Story
              </button>
            </div>
          </div>

          <button type="submit">Save Employee</button>
        </form>

        <p className={`status${statusType ? ` status-${statusType}` : ""}`}>{statusMessage}</p>

        <h2>Registered Employees</h2>
        <ul className="item-list">
          {!employees.length && <li>No employees added yet.</li>}
          {employees.map((employee) => (
            <li key={employee.id}>
              <p>
                <strong>{employee.name}</strong>
                {employee.is_pending_sync ? " (Pending sync)" : ""}
              </p>
              <p className="muted">{employee.story || "No story added."}</p>
              {userRole === "admin" && !employee.is_pending_sync && (
                <button
                  type="button"
                  className="danger small action-btn"
                  onClick={() => handleDeleteEmployee(employee)}
                >
                  Delete Employee
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

