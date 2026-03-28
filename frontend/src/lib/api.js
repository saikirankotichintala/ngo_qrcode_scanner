const API_STORAGE_KEY = "ngo_api_base_url";
const DEFAULT_PROD_API_BASE_URL = "https://ngo-qrcode-scanner.onrender.com";
const LOCAL_API_FALLBACK = "http://127.0.0.1:5000";
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

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
  const envBaseUrl =
    normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL) ||
    normalizeBaseUrl(import.meta.env.VITE_NGO_API_BASE_URL);
  const configuredBaseUrl =
    envBaseUrl || normalizeBaseUrl(window.NGO_API_BASE_URL) || getStoredApiBaseUrl();
  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  const pageLocation = window.location || {};
  const hostname = pageLocation.hostname;
  const protocol = pageLocation.protocol === "https:" ? "https:" : "http:";

  if (hostname && LOCAL_HOSTNAMES.has(String(hostname).toLowerCase())) {
    return `${protocol}//${hostname}:5000`;
  }

  if (typeof window !== "undefined" && window.location?.protocol === "https:") {
    return DEFAULT_PROD_API_BASE_URL;
  }

  return LOCAL_API_FALLBACK;
}

export const API_BASE_URL = inferApiBaseUrl();

export function buildBagRouteUrl(bagId) {
  const base = window.location.href.split("#")[0];
  return `${base}#/bag?id=${encodeURIComponent(bagId)}`;
}

