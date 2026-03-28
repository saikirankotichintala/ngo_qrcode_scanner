import { TRACEABILITY_LOG_KEY } from "./constants";
import { isoNow } from "./ids";
import { readJsonStorage, writeJsonStorage } from "./storage";

const MAX_LOG_ENTRIES = 100;

export function getSyncLogs() {
  const logs = readJsonStorage(TRACEABILITY_LOG_KEY, []);
  return Array.isArray(logs) ? logs : [];
}

export function addSyncLog(message, level = "info", details = {}) {
  const log = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    timestamp: isoNow(),
    level,
    message,
    details
  };
  const logs = [log, ...getSyncLogs()].slice(0, MAX_LOG_ENTRIES);
  writeJsonStorage(TRACEABILITY_LOG_KEY, logs);
  return logs;
}
