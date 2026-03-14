const API_STORAGE_KEY = "ngo_api_base_url";

function normalizeBaseUrl(value) {
  if (!value) {
    return "";
  }

  const normalized = String(value).trim().replace(/\/+$/, "");
  if (!normalized || normalized.toLowerCase() === "null") {
    return "";
  }

  return normalized;
}

function getStoredApiBaseUrl() {
  try {
    return normalizeBaseUrl(window.localStorage.getItem(API_STORAGE_KEY));
  } catch (error) {
    return "";
  }
}

function inferApiBaseUrl() {
  const configuredBaseUrl =
    normalizeBaseUrl(window.NGO_API_BASE_URL) || getStoredApiBaseUrl();
  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  const pageLocation = window.location || {};
  const hostname = pageLocation.hostname;
  const protocol = pageLocation.protocol === "https:" ? "https:" : "http:";

  if (hostname) {
    return `${protocol}//${hostname}:5000`;
  }

  return "http://127.0.0.1:5000";
}

export const API_BASE_URL = inferApiBaseUrl();

export function buildBagRouteUrl(bagId) {
  const base = window.location.href.split("#")[0];
  return `${base}#/bag?id=${encodeURIComponent(bagId)}`;
}

