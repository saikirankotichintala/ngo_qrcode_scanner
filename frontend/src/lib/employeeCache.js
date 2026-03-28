const EMPLOYEE_CACHE_KEY = "ngo_employee_list_cache_v1";

function normalizeEmployees(employees) {
  if (!Array.isArray(employees)) {
    return [];
  }

  return employees
    .map((employee) => {
      const id = String(employee?.id || "").trim();
      const name = String(employee?.name || "").trim();
      const story = String(employee?.story || "").trim();

      if (!id || !name) {
        return null;
      }

      return {
        ...employee,
        id,
        name,
        story
      };
    })
    .filter(Boolean);
}

export function getCachedEmployees() {
  try {
    const raw = window.localStorage.getItem(EMPLOYEE_CACHE_KEY);
    if (!raw) {
      return [];
    }

    return normalizeEmployees(JSON.parse(raw));
  } catch (error) {
    return [];
  }
}

export function saveCachedEmployees(employees) {
  try {
    const normalizedEmployees = normalizeEmployees(employees);
    window.localStorage.setItem(EMPLOYEE_CACHE_KEY, JSON.stringify(normalizedEmployees));
  } catch (error) {
    // Ignore cache failures and continue with live data flow.
  }
}
