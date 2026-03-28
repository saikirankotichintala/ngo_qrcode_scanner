import { API_BASE_URL } from "../api";
import { isNetworkError, parseResponse } from "../network";

function buildFetchContextMessage(path) {
  const endpoint = `${API_BASE_URL}${path}`;
  return `Failed to reach sync API at ${endpoint}. Check VITE_API_BASE_URL/CORS and backend availability.`;
}

async function postJson(path, body) {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return parseResponse(response);
  } catch (error) {
    if (!isNetworkError(error)) {
      throw error;
    }
    throw new Error(buildFetchContextMessage(path));
  }
}

export function sendSyncBatch(actions) {
  return postJson("/sync", { actions });
}

export function verifyQrCode(payload) {
  return postJson("/verify", payload);
}

export async function fetchTraceProduct(productId) {
  const path = `/product/${encodeURIComponent(productId)}`;
  try {
    const response = await fetch(`${API_BASE_URL}${path}`);
    return parseResponse(response);
  } catch (error) {
    if (!isNetworkError(error)) {
      throw error;
    }
    throw new Error(buildFetchContextMessage(path));
  }
}

export async function fetchTraceProducts() {
  const path = "/products";
  try {
    const response = await fetch(`${API_BASE_URL}${path}`);
    return parseResponse(response);
  } catch (error) {
    if (!isNetworkError(error)) {
      throw error;
    }
    throw new Error(buildFetchContextMessage(path));
  }
}
