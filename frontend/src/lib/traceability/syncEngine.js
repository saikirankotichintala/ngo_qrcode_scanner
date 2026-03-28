import { isNetworkError } from "../network";
import { addSyncLog } from "./logStore";
import { applyServerProducts, removeLocalProduct } from "./productStore";
import { applySyncResults, getSyncCandidates, markNetworkFailure } from "./queueService";
import { sendSyncBatch } from "./syncApi";

function summarizeResults(results) {
  return results.reduce(
    (summary, item) => {
      if (["synced", "merged", "verified", "invalid"].includes(item.status)) {
        summary.synced += 1;
      } else {
        summary.failed += 1;
      }
      return summary;
    },
    { synced: 0, failed: 0 }
  );
}

function buildSyncMessage(result) {
  if (result.synced === 0 && result.failed === 0) {
    return "No pending actions to sync.";
  }
  return `Sync complete: ${result.synced} processed, ${result.failed} failed.`;
}

function reconcileAddConflicts(results) {
  results.forEach((result) => {
    if (result.action_type !== "add_product") {
      return;
    }
    const requestedId = result.requested_product_id;
    const serverId = result.server_product?.id;
    if (!requestedId) {
      return;
    }
    // Remove stale optimistic entries when server mapped to a different product.
    if (result.status === "rejected" || (serverId && serverId !== requestedId)) {
      removeLocalProduct(requestedId);
    }
  });
}

export async function syncQueuedActions() {
  if (!navigator.onLine) {
    return { state: "offline", results: [], message: "Offline mode: sync paused." };
  }

  const candidates = getSyncCandidates();
  if (!candidates.length) {
    return { state: "idle", results: [], message: "No pending actions to sync." };
  }

  try {
    const response = await sendSyncBatch(candidates);
    const results = Array.isArray(response.results) ? response.results : [];
    applySyncResults(results);
    applyServerProducts(response.products || []);
    reconcileAddConflicts(results);
    const summary = summarizeResults(results);
    addSyncLog(buildSyncMessage(summary), "info", summary);
    return { state: "synced", results, message: buildSyncMessage(summary) };
  } catch (error) {
    const localIds = candidates.map((item) => item.local_id);
    if (isNetworkError(error)) {
      markNetworkFailure(localIds);
    }
    addSyncLog(error.message || "Sync failed", "error");
    return { state: "error", results: [], message: error.message || "Sync failed." };
  }
}
