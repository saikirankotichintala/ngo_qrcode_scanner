const API_BASE_URL = (window.NGO_CONFIG && window.NGO_CONFIG.API_BASE_URL) || "http://127.0.0.1:5000";

let pageMessage;
let bagCard;

function setMessage(message, type) {
    pageMessage.textContent = message;
    pageMessage.className = "status";

    if (type) {
        pageMessage.classList.add("status-" + type);
    }
}

async function parseResponse(response) {
    const data = await response.json().catch(function () {
        return {};
    });

    if (!response.ok) {
        throw new Error(data.error || "Request failed");
    }

    return data;
}

function getBagIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return (params.get("id") || "").trim();
}

function getMakerNamesText(bag) {
    if (Array.isArray(bag.maker_names) && bag.maker_names.length) {
        return bag.maker_names.join(", ");
    }
    return bag.maker_name || "-";
}

function getEmployeeStoryText(bag) {
    if (Array.isArray(bag.employee_profiles) && bag.employee_profiles.length) {
        return bag.employee_profiles
            .map(function (profile) {
                const name = (profile && profile.name) || "Unknown";
                const story = (profile && profile.story) || "No story added.";
                return name + ": " + story;
            })
            .join("\n\n");
    }
    return bag.employee_story || "-";
}

function renderBag(bag) {
    document.getElementById("bagId").textContent = bag.id || "-";
    document.getElementById("makerName").textContent = getMakerNamesText(bag);
    document.getElementById("employeeStory").textContent = getEmployeeStoryText(bag);
    document.getElementById("materialUsed").textContent = bag.material_used || "-";
    const imageElement = document.getElementById("productImage");
    const imageFallback = document.getElementById("productImageFallback");
    if (bag.product_image_url) {
        imageElement.src = bag.product_image_url;
        imageElement.classList.remove("hidden");
        imageFallback.classList.add("hidden");
    } else {
        imageElement.removeAttribute("src");
        imageElement.classList.add("hidden");
        imageFallback.classList.remove("hidden");
    }
}

function setBagLoadingState(isLoading) {
    if (!bagCard) {
        return;
    }

    if (isLoading) {
        bagCard.classList.add("is-loading");
        bagCard.classList.remove("is-loaded");
        return;
    }

    bagCard.classList.remove("is-loading");
}

function animateBagReveal() {
    if (!bagCard) {
        return;
    }

    bagCard.classList.remove("is-loaded");
    void bagCard.offsetWidth;
    bagCard.classList.add("is-loaded");
}

async function loadBag() {
    const bagId = getBagIdFromUrl();

    if (!bagId) {
        setMessage("Bag ID missing in URL. Use bag.html?id=<bag_id>", "error");
        setBagLoadingState(false);
        return;
    }

    setBagLoadingState(true);
    setMessage("Loading bag details...", "info");

    try {
        const response = await fetch(API_BASE_URL + "/bag/" + encodeURIComponent(bagId));
        const bag = await parseResponse(response);
        renderBag(bag);
        setBagLoadingState(false);
        animateBagReveal();
        setMessage("", "");
    } catch (error) {
        setBagLoadingState(false);
        setMessage(error.message, "error");
    }
}

document.addEventListener("DOMContentLoaded", function () {
    pageMessage = document.getElementById("pageMessage");
    bagCard = document.getElementById("bagCard");
    loadBag();
});
