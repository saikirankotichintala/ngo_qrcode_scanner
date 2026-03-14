export async function parseResponse(response, fallbackMessage = "Request failed") {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || fallbackMessage);
    error.status = response.status;
    throw error;
  }

  return data;
}

export function isNetworkError(error) {
  const message = String(error?.message || "").toLowerCase();
  const hasHttpStatus = typeof error?.status === "number" && error.status > 0;
  if (hasHttpStatus) {
    return false;
  }

  return (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("load failed")
  );
}

export function formatDate(isoDate) {
  if (!isoDate) {
    return "Date not available";
  }

  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "Date not available";
  }

  return date.toLocaleDateString();
}

export function parseDateInputBoundary(dateText, endOfDay) {
  if (!dateText) {
    return null;
  }

  const date = new Date(dateText + (endOfDay ? "T23:59:59.999" : "T00:00:00.000"));
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

