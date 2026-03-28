import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import NetworkStatusBadge from "../components/traceability/NetworkStatusBadge";
import QueueSummary from "../components/traceability/QueueSummary";
import { buildLocalId, isoNow } from "../lib/traceability/ids";
import { getSyncLogs } from "../lib/traceability/logStore";
import {
  applyOptimisticAdd,
  applyOptimisticUpdate,
  applyServerProducts,
  getLocalProducts
} from "../lib/traceability/productStore";
import { enqueueAction, getQueueStats } from "../lib/traceability/queueService";
import { syncQueuedActions } from "../lib/traceability/syncEngine";
import { fetchTraceProducts } from "../lib/traceability/syncApi";
import { useNetworkStatus } from "../lib/traceability/useNetworkStatus";

const EMPTY_ADD_FORM = {
  product_code: "",
  name: "",
  batch_no: "",
  qr_code: ""
};

const EMPTY_UPDATE_FORM = {
  product_id: "",
  product_code: "",
  name: "",
  batch_no: "",
  qr_code: ""
};

const EMPTY_VERIFY_FORM = {
  product_id: "",
  qr_code: ""
};

function getLatestVerificationText(results, targetLocalId) {
  const match = results.find((item) => item.local_id === targetLocalId);
  if (!match) {
    return "";
  }
  if (match.verification_status === "VERIFIED") {
    return "QR status: VERIFIED";
  }
  if (match.verification_status === "INVALID") {
    return "QR status: INVALID";
  }
  return "";
}

function buildStatusFromSync(syncResult) {
  if (syncResult.state === "error") {
    return { text: syncResult.message, type: "error" };
  }
  if (syncResult.state === "offline") {
    return { text: syncResult.message, type: "warning" };
  }
  return { text: syncResult.message, type: "success" };
}

export default function TraceabilityPage() {
  const navigate = useNavigate();
  const isOnline = useNetworkStatus();
  const syncInProgressRef = useRef(false);
  const [products, setProducts] = useState(() => getLocalProducts());
  const [queueStats, setQueueStats] = useState(() => getQueueStats());
  const [syncLogs, setSyncLogs] = useState(() => getSyncLogs());
  const [statusText, setStatusText] = useState("Smart sync is ready.");
  const [statusType, setStatusType] = useState("info");
  const [verificationText, setVerificationText] = useState("");
  const [addForm, setAddForm] = useState(EMPTY_ADD_FORM);
  const [updateForm, setUpdateForm] = useState(EMPTY_UPDATE_FORM);
  const [verifyForm, setVerifyForm] = useState(EMPTY_VERIFY_FORM);

  const refreshView = useCallback(() => {
    setProducts(getLocalProducts());
    setQueueStats(getQueueStats());
    setSyncLogs(getSyncLogs());
  }, []);

  const setStatus = useCallback((text, type = "info") => {
    setStatusText(text);
    setStatusType(type);
  }, []);

  const syncNow = useCallback(
    async (showStatus) => {
      if (syncInProgressRef.current) {
        return { state: "busy", results: [], message: "Sync already running." };
      }
      syncInProgressRef.current = true;
      const syncResult = await syncQueuedActions();
      syncInProgressRef.current = false;
      refreshView();
      if (showStatus) {
        const status = buildStatusFromSync(syncResult);
        setStatus(status.text, status.type);
      }
      return syncResult;
    },
    [refreshView, setStatus]
  );

  const knownProductIds = useMemo(() => products.map((product) => product.id), [products]);

  const handleAddProduct = useCallback(
    async (event) => {
      event.preventDefault();
      const productCode = addForm.product_code.trim().toUpperCase();
      const name = addForm.name.trim();
      if (!productCode || !name) {
        setStatus("product_code and name are required.", "error");
        return;
      }

      const payload = {
        product_id: buildLocalId("prd"),
        product_code: productCode,
        name,
        batch_no: addForm.batch_no.trim(),
        qr_code: addForm.qr_code.trim(),
        metadata: { queued_at: isoNow() }
      };
      const queuedAction = enqueueAction("add_product", payload);
      applyOptimisticAdd(payload, queuedAction.timestamp);
      setAddForm(EMPTY_ADD_FORM);
      refreshView();
      setStatus("Add action saved locally.", navigator.onLine ? "info" : "warning");
      if (navigator.onLine) {
        await syncNow(true);
      }
    },
    [addForm, refreshView, setStatus, syncNow]
  );

  const handleUpdateProduct = useCallback(
    async (event) => {
      event.preventDefault();
      const productId = updateForm.product_id.trim();
      if (!productId) {
        setStatus("Select product_id to update.", "error");
        return;
      }

      const productCode = updateForm.product_code.trim().toUpperCase();
      const name = updateForm.name.trim();
      const batchNo = updateForm.batch_no.trim();
      const qrCode = updateForm.qr_code.trim();
      const payload = { product_id: productId };
      if (productCode) {
        payload.product_code = productCode;
      }
      if (name) {
        payload.name = name;
      }
      if (batchNo) {
        payload.batch_no = batchNo;
      }
      if (qrCode) {
        payload.qr_code = qrCode;
      }
      const queuedAction = enqueueAction("update_product", payload);
      applyOptimisticUpdate(payload, queuedAction.timestamp);
      setUpdateForm(EMPTY_UPDATE_FORM);
      refreshView();
      setStatus("Update action saved locally.", navigator.onLine ? "info" : "warning");
      if (navigator.onLine) {
        await syncNow(true);
      }
    },
    [refreshView, setStatus, syncNow, updateForm]
  );

  const handleVerifyQr = useCallback(
    async (event) => {
      event.preventDefault();
      const payload = {
        product_id: verifyForm.product_id.trim(),
        qr_code: verifyForm.qr_code.trim(),
        scanned_at: isoNow()
      };
      if (!payload.product_id && !payload.qr_code) {
        setStatus("Provide product_id or qr_code.", "error");
        return;
      }

      const queuedAction = enqueueAction("scan_verification", payload);
      setVerifyForm(EMPTY_VERIFY_FORM);
      refreshView();
      setVerificationText("");
      if (!navigator.onLine) {
        setStatus("Verification queued offline. It will auto-sync when online.", "warning");
        return;
      }

      const syncResult = await syncNow(true);
      const text = getLatestVerificationText(syncResult.results, queuedAction.local_id);
      setVerificationText(text || "Verification request synced.");
    },
    [refreshView, setStatus, syncNow, verifyForm]
  );

  const loadLatestProducts = useCallback(async () => {
    if (!navigator.onLine) {
      refreshView();
      return;
    }
    try {
      const remoteProducts = await fetchTraceProducts();
      applyServerProducts(remoteProducts);
      refreshView();
    } catch (error) {
      setStatus(error.message || "Unable to load server products.", "warning");
    }
  }, [refreshView, setStatus]);

  useEffect(() => {
    refreshView();
    loadLatestProducts();
  }, [loadLatestProducts, refreshView]);

  useEffect(() => {
    if (isOnline) {
      syncNow(true);
      return;
    }
    setStatus("Offline mode enabled. Actions are stored in local queue.", "warning");
  }, [isOnline, setStatus, syncNow]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      syncNow(false);
    }, 20000);
    return () => window.clearInterval(timer);
  }, [syncNow]);

  return (
    <main className="page">
      <section className="card soft">
        <button type="button" className="secondary small" onClick={() => navigate("/admin")}>
          Back to Dashboard
        </button>
        <h2>Traceability Smart Sync</h2>
        <NetworkStatusBadge isOnline={isOnline} />
        <QueueSummary stats={queueStats} />

        <form className="stack trace-form" onSubmit={handleAddProduct}>
          <h3>Add Product</h3>
          <input
            type="text"
            placeholder="product_code"
            value={addForm.product_code}
            onChange={(event) => setAddForm({ ...addForm, product_code: event.target.value })}
            required
          />
          <input
            type="text"
            placeholder="name"
            value={addForm.name}
            onChange={(event) => setAddForm({ ...addForm, name: event.target.value })}
            required
          />
          <input
            type="text"
            placeholder="batch_no"
            value={addForm.batch_no}
            onChange={(event) => setAddForm({ ...addForm, batch_no: event.target.value })}
          />
          <input
            type="text"
            placeholder="qr_code"
            value={addForm.qr_code}
            onChange={(event) => setAddForm({ ...addForm, qr_code: event.target.value })}
          />
          <button type="submit">Queue Add Product</button>
        </form>

        <form className="stack trace-form" onSubmit={handleUpdateProduct}>
          <h3>Update Product</h3>
          <select
            value={updateForm.product_id}
            onChange={(event) => setUpdateForm({ ...updateForm, product_id: event.target.value })}
            required
          >
            <option value="">Select product_id</option>
            {knownProductIds.map((productId) => (
              <option key={productId} value={productId}>
                {productId}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="product_code (optional)"
            value={updateForm.product_code}
            onChange={(event) => setUpdateForm({ ...updateForm, product_code: event.target.value })}
          />
          <input
            type="text"
            placeholder="name (optional)"
            value={updateForm.name}
            onChange={(event) => setUpdateForm({ ...updateForm, name: event.target.value })}
          />
          <input
            type="text"
            placeholder="batch_no (optional)"
            value={updateForm.batch_no}
            onChange={(event) => setUpdateForm({ ...updateForm, batch_no: event.target.value })}
          />
          <input
            type="text"
            placeholder="qr_code (optional)"
            value={updateForm.qr_code}
            onChange={(event) => setUpdateForm({ ...updateForm, qr_code: event.target.value })}
          />
          <button type="submit">Queue Update Product</button>
        </form>

        <form className="stack trace-form" onSubmit={handleVerifyQr}>
          <h3>Scan QR Verification</h3>
          <input
            type="text"
            placeholder="product_id"
            value={verifyForm.product_id}
            onChange={(event) => setVerifyForm({ ...verifyForm, product_id: event.target.value })}
          />
          <input
            type="text"
            placeholder="qr_code"
            value={verifyForm.qr_code}
            onChange={(event) => setVerifyForm({ ...verifyForm, qr_code: event.target.value })}
          />
          <button type="submit">Queue Verification Scan</button>
        </form>

        <button type="button" className="secondary" onClick={() => syncNow(true)}>
          Force Sync Now
        </button>

        {!!verificationText && <p className="status status-success">{verificationText}</p>}
        <p className={`status${statusType ? ` status-${statusType}` : ""}`}>{statusText}</p>

        <h3>Local Product Cache</h3>
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Code</th>
                <th>Name</th>
                <th>Batch</th>
                <th>QR</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {!products.length && (
                <tr>
                  <td colSpan={6} className="muted table-empty">
                    No products in local cache.
                  </td>
                </tr>
              )}
              {products.map((product) => (
                <tr key={product.id}>
                  <td className="mono-text">{product.id}</td>
                  <td>{product.product_code || "-"}</td>
                  <td>{product.name || "-"}</td>
                  <td>{product.batch_no || "-"}</td>
                  <td>{product.qr_code || "-"}</td>
                  <td>{product.updated_at || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3>Sync Logs</h3>
        <div className="trace-log-list">
          {!syncLogs.length && <p className="muted">No sync logs yet.</p>}
          {syncLogs.slice(0, 8).map((log) => (
            <p key={log.id} className={`trace-log-item trace-log-${log.level}`}>
              [{log.timestamp}] {log.message}
            </p>
          ))}
        </div>
      </section>
    </main>
  );
}
