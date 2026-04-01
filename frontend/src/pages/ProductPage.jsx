import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL, buildBagRouteUrl } from "../lib/api";
import { clearSession, getAuthHeaders, getUserRole } from "../lib/auth";
import { getCachedEmployees, saveCachedEmployees } from "../lib/employeeCache";
import { isNetworkError, parseResponse } from "../lib/network";

const PRODUCT_QUEUE_KEY = "ngo_product_registration_queue_v1";
const MAX_OFFLINE_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;

function getQueuedProducts() {
  try {
    const rawQueue = window.localStorage.getItem(PRODUCT_QUEUE_KEY);
    if (!rawQueue) {
      return [];
    }

    const parsedQueue = JSON.parse(rawQueue);
    return Array.isArray(parsedQueue) ? parsedQueue : [];
  } catch (error) {
    return [];
  }
}

function saveQueuedProducts(queue) {
  window.localStorage.setItem(PRODUCT_QUEUE_KEY, JSON.stringify(queue));
}

function getQueuedProductCount() {
  return getQueuedProducts().length;
}

function queueProductForSync(productItem) {
  const queue = getQueuedProducts();
  queue.push(productItem);
  saveQueuedProducts(queue);
  return queue.length;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(String(reader.result || ""));
    };

    reader.onerror = () => {
      reject(new Error("Could not cache product image for offline sync."));
    };

    reader.readAsDataURL(file);
  });
}

function dataUrlToBlob(dataUrl) {
  return fetch(dataUrl).then((response) => response.blob());
}

async function buildOfflineProductItem(payload, selectedImageFile) {
  const queuedItem = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    payload: {
      employee_ids: payload.employee_ids.slice(),
      product_name: payload.product_name,
      material_used: payload.material_used
    },
    image_name: "",
    image_data_url: "",
    queued_at: new Date().toISOString()
  };

  if (!selectedImageFile) {
    return queuedItem;
  }

  if (selectedImageFile.size > MAX_OFFLINE_IMAGE_SIZE_BYTES) {
    throw new Error("Offline image must be <= 2MB to fit device storage.");
  }

  queuedItem.image_name = selectedImageFile.name || "product-image.jpg";
  queuedItem.image_data_url = await fileToDataUrl(selectedImageFile);
  return queuedItem;
}

function buildProductFormData(payload, selectedImageFile) {
  const formData = new FormData();
  payload.employee_ids.forEach((employeeId) => {
    formData.append("employee_ids", employeeId);
  });
  formData.append("product_name", payload.product_name);
  formData.append("material_used", payload.material_used);

  if (selectedImageFile) {
    formData.append("product_image", selectedImageFile);
  }

  return formData;
}

async function buildFormDataFromQueuedProduct(queuedItem) {
  const payload = queuedItem.payload || {};
  const employeeIds = Array.isArray(payload.employee_ids) ? payload.employee_ids : [];
  const formData = new FormData();

  employeeIds.forEach((employeeId) => {
    formData.append("employee_ids", employeeId);
  });
  formData.append("product_name", String(payload.product_name || "").trim());
  formData.append("material_used", String(payload.material_used || "").trim());

  if (queuedItem.image_data_url) {
    const imageBlob = await dataUrlToBlob(queuedItem.image_data_url);
    formData.append("product_image", imageBlob, queuedItem.image_name || "product-image.jpg");
  }

  return formData;
}

function buildProductQueueStatusMessage(syncedCount, remainingCount) {
  const details = [`${syncedCount} synced`];
  if (remainingCount > 0) {
    details.push(`${remainingCount} pending`);
  }
  return `Offline product sync: ${details.join(" | ")}`;
}

function supportsRealCamera() {
  return Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

function getCameraOpenErrorMessage(error) {
  if (!window.isSecureContext) {
    return "Camera requires HTTPS (or localhost). Open this page in secure mode to use live camera.";
  }

  const errorName = error?.name || "";

  if (errorName === "NotAllowedError") {
    return "Camera permission denied. Allow camera access in browser settings and retry.";
  }

  if (errorName === "NotFoundError") {
    return "No camera device found on this device.";
  }

  if (errorName === "NotReadableError") {
    return "Camera is busy in another app/tab. Close other apps using camera and retry.";
  }

  if (errorName === "SecurityError") {
    return "Browser blocked camera access for this page.";
  }

  return "Unable to open camera. Use fallback upload.";
}

async function requestCameraStream() {
  const constraintsList = [
    {
      video: {
        facingMode: {
          ideal: "environment"
        }
      },
      audio: false
    },
    {
      video: true,
      audio: false
    }
  ];

  let lastError = null;
  for (let index = 0; index < constraintsList.length; index += 1) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraintsList[index]);
    } catch (error) {
      lastError = error;
      if (error && (error.name === "NotAllowedError" || error.name === "SecurityError")) {
        break;
      }
    }
  }

  throw lastError || new Error("Camera request failed");
}

export default function ProductPage() {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]);
  const [productName, setProductName] = useState("");
  const [materialUsed, setMaterialUsed] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState("");
  const [qrInfo, setQrInfo] = useState(null);
  const [imageSource, setImageSource] = useState("gallery");
  const [galleryFile, setGalleryFile] = useState(null);
  const [cameraFallbackFile, setCameraFallbackFile] = useState(null);
  const [capturedCameraFile, setCapturedCameraFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [cameraFallbackVisible, setCameraFallbackVisible] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const userRole = getUserRole();

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const syncInProgressRef = useRef(false);

  const selectedImageFile = useMemo(() => {
    if (imageSource === "camera") {
      return capturedCameraFile || cameraFallbackFile || null;
    }
    return galleryFile || null;
  }, [cameraFallbackFile, capturedCameraFile, galleryFile, imageSource]);

  const setStatus = useCallback((message, type = "") => {
    setStatusMessage(message);
    setStatusType(type);
  }, []);

  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }

    setIsCameraReady(false);
  }, []);

  const submitProduct = useCallback(async (formData) => {
    const response = await fetch(`${API_BASE_URL}/create-bag`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: formData
    });
    return parseResponse(response);
  }, []);

  const loadEmployees = useCallback(async () => {
    setStatus("Loading employees...", "info");

    try {
      const response = await fetch(`${API_BASE_URL}/employees`, {
        headers: getAuthHeaders()
      });
      const data = await parseResponse(response);
      setEmployees(data);
      saveCachedEmployees(data);

      if (!data.length) {
        setStatus("No employees found. Please add employees first.", "warning");
        return;
      }

      setStatus("Select one or more employees and create product.", "info");
    } catch (error) {
      if (isNetworkError(error)) {
        const cachedEmployees = getCachedEmployees();
        if (cachedEmployees.length) {
          setEmployees(cachedEmployees);
          setStatus(
            `Offline mode: showing ${cachedEmployees.length} cached employee(s).`,
            "warning"
          );
          return;
        }

        setStatus("Offline mode: employee list unavailable.", "warning");
        return;
      }

      setStatus(error.message, "error");
    }
  }, [setStatus]);

  const syncQueuedProducts = useCallback(
    async (showStatusMessage) => {
      if (syncInProgressRef.current || !navigator.onLine) {
        return;
      }

      const queue = getQueuedProducts();
      if (!queue.length) {
        return;
      }

      syncInProgressRef.current = true;

      if (showStatusMessage) {
        setStatus(`Syncing ${queue.length} queued product registration(s)...`, "info");
      }

      const remainingQueue = [];
      let syncedCount = 0;

      try {
        for (let index = 0; index < queue.length; index += 1) {
          const queuedItem = queue[index];

          try {
            const formData = await buildFormDataFromQueuedProduct(queuedItem);
            await submitProduct(formData);
            syncedCount += 1;
          } catch (error) {
            remainingQueue.push(queuedItem);

            if (isNetworkError(error)) {
              remainingQueue.push(...queue.slice(index + 1));
              break;
            }
          }
        }
      } finally {
        saveQueuedProducts(remainingQueue);
        syncInProgressRef.current = false;
      }

      if (showStatusMessage || syncedCount > 0) {
        const remainingCount = remainingQueue.length;
        const nextStatusType = remainingCount ? "warning" : "success";
        setStatus(buildProductQueueStatusMessage(syncedCount, remainingCount), nextStatusType);
      }
    },
    [setStatus, submitProduct]
  );

  const startCameraStream = useCallback(async () => {
    if (imageSource !== "camera") {
      return;
    }

    if (streamRef.current) {
      return;
    }

    if (!supportsRealCamera()) {
      setCameraFallbackVisible(true);
      setStatus("Real camera is not supported here. Use HTTPS/localhost or fallback upload.", "warning");
      return;
    }

    if (!window.isSecureContext) {
      setCameraFallbackVisible(true);
      setStatus("Camera requires HTTPS (or localhost). Use fallback upload or open secure URL.", "warning");
      return;
    }

    try {
      setStatus("Requesting real camera access...", "info");
      const stream = await requestCameraStream();

      if (imageSource !== "camera") {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => null);
      }

      setCameraFallbackVisible(false);
      setIsCameraReady(true);
      setStatus("Camera is ready. Click Capture Photo.", "info");
    } catch (error) {
      setCameraFallbackVisible(true);
      setIsCameraReady(false);
      setStatus(getCameraOpenErrorMessage(error), "warning");
    }
  }, [imageSource, setStatus]);

  const captureCameraPhoto = useCallback(async () => {
    if (!streamRef.current) {
      await startCameraStream();
      return;
    }

    const video = videoRef.current;
    if (!video) {
      setStatus("Could not capture photo from camera.", "error");
      return;
    }

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      setStatus("Could not capture photo from camera.", "error");
      return;
    }

    context.drawImage(video, 0, 0, width, height);

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.92);
    });

    if (!blob) {
      setStatus("Could not capture photo from camera.", "error");
      return;
    }

    const file = new File([blob], `camera-photo-${Date.now()}.jpg`, {
      type: "image/jpeg"
    });

    setCapturedCameraFile(file);
    setCameraFallbackFile(null);
    stopCameraStream();
    setStatus("Photo captured from real camera.", "success");
  }, [setStatus, startCameraStream, stopCameraStream]);

  const handleRetakeCamera = useCallback(() => {
    setCapturedCameraFile(null);
    setCameraFallbackFile(null);
    startCameraStream();
  }, [startCameraStream]);

  const queueCurrentProduct = useCallback(async (payload, selectedFile) => {
    const queuedItem = await buildOfflineProductItem(payload, selectedFile);
    return queueProductForSync(queuedItem);
  }, []);

  function resetFormState() {
    setSelectedEmployeeIds([]);
    setProductName("");
    setMaterialUsed("");
    setGalleryFile(null);
    setCameraFallbackFile(null);
    setCapturedCameraFile(null);
    setCameraFallbackVisible(false);
    stopCameraStream();
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const payload = {
      employee_ids: selectedEmployeeIds.filter(Boolean),
      product_name: productName.trim(),
      material_used: materialUsed.trim()
    };

    if (!payload.employee_ids.length || !payload.product_name || !payload.material_used) {
      setStatus("Please select employees and fill bag name and material.", "error");
      return;
    }

    if (!navigator.onLine) {
      try {
        const pendingCount = await queueCurrentProduct(payload, selectedImageFile);
        setStatus(
          `No internet. Product saved offline and queued (${pendingCount} pending).`,
          "warning"
        );
        resetFormState();
        setQrInfo(null);
      } catch (error) {
        setStatus(error.message || "Unable to save offline product registration.", "error");
      }
      return;
    }

    const formData = buildProductFormData(payload, selectedImageFile);
    setStatus("Creating product...", "info");
    setQrInfo(null);

    try {
      const data = await submitProduct(formData);
      const bagUrl = data.bag?.id ? buildBagRouteUrl(data.bag.id) : data.bag_url || "#";
      setQrInfo({
        qrCodeUrl: data.qr_code_url,
        bagUrl
      });
      setStatus("Product registered. QR generated.", "success");
      resetFormState();
    } catch (error) {
      if (isNetworkError(error)) {
        try {
          const pendingCount = await queueCurrentProduct(payload, selectedImageFile);
          setStatus(
            `Connection lost. Product saved offline and queued (${pendingCount} pending).`,
            "warning"
          );
          resetFormState();
        } catch (queueError) {
          setStatus(queueError.message || "Unable to queue offline product registration.", "error");
        }
        return;
      }

      setStatus(error.message, "error");
    }
  }

  useEffect(() => {
    loadEmployees();
    syncQueuedProducts(false);
  }, [loadEmployees, syncQueuedProducts]);

  useEffect(() => {
    const handleOnline = () => {
      syncQueuedProducts(true);
    };

    const handleOffline = () => {
      const pendingCount = getQueuedProductCount();
      if (pendingCount) {
        setStatus(
          `Offline mode: ${pendingCount} product registration(s) waiting to sync.`,
          "warning"
        );
        return;
      }
      setStatus("Offline mode enabled. New product registrations will be queued.", "warning");
    };

    const handleBeforeUnload = () => {
      stopCameraStream();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [setStatus, stopCameraStream, syncQueuedProducts]);

  useEffect(() => {
    if (imageSource === "camera") {
      setGalleryFile(null);
      startCameraStream();
      return;
    }

    setCameraFallbackFile(null);
    setCapturedCameraFile(null);
    setCameraFallbackVisible(false);
    stopCameraStream();
  }, [imageSource, startCameraStream, stopCameraStream]);

  useEffect(() => {
    if (!selectedImageFile) {
      setPreviewUrl("");
      return;
    }

    const objectUrl = URL.createObjectURL(selectedImageFile);
    setPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [selectedImageFile]);

  useEffect(() => () => stopCameraStream(), [stopCameraStream]);

  function handleBackAction() {
    if (userRole === "admin") {
      navigate("/admin");
      return;
    }

    clearSession();
    navigate("/login", { replace: true });
  }

  return (
    <main className="page">
      <section className="card">
        <button type="button" className="secondary small" onClick={handleBackAction}>
          {userRole === "admin" ? "Back to Dashboard" : "Logout"}
        </button>

        <h1>Product Registration</h1>
        <p className="subtitle">
          <em>Create a bag and generate an impact QR code</em>
        </p>

        <form className="stack" onSubmit={handleSubmit}>
          <label htmlFor="employeeSelect">Select Employee(s)</label>
          <select
            id="employeeSelect"
            required
            multiple
            size={6}
            value={selectedEmployeeIds}
            onChange={(event) => {
              const values = Array.from(event.target.selectedOptions || []).map(
                (option) => option.value
              );
              setSelectedEmployeeIds(values);
            }}
          >
            {!employees.length && <option value="">No employees found</option>}
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
          <p className="muted helper-text">Select one or more employees who made this bag.</p>

          <label htmlFor="productName">Bag Name</label>
          <input
            id="productName"
            type="text"
            placeholder="Eco Tote, Daily Carry, Travel Sling..."
            value={productName}
            onChange={(event) => setProductName(event.target.value)}
            required
          />

          <label htmlFor="materialUsed">Material Used</label>
          <input
            id="materialUsed"
            type="text"
            placeholder="Cotton, Jute, Denim..."
            value={materialUsed}
            onChange={(event) => setMaterialUsed(event.target.value)}
            required
          />

          <p className="input-source-title">Product Image Source</p>
          <div className="input-choice-group" role="radiogroup" aria-label="Product image source">
            <label className="choice-option">
              <input
                type="radio"
                name="productImageSource"
                value="gallery"
                checked={imageSource === "gallery"}
                onChange={() => setImageSource("gallery")}
              />
              <span>Local Storage</span>
            </label>
            <label className="choice-option">
              <input
                type="radio"
                name="productImageSource"
                value="camera"
                checked={imageSource === "camera"}
                onChange={() => setImageSource("camera")}
              />
              <span>Camera</span>
            </label>
          </div>

          {imageSource === "gallery" && (
            <div id="galleryInputGroup">
              <label htmlFor="productImageGallery">Upload Product Image (Local Storage)</label>
              <input
                id="productImageGallery"
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  setGalleryFile(file);
                }}
              />
            </div>
          )}

          {imageSource === "camera" && (
            <div id="cameraInputGroup">
              <p className="muted helper-text camera-help">
                Allow camera access to capture a live photo.
              </p>
              <div className="camera-actions">
                <button
                  id="openCameraBtn"
                  type="button"
                  className={`secondary${isCameraReady ? " hidden" : ""}`}
                  onClick={startCameraStream}
                >
                  Start Camera
                </button>
                <button
                  id="captureCameraBtn"
                  type="button"
                  className={`secondary${isCameraReady ? "" : " hidden"}`}
                  onClick={captureCameraPhoto}
                >
                  Capture Photo
                </button>
                <button
                  id="retakeCameraBtn"
                  type="button"
                  className={`secondary${
                    capturedCameraFile || cameraFallbackFile ? "" : " hidden"
                  }`}
                  onClick={handleRetakeCamera}
                >
                  Retake
                </button>
              </div>

              <video
                id="liveCameraPreview"
                ref={videoRef}
                className={`camera-preview${isCameraReady ? "" : " hidden"}`}
                autoPlay
                playsInline
                muted
              />

              <div id="cameraFallbackGroup" className={cameraFallbackVisible ? "" : "hidden"}>
                <label htmlFor="productImageCamera">Camera Upload (Fallback)</label>
                <input
                  id="productImageCamera"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    setCameraFallbackFile(file);
                    setCapturedCameraFile(null);
                    stopCameraStream();
                  }}
                />
              </div>
            </div>
          )}

          <img
            id="productImagePreview"
            className={`product-image-preview${previewUrl ? "" : " hidden"}`}
            src={previewUrl || undefined}
            alt="Selected product preview"
          />

          <button type="submit">Generate QR</button>
        </form>

        <p className={`status${statusType ? ` status-${statusType}` : ""}`}>{statusMessage}</p>

        <div className={`qr-section${qrInfo ? " is-visible" : " hidden"}`}>
          <p className="qr-title">Your Impact QR Is Ready</p>
          <p className="qr-tagline">
            <em>Each scan helps share the maker&apos;s story and mission.</em>
          </p>

          <div className="qr-frame">
            <span className="qr-orbit qr-orbit-one" aria-hidden="true"></span>
            <span className="qr-orbit qr-orbit-two" aria-hidden="true"></span>
            <img id="qrImage" alt="Generated QR code" src={qrInfo?.qrCodeUrl || undefined} />
          </div>

          <a id="bagLink" href={qrInfo?.bagUrl || "#"} target="_blank" rel="noopener noreferrer">
            Open Bag Details Page
          </a>
        </div>
      </section>
    </main>
  );
}
