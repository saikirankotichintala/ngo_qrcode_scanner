const API_STORAGE_KEY = "ngo_api_base_url";
const DEFAULT_API_BASE_URL = "https://ngo-qrcode-backend.onrender.com";
const LOCAL_API_BASE_PATTERN = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i;

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
  const runtimeConfiguredBaseUrl = normalizeBaseUrl(window.NGO_API_BASE_URL);
  if (runtimeConfiguredBaseUrl) {
    return runtimeConfiguredBaseUrl;
  }

  const storedBaseUrl = getStoredApiBaseUrl();
  if (storedBaseUrl && !LOCAL_API_BASE_PATTERN.test(storedBaseUrl)) {
    return storedBaseUrl;
  }

  return DEFAULT_API_BASE_URL;
}

export const API_BASE_URL = inferApiBaseUrl();

export function buildBagRouteUrl(bagId) {
  const base = window.location.href.split("#")[0];
  return `${base}#/bag?id=${encodeURIComponent(bagId)}`;
}

