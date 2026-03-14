const USER_KEY = "ngo_user";
const ROLE_KEY = "ngo_role";

export const ROLE_ROUTES = {
  admin: "/admin",
  volunteer: "/product"
};

export function getUserRole() {
  return (window.localStorage.getItem(ROLE_KEY) || "").trim().toLowerCase();
}

export function getUserName() {
  return (window.localStorage.getItem(USER_KEY) || "").trim();
}

export function setSession(userName, role) {
  window.localStorage.setItem(USER_KEY, userName);
  window.localStorage.setItem(ROLE_KEY, role);
}

export function clearSession() {
  window.localStorage.removeItem(USER_KEY);
  window.localStorage.removeItem(ROLE_KEY);
}

export function getAuthHeaders(extraHeaders = {}) {
  const headers = { ...extraHeaders };
  const role = getUserRole();
  if (role) {
    headers["X-User-Role"] = role;
  }
  return headers;
}

