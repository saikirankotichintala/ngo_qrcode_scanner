import {
  MAX_SYNC_RETRIES,
  RETRY_BASE_DELAY_MS,
  RETRY_MAX_DELAY_MS,
  TRACEABILITY_QUEUE_KEY
} from "./constants";
import { buildLocalId, isoNow } from "./ids";
import { readJsonStorage, writeJsonStorage } from "./storage";

const COMPLETED_STATUSES = new Set([
  "synced",
  "merged",
  "verified",
  "invalid",
  "conflict",
  "rejected"
]);

function normalizeQueue(rawQueue) {
  return Array.isArray(rawQueue) ? rawQueue.filter((entry) => entry && entry.local_id) : [];
}

export function getActionQueue() {
  return normalizeQueue(readJsonStorage(TRACEABILITY_QUEUE_KEY, []));
}

export function saveActionQueue(queue) {
  writeJsonStorage(TRACEABILITY_QUEUE_KEY, normalizeQueue(queue));
}

export function enqueueAction(actionType, payload) {
  const action = {
    action_type: actionType,
    local_id: buildLocalId(actionType),
    timestamp: isoNow(),
    synced: false,
    retries: 0,
    next_retry_at: "",
    blocked: false,
    payload: payload || {}
  };
  const queue = getActionQueue();
  queue.push(action);
  saveActionQueue(queue);
  return action;
}

export function getQueueStats() {
  const queue = getActionQueue();
  const pending = queue.filter((item) => !item.synced).length;
  const synced = queue.length - pending;
  const blocked = queue.filter((item) => item.blocked && !item.synced).length;
  return { total: queue.length, pending, synced, blocked };
}

function canRetryAction(action, nowMillis) {
  if (action.synced || action.blocked) {
    return false;
  }
  if (!action.next_retry_at) {
    return true;
  }
  return Date.parse(action.next_retry_at) <= nowMillis;
}

export function getSyncCandidates() {
  const nowMillis = Date.now();
  return getActionQueue().filter((action) => canRetryAction(action, nowMillis));
}

function calculateRetryDelay(retryCount) {
  const delay = RETRY_BASE_DELAY_MS * 2 ** Math.max(0, retryCount - 1);
  return Math.min(delay, RETRY_MAX_DELAY_MS);
}

function scheduleRetry(action, shouldRetry, message) {
  const nextRetryCount = (action.retries || 0) + 1;
  if (!shouldRetry || nextRetryCount > MAX_SYNC_RETRIES) {
    return {
      ...action,
      blocked: true,
      last_error: message || "Sync failed without retry."
    };
  }
  // Exponential backoff keeps retry traffic low during unstable networks.
  const delay = calculateRetryDelay(nextRetryCount);
  const nextRetryAt = new Date(Date.now() + delay).toISOString();
  return {
    ...action,
    retries: nextRetryCount,
    next_retry_at: nextRetryAt,
    last_error: message || "Sync failed. Will retry."
  };
}

function applyResultToAction(action, result) {
  if (!result) {
    return action;
  }
  if (COMPLETED_STATUSES.has(result.status)) {
    return { ...action, synced: true, blocked: false, last_error: "" };
  }
  const retryable = Boolean(result.retryable);
  return scheduleRetry(action, retryable, result.message);
}

export function applySyncResults(results) {
  const resultMap = new Map(results.map((result) => [result.local_id, result]));
  const queue = getActionQueue().map((action) => {
    const result = resultMap.get(action.local_id);
    return applyResultToAction(action, result);
  });
  saveActionQueue(queue);
  return queue;
}

export function markNetworkFailure(localIds) {
  const failedSet = new Set(localIds);
  const queue = getActionQueue().map((action) => {
    if (!failedSet.has(action.local_id)) {
      return action;
    }
    return scheduleRetry(action, true, "Network unavailable during sync.");
  });
  saveActionQueue(queue);
  return queue;
}
