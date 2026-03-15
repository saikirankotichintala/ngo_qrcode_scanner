const API_BASE_URL = (window.NGO_CONFIG && window.NGO_CONFIG.API_BASE_URL) || "http://127.0.0.1:5000";
const PRODUCT_QUEUE_KEY = "ngo_product_registration_queue_v1";
const MAX_OFFLINE_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;

let productForm;
let employeeSelect;
let statusMsg;
let qrSection;
let qrImage;
let bagLink;
let productImageGalleryInput;
let productImageCameraInput;
let productImagePreview;
let sourceLocalStorageRadio;
let sourceCameraRadio;
let galleryInputGroup;
let cameraInputGroup;
let cameraFallbackGroup;
let openCameraBtn;
let captureCameraBtn;
let retakeCameraBtn;
let liveCameraPreview;
let userRole = "";
let previewObjectUrl = "";
let isProductSyncInProgress = false;
let activeCameraStream = null;
let capturedCameraFile = null;

function setStatus(message, type) {
    statusMsg.textContent = message;
    statusMsg.className = "status";

    if (type) {
        statusMsg.classList.add("status-" + type);
    }
}

function getUserRole() {
    return (localStorage.getItem("ngo_role") || "").trim().toLowerCase();
}

function getAuthHeaders(extraHeaders) {
    const headers = Object.assign({}, extraHeaders || {});
    if (userRole) {
        headers["X-User-Role"] = userRole;
    }
    return headers;
}

async function parseResponse(response) {
    const data = await response.json().catch(function () {
        return {};
    });

    if (!response.ok) {
        const error = new Error(data.error || "Request failed");
        error.status = response.status;
        throw error;
    }

    return data;
}

function isNetworkError(error) {
    const message = String((error && error.message) || "").toLowerCase();
    const hasHttpStatus = typeof (error && error.status) === "number" && error.status > 0;
    if (hasHttpStatus) {
        return false;
    }

    return (
        message.indexOf("failed to fetch") !== -1 ||
        message.indexOf("networkerror") !== -1 ||
        message.indexOf("load failed") !== -1
    );
}

function getQueuedProducts() {
    try {
        const rawQueue = localStorage.getItem(PRODUCT_QUEUE_KEY);
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
    localStorage.setItem(PRODUCT_QUEUE_KEY, JSON.stringify(queue));
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
    return new Promise(function (resolve, reject) {
        const reader = new FileReader();

        reader.onload = function () {
            resolve(String(reader.result || ""));
        };

        reader.onerror = function () {
            reject(new Error("Could not cache product image for offline sync."));
        };

        reader.readAsDataURL(file);
    });
}

function dataUrlToBlob(dataUrl) {
    return fetch(dataUrl).then(function (response) {
        return response.blob();
    });
}

async function buildOfflineProductItem(payload, selectedImageFile) {
    const queuedItem = {
        id: String(Date.now()) + "-" + Math.random().toString(16).slice(2),
        payload: {
            employee_ids: payload.employee_ids.slice(),
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
    payload.employee_ids.forEach(function (employeeId) {
        formData.append("employee_ids", employeeId);
    });
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

    employeeIds.forEach(function (employeeId) {
        formData.append("employee_ids", employeeId);
    });
    formData.append("material_used", String(payload.material_used || "").trim());

    if (queuedItem.image_data_url) {
        const imageBlob = await dataUrlToBlob(queuedItem.image_data_url);
        formData.append("product_image", imageBlob, queuedItem.image_name || "product-image.jpg");
    }

    return formData;
}

async function submitProduct(formData) {
    const response = await fetch(API_BASE_URL + "/create-bag", {
        method: "POST",
        headers: getAuthHeaders(),
        body: formData
    });
    return parseResponse(response);
}

function buildProductQueueStatusMessage(syncedCount, remainingCount) {
    const details = [String(syncedCount) + " synced"];
    if (remainingCount > 0) {
        details.push(String(remainingCount) + " pending");
    }
    return "Offline product sync: " + details.join(" | ");
}

async function queueCurrentProduct(payload, selectedImageFile) {
    const queuedItem = await buildOfflineProductItem(payload, selectedImageFile);
    return queueProductForSync(queuedItem);
}

async function syncQueuedProducts(showStatusMessage) {
    if (isProductSyncInProgress || !navigator.onLine) {
        return;
    }

    const queue = getQueuedProducts();
    if (!queue.length) {
        return;
    }

    isProductSyncInProgress = true;

    if (showStatusMessage) {
        setStatus("Syncing " + queue.length + " queued product registration(s)...", "info");
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
                    Array.prototype.push.apply(remainingQueue, queue.slice(index + 1));
                    break;
                }
            }
        }
    } finally {
        saveQueuedProducts(remainingQueue);
        isProductSyncInProgress = false;
    }

    if (showStatusMessage || syncedCount > 0) {
        const remainingCount = remainingQueue.length;
        const statusType = remainingCount ? "warning" : "success";
        setStatus(buildProductQueueStatusMessage(syncedCount, remainingCount), statusType);
    }
}

function resetQrPreview() {
    qrSection.classList.remove("is-visible");
    qrSection.classList.add("hidden");
    qrImage.removeAttribute("src");
    bagLink.setAttribute("href", "#");
}

function renderEmployeeOptions(employees) {
    employeeSelect.innerHTML = "";

    if (!employees.length) {
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "No employees found";
        placeholder.disabled = true;
        employeeSelect.appendChild(placeholder);
        return;
    }

    employees.forEach(function (employee) {
        const option = document.createElement("option");
        option.value = employee.id;
        option.textContent = employee.name;
        employeeSelect.appendChild(option);
    });
}

async function loadEmployees() {
    setStatus("Loading employees...", "info");

    try {
        const response = await fetch(API_BASE_URL + "/employees", {
            headers: getAuthHeaders()
        });
        const employees = await parseResponse(response);
        renderEmployeeOptions(employees);

        if (!employees.length) {
            setStatus("No employees found. Please add employees first.", "warning");
            return;
        }

        setStatus("Select one or more employees and create product.", "info");
    } catch (error) {
        if (isNetworkError(error)) {
            setStatus("Offline mode: employee list unavailable.", "warning");
            return;
        }

        setStatus(error.message, "error");
    }
}

function getSelectedImageFile() {
    const selectedSource = getSelectedImageSource();
    const cameraFile = productImageCameraInput.files && productImageCameraInput.files[0];
    const galleryFile = productImageGalleryInput.files && productImageGalleryInput.files[0];

    if (selectedSource === "camera") {
        return capturedCameraFile || cameraFile || null;
    }

    return galleryFile || null;
}

function getSelectedImageSource() {
    if (sourceCameraRadio && sourceCameraRadio.checked) {
        return "camera";
    }
    return "gallery";
}

function supportsRealCamera() {
    return Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

function getCameraOpenErrorMessage(error) {
    if (!window.isSecureContext) {
        return "Camera requires HTTPS (or localhost). Open this page in secure mode to use live camera.";
    }

    const errorName = (error && error.name) || "";

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

            // Permission or security failures won't succeed on retry.
            if (error && (error.name === "NotAllowedError" || error.name === "SecurityError")) {
                break;
            }
        }
    }

    throw lastError || new Error("Camera request failed");
}

function hideCameraFallback() {
    cameraFallbackGroup.classList.add("hidden");
}

function showCameraFallback() {
    cameraFallbackGroup.classList.remove("hidden");
}

function stopCameraStream() {
    if (activeCameraStream) {
        activeCameraStream.getTracks().forEach(function (track) {
            track.stop();
        });
        activeCameraStream = null;
    }

    if (liveCameraPreview) {
        liveCameraPreview.pause();
        liveCameraPreview.srcObject = null;
    }
}

function resetLiveCameraUi() {
    liveCameraPreview.classList.add("hidden");
    captureCameraBtn.classList.add("hidden");
    openCameraBtn.classList.remove("hidden");

    if (!capturedCameraFile) {
        retakeCameraBtn.classList.add("hidden");
    }
}

function clearCameraSelection() {
    capturedCameraFile = null;
    productImageCameraInput.value = "";
    retakeCameraBtn.classList.add("hidden");
}

async function startCameraStream() {
    if (!sourceCameraRadio.checked) {
        return;
    }

    if (activeCameraStream) {
        return;
    }

    if (!supportsRealCamera()) {
        showCameraFallback();
        setStatus("Real camera is not supported here. Use HTTPS/localhost or fallback upload.", "warning");
        return;
    }

    if (!window.isSecureContext) {
        showCameraFallback();
        setStatus("Camera requires HTTPS (or localhost). Use fallback upload or open secure URL.", "warning");
        return;
    }

    try {
        setStatus("Requesting real camera access...", "info");
        const stream = await requestCameraStream();

        if (!sourceCameraRadio.checked) {
            stream.getTracks().forEach(function (track) {
                track.stop();
            });
            return;
        }

        activeCameraStream = stream;
        liveCameraPreview.srcObject = stream;
        hideCameraFallback();
        liveCameraPreview.classList.remove("hidden");
        openCameraBtn.classList.add("hidden");
        captureCameraBtn.classList.remove("hidden");
        retakeCameraBtn.classList.add("hidden");

        await liveCameraPreview.play().catch(function () {
            return null;
        });

        setStatus("Camera is ready. Click Capture Photo.", "info");
    } catch (error) {
        resetLiveCameraUi();
        showCameraFallback();
        setStatus(getCameraOpenErrorMessage(error), "warning");
    }
}

async function captureCameraPhoto() {
    if (!activeCameraStream) {
        await startCameraStream();
        return;
    }

    const width = liveCameraPreview.videoWidth || 1280;
    const height = liveCameraPreview.videoHeight || 720;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
        setStatus("Could not capture photo from camera.", "error");
        return;
    }

    context.drawImage(liveCameraPreview, 0, 0, width, height);

    const blob = await new Promise(function (resolve) {
        canvas.toBlob(resolve, "image/jpeg", 0.92);
    });

    if (!blob) {
        setStatus("Could not capture photo from camera.", "error");
        return;
    }

    capturedCameraFile = new File([blob], "camera-photo-" + Date.now() + ".jpg", {
        type: "image/jpeg"
    });
    productImageCameraInput.value = "";

    stopCameraStream();
    resetLiveCameraUi();
    retakeCameraBtn.classList.remove("hidden");
    renderImagePreview();
    setStatus("Photo captured from real camera.", "success");
}

function handleRetakeCamera() {
    clearCameraSelection();
    renderImagePreview();
    startCameraStream();
}

function updateImageSourceVisibility() {
    const selectedSource = getSelectedImageSource();

    if (selectedSource === "camera") {
        galleryInputGroup.classList.add("hidden");
        cameraInputGroup.classList.remove("hidden");
        productImageGalleryInput.value = "";
        startCameraStream();
    } else {
        cameraInputGroup.classList.add("hidden");
        galleryInputGroup.classList.remove("hidden");
        clearCameraSelection();
        stopCameraStream();
        resetLiveCameraUi();
        hideCameraFallback();
    }

    renderImagePreview();
}

function clearPreviewObjectUrl() {
    if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl);
        previewObjectUrl = "";
    }
}

function renderImagePreview() {
    const selectedFile = getSelectedImageFile();

    clearPreviewObjectUrl();
    if (!selectedFile) {
        productImagePreview.classList.add("hidden");
        productImagePreview.removeAttribute("src");
        return;
    }

    previewObjectUrl = URL.createObjectURL(selectedFile);
    productImagePreview.src = previewObjectUrl;
    productImagePreview.classList.remove("hidden");
}

function handleGalleryImageChange() {
    if (productImageGalleryInput.files && productImageGalleryInput.files.length) {
        productImageCameraInput.value = "";
    }
    renderImagePreview();
}

function handleCameraImageChange() {
    if (productImageCameraInput.files && productImageCameraInput.files.length) {
        capturedCameraFile = null;
        productImageGalleryInput.value = "";
        stopCameraStream();
        resetLiveCameraUi();
        retakeCameraBtn.classList.remove("hidden");
    }
    renderImagePreview();
}

function clearImageInputs() {
    productImageGalleryInput.value = "";
    productImageCameraInput.value = "";
    clearCameraSelection();
    stopCameraStream();
    resetLiveCameraUi();
    hideCameraFallback();
    renderImagePreview();
}

function getProductPayload() {
    const selectedOptions = Array.from(employeeSelect.selectedOptions || []);
    const employeeIds = selectedOptions
        .map(function (option) {
            return (option.value || "").trim();
        })
        .filter(function (value) {
            return Boolean(value);
        });

    return {
        employee_ids: employeeIds,
        material_used: document.getElementById("materialUsed").value.trim()
    };
}

function showQrPreview(data) {
    qrImage.src = data.qr_code_url;

    if (data.bag && data.bag.id) {
        bagLink.href = "bag.html?id=" + encodeURIComponent(data.bag.id);
    } else {
        bagLink.href = data.bag_url || "#";
    }

    qrSection.classList.remove("hidden");
    qrSection.classList.remove("is-visible");
    void qrSection.offsetWidth;
    qrSection.classList.add("is-visible");
}

async function handleProductSubmit(event) {
    event.preventDefault();

    const payload = getProductPayload();
    const selectedImageFile = getSelectedImageFile();

    if (!payload.employee_ids.length || !payload.material_used) {
        setStatus("Please select at least one employee and material.", "error");
        return;
    }

    if (!navigator.onLine) {
        try {
            const pendingCount = await queueCurrentProduct(payload, selectedImageFile);
            setStatus(
                "No internet. Product saved offline and queued (" + pendingCount + " pending).",
                "warning"
            );
            productForm.reset();
            clearImageInputs();
            updateImageSourceVisibility();
            resetQrPreview();
        } catch (error) {
            setStatus(error.message || "Unable to save offline product registration.", "error");
        }
        return;
    }

    const formData = buildProductFormData(payload, selectedImageFile);

    setStatus("Creating product...", "info");
    resetQrPreview();

    try {
        const data = await submitProduct(formData);
        showQrPreview(data);
        setStatus("Product registered. QR generated.", "success");

        productForm.reset();
        clearImageInputs();
        updateImageSourceVisibility();
    } catch (error) {
        if (isNetworkError(error)) {
            try {
                const pendingCount = await queueCurrentProduct(payload, selectedImageFile);
                setStatus(
                    "Connection lost. Product saved offline and queued (" + pendingCount + " pending).",
                    "warning"
                );
                productForm.reset();
                clearImageInputs();
                updateImageSourceVisibility();
            } catch (queueError) {
                setStatus(queueError.message || "Unable to queue offline product registration.", "error");
            }
            return;
        }

        setStatus(error.message, "error");
    }
}

function goBackToAdmin() {
    window.location.href = "admin.html";
}

document.addEventListener("DOMContentLoaded", function () {
    userRole = getUserRole();

    productForm = document.getElementById("productForm");
    employeeSelect = document.getElementById("employeeSelect");
    statusMsg = document.getElementById("statusMsg");
    qrSection = document.getElementById("qrSection");
    qrImage = document.getElementById("qrImage");
    bagLink = document.getElementById("bagLink");
    productImageGalleryInput = document.getElementById("productImageGallery");
    productImageCameraInput = document.getElementById("productImageCamera");
    productImagePreview = document.getElementById("productImagePreview");
    sourceLocalStorageRadio = document.getElementById("sourceLocalStorage");
    sourceCameraRadio = document.getElementById("sourceCamera");
    galleryInputGroup = document.getElementById("galleryInputGroup");
    cameraInputGroup = document.getElementById("cameraInputGroup");
    cameraFallbackGroup = document.getElementById("cameraFallbackGroup");
    openCameraBtn = document.getElementById("openCameraBtn");
    captureCameraBtn = document.getElementById("captureCameraBtn");
    retakeCameraBtn = document.getElementById("retakeCameraBtn");
    liveCameraPreview = document.getElementById("liveCameraPreview");

    document.getElementById("backToAdmin").addEventListener("click", goBackToAdmin);
    productForm.addEventListener("submit", handleProductSubmit);
    productImageGalleryInput.addEventListener("change", handleGalleryImageChange);
    productImageCameraInput.addEventListener("change", handleCameraImageChange);
    sourceLocalStorageRadio.addEventListener("change", updateImageSourceVisibility);
    sourceCameraRadio.addEventListener("change", updateImageSourceVisibility);
    openCameraBtn.addEventListener("click", startCameraStream);
    captureCameraBtn.addEventListener("click", captureCameraPhoto);
    retakeCameraBtn.addEventListener("click", handleRetakeCamera);

    window.addEventListener("online", function () {
        syncQueuedProducts(true);
    });

    window.addEventListener("offline", function () {
        const pendingCount = getQueuedProductCount();
        if (pendingCount) {
            setStatus(
                "Offline mode: " + pendingCount + " product registration(s) waiting to sync.",
                "warning"
            );
            return;
        }
        setStatus("Offline mode enabled. New product registrations will be queued.", "warning");
    });

    window.addEventListener("beforeunload", function () {
        stopCameraStream();
    });

    resetQrPreview();
    resetLiveCameraUi();
    hideCameraFallback();
    updateImageSourceVisibility();
    loadEmployees();
    syncQueuedProducts(false);
});
