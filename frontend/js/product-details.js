const API_BASE_URL = (window.NGO_CONFIG && window.NGO_CONFIG.API_BASE_URL) || "https://ngo-qrcode-backend.onrender.com";
const PRODUCT_QUEUE_KEY = "ngo_product_registration_queue_v1";

let productTableBodyElement;
let productCountElement;
let productPendingCountElement;
let productStatusElement;
let productSearchInput;
let productFromDateInput;
let productToDateInput;
let resetProductFiltersButton;
let qrSection;
let qrImage;
let bagLink;
let userRole = "";
let allProducts = [];

function navigateTo(page) {
    window.location.href = page;
}

function getUserRole() {
    return (localStorage.getItem("ngo_role") || "").trim().toLowerCase();
}

function isAdminUser() {
    return userRole === "admin";
}

function getAuthHeaders(extraHeaders) {
    const headers = Object.assign({}, extraHeaders || {});
    if (userRole) {
        headers["X-User-Role"] = userRole;
    }
    return headers;
}

function setStatus(message, type) {
    productStatusElement.textContent = message;
    productStatusElement.className = "status";

    if (type) {
        productStatusElement.classList.add("status-" + type);
    }
}

function formatDate(isoDate) {
    if (!isoDate) {
        return "Date not available";
    }

    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) {
        return "Date not available";
    }

    return date.toLocaleDateString();
}

function getPendingQueueCount() {
    try {
        const raw = localStorage.getItem(PRODUCT_QUEUE_KEY);
        if (!raw) {
            return 0;
        }
        const queue = JSON.parse(raw);
        return Array.isArray(queue) ? queue.length : 0;
    } catch (error) {
        return 0;
    }
}

function updatePendingCount() {
    productPendingCountElement.textContent = String(getPendingQueueCount());
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

function showQrPreviewForProduct(bag) {
    if (!bag || !bag.id) {
        setStatus("QR not available for this product.", "error");
        return;
    }

    qrImage.src = API_BASE_URL + "/qr/" + encodeURIComponent(bag.id) + ".png";
    bagLink.href = "bag.html?id=" + encodeURIComponent(bag.id);

    qrSection.classList.remove("hidden");
    qrSection.classList.remove("is-visible");
    void qrSection.offsetWidth;
    qrSection.classList.add("is-visible");
    setStatus("QR loaded for selected product.", "success");
}

function createCell(text, className) {
    const td = document.createElement("td");
    td.textContent = text;
    if (className) {
        td.className = className;
    }
    return td;
}

function buildMakerNamesText(bag) {
    if (Array.isArray(bag.maker_names) && bag.maker_names.length) {
        return bag.maker_names.join(", ");
    }
    return bag.maker_name || "Unknown";
}

function createPhotoCell(bag) {
    const cell = document.createElement("td");

    if (!bag.product_image_url) {
        cell.textContent = "No image";
        cell.className = "muted";
        return cell;
    }

    const photoButton = document.createElement("button");
    photoButton.type = "button";
    photoButton.className = "photo-thumb-btn";

    const image = document.createElement("img");
    image.src = bag.product_image_url;
    image.alt = "Product image for " + (bag.id || "product");
    image.className = "table-product-photo";

    photoButton.appendChild(image);
    photoButton.addEventListener("click", function () {
        showQrPreviewForProduct(bag);
    });

    cell.appendChild(photoButton);
    return cell;
}

async function updateProductRecord(productId, formData, successMessage) {
    setStatus("Updating product...", "info");

    const response = await fetch(API_BASE_URL + "/bag/" + encodeURIComponent(productId), {
        method: "PUT",
        headers: getAuthHeaders(),
        body: formData
    });
    await parseResponse(response);
    setStatus(successMessage, "success");
    await loadProducts();
}

async function handleEditProductMaterial(bag) {
    if (!isAdminUser()) {
        setStatus("Only admin can edit products.", "error");
        return;
    }

    const editedMaterial = window.prompt(
        "Update material for product " + (bag.id || ""),
        bag.material_used || ""
    );

    if (editedMaterial === null) {
        return;
    }

    const materialUsed = editedMaterial.trim();
    if (!materialUsed) {
        setStatus("Material cannot be empty.", "error");
        return;
    }

    try {
        const formData = new FormData();
        formData.append("material_used", materialUsed);
        await updateProductRecord(bag.id, formData, "Product material updated.");
    } catch (error) {
        setStatus(error.message, "error");
    }
}

function handleEditProductPhoto(bag) {
    if (!isAdminUser()) {
        setStatus("Only admin can edit products.", "error");
        return;
    }

    const imagePicker = document.createElement("input");
    imagePicker.type = "file";
    imagePicker.accept = "image/*";

    imagePicker.addEventListener("change", async function () {
        const selectedFile = imagePicker.files && imagePicker.files[0];
        if (!selectedFile) {
            return;
        }

        try {
            const formData = new FormData();
            formData.append("product_image", selectedFile);
            await updateProductRecord(bag.id, formData, "Product photo updated.");
        } catch (error) {
            setStatus(error.message, "error");
        }
    });

    imagePicker.click();
}

async function handleDeleteProduct(bag) {
    if (!isAdminUser()) {
        setStatus("Only admin can delete products.", "error");
        return;
    }

    const isConfirmed = window.confirm("Delete product " + (bag.id || "-") + "?");
    if (!isConfirmed) {
        return;
    }

    setStatus("Deleting product...", "info");

    try {
        const response = await fetch(API_BASE_URL + "/bag/" + encodeURIComponent(bag.id), {
            method: "DELETE",
            headers: getAuthHeaders()
        });

        await parseResponse(response);
        setStatus("Product deleted.", "success");
        await loadProducts();
    } catch (error) {
        setStatus(error.message, "error");
    }
}

function createActionCell(bag) {
    const actionCell = document.createElement("td");
    const actionWrap = document.createElement("div");
    actionWrap.className = "table-actions";

    const editMaterialButton = document.createElement("button");
    editMaterialButton.type = "button";
    editMaterialButton.className = "secondary action-btn";
    editMaterialButton.textContent = "Edit Material";
    editMaterialButton.disabled = !isAdminUser();
    editMaterialButton.addEventListener("click", function () {
        handleEditProductMaterial(bag);
    });

    const editPhotoButton = document.createElement("button");
    editPhotoButton.type = "button";
    editPhotoButton.className = "secondary action-btn";
    editPhotoButton.textContent = "Edit Photo";
    editPhotoButton.disabled = !isAdminUser();
    editPhotoButton.addEventListener("click", function () {
        handleEditProductPhoto(bag);
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "danger action-btn";
    deleteButton.textContent = "Delete";
    deleteButton.disabled = !isAdminUser();
    deleteButton.addEventListener("click", function () {
        handleDeleteProduct(bag);
    });

    actionWrap.appendChild(editMaterialButton);
    actionWrap.appendChild(editPhotoButton);
    actionWrap.appendChild(deleteButton);
    actionCell.appendChild(actionWrap);
    return actionCell;
}

function renderEmptyProducts() {
    productTableBodyElement.innerHTML = "";
    productCountElement.textContent = "0";

    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.className = "muted table-empty";
    cell.textContent = "No products matched this filter.";
    row.appendChild(cell);
    productTableBodyElement.appendChild(row);
}

function renderProducts(products) {
    productTableBodyElement.innerHTML = "";

    if (!products.length) {
        renderEmptyProducts();
        return;
    }

    products.forEach(function (bag) {
        const row = document.createElement("tr");

        row.appendChild(createPhotoCell(bag));
        row.appendChild(createCell(bag.id || "-", "mono-text"));
        row.appendChild(createCell(buildMakerNamesText(bag)));
        row.appendChild(createCell(bag.material_used || "-"));
        row.appendChild(createCell(formatDate(bag.created_at)));
        row.appendChild(createActionCell(bag));
        productTableBodyElement.appendChild(row);
    });

    productCountElement.textContent = String(products.length);
}

function parseDateInputBoundary(dateText, endOfDay) {
    if (!dateText) {
        return null;
    }

    const date = new Date(dateText + (endOfDay ? "T23:59:59.999" : "T00:00:00.000"));
    if (Number.isNaN(date.getTime())) {
        return null;
    }
    return date;
}

function matchesProductFilters(product) {
    const searchQuery = (productSearchInput.value || "").trim().toLowerCase();
    const fromBoundary = parseDateInputBoundary(productFromDateInput.value, false);
    const toBoundary = parseDateInputBoundary(productToDateInput.value, true);
    const createdAt = new Date(product.created_at || "");
    const hasValidCreatedAt = !Number.isNaN(createdAt.getTime());

    if (searchQuery) {
        const idText = String(product.id || "").toLowerCase();
        const makerText = buildMakerNamesText(product).toLowerCase();
        const materialText = String(product.material_used || "").toLowerCase();
        const matchesSearch =
            idText.indexOf(searchQuery) !== -1 ||
            makerText.indexOf(searchQuery) !== -1 ||
            materialText.indexOf(searchQuery) !== -1;
        if (!matchesSearch) {
            return false;
        }
    }

    if (fromBoundary && (!hasValidCreatedAt || createdAt < fromBoundary)) {
        return false;
    }

    if (toBoundary && (!hasValidCreatedAt || createdAt > toBoundary)) {
        return false;
    }

    return true;
}

function applyProductFilters(showFilterStatus) {
    const filteredProducts = allProducts.filter(matchesProductFilters);
    renderProducts(filteredProducts);

    if (showFilterStatus) {
        setStatus(
            "Showing " +
                filteredProducts.length +
                " of " +
                allProducts.length +
                " product(s).",
            "info"
        );
    }
}

function resetProductFilters() {
    productSearchInput.value = "";
    productFromDateInput.value = "";
    productToDateInput.value = "";
    applyProductFilters(true);
}

async function loadProducts() {
    setStatus("Loading product details...", "info");

    try {
        const response = await fetch(API_BASE_URL + "/all-bags", {
            headers: getAuthHeaders()
        });
        const products = await parseResponse(response);
        allProducts = products;
        applyProductFilters(false);
        updatePendingCount();
        setStatus("Product details updated.", "success");
    } catch (error) {
        allProducts = [];
        renderEmptyProducts();
        updatePendingCount();
        setStatus(error.message, "error");
    }
}

function setupElements() {
    productTableBodyElement = document.getElementById("productDetails");
    productCountElement = document.getElementById("productCount");
    productPendingCountElement = document.getElementById("productPendingCount");
    productStatusElement = document.getElementById("productStatus");
    productSearchInput = document.getElementById("productSearchInput");
    productFromDateInput = document.getElementById("productFromDate");
    productToDateInput = document.getElementById("productToDate");
    resetProductFiltersButton = document.getElementById("resetProductFilters");
    qrSection = document.getElementById("qrSection");
    qrImage = document.getElementById("qrImage");
    bagLink = document.getElementById("bagLink");
}

function setupEvents() {
    document.getElementById("backToAdmin").addEventListener("click", function () {
        navigateTo("admin.html");
    });

    productSearchInput.addEventListener("input", function () {
        applyProductFilters(true);
    });
    productFromDateInput.addEventListener("change", function () {
        applyProductFilters(true);
    });
    productToDateInput.addEventListener("change", function () {
        applyProductFilters(true);
    });
    resetProductFiltersButton.addEventListener("click", resetProductFilters);

    window.addEventListener("online", function () {
        loadProducts();
    });
}

document.addEventListener("DOMContentLoaded", function () {
    userRole = getUserRole();
    setupElements();
    setupEvents();
    updatePendingCount();
    loadProducts();
});
