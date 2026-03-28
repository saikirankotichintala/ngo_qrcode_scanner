export function isoNow() {
  return new Date().toISOString();
}

export function buildLocalId(prefix = "action") {
  if (window.crypto?.randomUUID) {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }

  const randomToken = Math.random().toString(36).slice(2);
  return `${prefix}-${Date.now()}-${randomToken}`;
}
