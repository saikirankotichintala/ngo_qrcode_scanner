import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL } from "../lib/api";
import { getAuthHeaders, getUserRole } from "../lib/auth";
import { formatDate, parseDateInputBoundary, parseResponse } from "../lib/network";

const VOLUNTEER_USERS = [
  {
    username: "volunteer",
    name: "Volunteer User",
    note: "Can register products and generate QR"
  }
];

export default function TeamPage() {
  const navigate = useNavigate();
  const [allEmployees, setAllEmployees] = useState([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState("");
  const [searchText, setSearchText] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const userRole = getUserRole();
  const isAdmin = userRole === "admin";

  const setStatus = useCallback((message, type = "") => {
    setStatusMessage(message);
    setStatusType(type);
  }, []);

  const filteredEmployees = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    const fromBoundary = parseDateInputBoundary(fromDate, false);
    const toBoundary = parseDateInputBoundary(toDate, true);

    return allEmployees.filter((employee) => {
      const createdAt = new Date(employee.created_at || "");
      const hasValidCreatedAt = !Number.isNaN(createdAt.getTime());

      if (query) {
        const workerIdText = String(employee.worker_id || "").toLowerCase();
        const nameText = String(employee.name || "").toLowerCase();
        if (!workerIdText.includes(query) && !nameText.includes(query)) {
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
    });
  }, [allEmployees, fromDate, searchText, toDate]);

  const loadEmployees = useCallback(async () => {
    setStatus("Loading team details...", "info");

    try {
      const response = await fetch(`${API_BASE_URL}/employees`, {
        headers: getAuthHeaders()
      });
      const employees = await parseResponse(response, "Failed to load employees");
      setAllEmployees(employees);
      setStatus("Team details updated.", "success");
    } catch (error) {
      setAllEmployees([]);
      setStatus(error.message, "error");
    }
  }, [setStatus]);

  const handleEditEmployeeStory = useCallback(
    async (employee) => {
      if (!isAdmin) {
        setStatus("Only admin can edit employees.", "error");
        return;
      }

      const editedStory = window.prompt(
        `Update story for ${employee.name || "employee"}`,
        employee.story || ""
      );

      if (editedStory === null) {
        return;
      }

      const nextStory = editedStory.trim();
      if (!nextStory) {
        setStatus("Employee story cannot be empty.", "error");
        return;
      }

      setStatus("Updating employee story...", "info");

      try {
        const response = await fetch(`${API_BASE_URL}/employee/${encodeURIComponent(employee.id)}`, {
          method: "PUT",
          headers: getAuthHeaders({
            "Content-Type": "application/json"
          }),
          body: JSON.stringify({
            story: nextStory
          })
        });
        await parseResponse(response);
        setStatus("Employee story updated.", "success");
        await loadEmployees();
      } catch (error) {
        setStatus(error.message, "error");
      }
    },
    [isAdmin, loadEmployees, setStatus]
  );

  const handleDeleteEmployee = useCallback(
    async (employee) => {
      if (!isAdmin) {
        setStatus("Only admin can delete employees.", "error");
        return;
      }

      const isConfirmed = window.confirm(`Delete employee ${employee.name || "-"}?`);
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
    [isAdmin, loadEmployees, setStatus]
  );

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  return (
    <main className="page team-page">
      <section className="card soft">
        <button type="button" className="secondary small" onClick={() => navigate("/admin")}>
          Back to Dashboard
        </button>

        <h2>Employee and Volunteer Details</h2>

        <div className="team-summary">
          <p>
            <strong>Employees:</strong> <span>{filteredEmployees.length}</span>
          </p>
          <p>
            <strong>Volunteers:</strong> <span>{VOLUNTEER_USERS.length}</span>
          </p>
        </div>

        <div className="team-columns">
          <div className="team-employee-column">
            <h3>Employee Information</h3>

            <div className="filter-grid team-filter-grid">
              <input
                type="text"
                placeholder="Search by worker ID or name"
                aria-label="Search employees"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
              />
              <input
                type="date"
                aria-label="Employee from date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
              />
              <input
                type="date"
                aria-label="Employee to date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
              />
              <button
                type="button"
                className="secondary filter-reset-btn"
                onClick={() => {
                  setSearchText("");
                  setFromDate("");
                  setToDate("");
                }}
              >
                Reset
              </button>
            </div>

            <div className="table-wrap">
              <table className="admin-table team-table">
                <thead>
                  <tr>
                    <th>Worker ID</th>
                    <th>Name</th>
                    <th>Story</th>
                    <th>Added</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {!filteredEmployees.length && (
                    <tr>
                      <td colSpan={5} className="muted table-empty">
                        No employee matched this filter.
                      </td>
                    </tr>
                  )}
                  {filteredEmployees.map((employee) => (
                    <tr key={employee.id}>
                      <td className="mono-text">{employee.worker_id || "-"}</td>
                      <td>{employee.name || "Unnamed employee"}</td>
                      <td>{employee.story || "No story"}</td>
                      <td>{formatDate(employee.created_at)}</td>
                      <td>
                        <div className="table-actions">
                          <button
                            type="button"
                            className="secondary action-btn"
                            disabled={!isAdmin}
                            onClick={() => handleEditEmployeeStory(employee)}
                          >
                            Edit Story
                          </button>
                          <button
                            type="button"
                            className="danger action-btn"
                            disabled={!isAdmin}
                            onClick={() => handleDeleteEmployee(employee)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="team-volunteer-column">
            <h3>Volunteers</h3>
            <ul className="item-list">
              {VOLUNTEER_USERS.map((volunteer) => (
                <li key={volunteer.username}>
                  <p>
                    <strong>
                      {volunteer.name} ({volunteer.username})
                    </strong>
                  </p>
                  <p className="muted">{volunteer.note}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className={`status${statusType ? ` status-${statusType}` : ""}`}>{statusMessage}</p>
      </section>
    </main>
  );
}
