import { API_BASE_URL } from "../api";
import { parseResponse } from "../network";

async function postJson(path, body) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return parseResponse(response);
}

export function sendSyncBatch(actions) {
  return postJson("/sync", { actions });
}

export function verifyQrCode(payload) {
  return postJson("/verify", payload);
}

export async function fetchTraceProduct(productId) {
  const response = await fetch(`${API_BASE_URL}/product/${encodeURIComponent(productId)}`);
  return parseResponse(response);
}

export async function fetchTraceProducts() {
  const response = await fetch(`${API_BASE_URL}/products`);
  return parseResponse(response);
}
