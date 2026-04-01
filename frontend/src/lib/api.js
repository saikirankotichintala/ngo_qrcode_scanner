const API_STORAGE_KEY = "ngo_api_base_url";
const DEFAULT_PROD_API_BASE_URL = "https://ngo-qrcode-scanner.onrender.com";
const LOCAL_API_FALLBACK = "http://127.0.0.1:5000";
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);
const LEGACY_BROKEN_HOSTS = new Set();

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

function isLocalHostname(hostname) {
  return LOCAL_HOSTNAMES.has(String(hostname || "").toLowerCase());
}

function parseHostname(value) {
  try {
    return new URL(value).hostname || "";
  } catch (error) {
    return "";
  }
}

function usesInsecureHttp(value) {
  return /^http:\/\//i.test(String(value || ""));
}

function isLegacyBrokenUrl(value) {
  const hostname = parseHostname(value);
  return LEGACY_BROKEN_HOSTS.has(hostname.toLowerCase());
}

function isUnsafeForCurrentPage(value) {
  if (!value) {
    return false;
  }

  if (isLegacyBrokenUrl(value)) {
    return true;
  }

  const pageHostname = String(window.location?.hostname || "");
  const pageProtocol = String(window.location?.protocol || "");
  const targetHostname = parseHostname(value);
  const targetIsLocal = isLocalHostname(targetHostname);
  const pageIsLocal = isLocalHostname(pageHostname);

  if (!pageIsLocal && targetIsLocal) {
    return true;
  }

  if (pageProtocol === "https:" && usesInsecureHttp(value) && !targetIsLocal) {
    return true;
  }

  return false;
}

function pickConfiguredApiBaseUrl() {
  const candidates = [
    normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL),
    normalizeBaseUrl(import.meta.env.VITE_NGO_API_BASE_URL),
    normalizeBaseUrl(window.NGO_API_BASE_URL),
    getStoredApiBaseUrl()
  ];
  return candidates.find((value) => value && !isUnsafeForCurrentPage(value)) || "";
}

function inferApiBaseUrl() {
  const configuredBaseUrl = pickConfiguredApiBaseUrl();
  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  const pageLocation = window.location || {};
  const hostname = pageLocation.hostname;
  const protocol = pageLocation.protocol === "https:" ? "https:" : "http:";

  if (hostname && isLocalHostname(hostname)) {
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

