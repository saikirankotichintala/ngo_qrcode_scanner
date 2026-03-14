(function (window) {
    function normalizeBaseUrl(value) {
        if (!value) {
            return "";
        }

        const normalized = String(value).trim().replace(/\/+$/, "");
        if (!normalized || normalized.toLowerCase() === "null") {
            return "";
        }

        return normalized;
    }

    function getStoredApiBaseUrl() {
        try {
            return normalizeBaseUrl(window.localStorage.getItem("ngo_api_base_url"));
        } catch (error) {
            return "";
        }
    }

    function inferApiBaseUrl() {
        const configuredBaseUrl =
            normalizeBaseUrl(window.NGO_API_BASE_URL) || getStoredApiBaseUrl();
        if (configuredBaseUrl) {
            return configuredBaseUrl;
        }

        const pageLocation = window.location || {};
        const hostname = pageLocation.hostname;
        const protocol = pageLocation.protocol === "https:" ? "https:" : "http:";

        if (hostname) {
            return protocol + "//" + hostname + ":5000";
        }

        return "http://127.0.0.1:5000";
    }

    window.NGO_CONFIG = Object.freeze({
        API_BASE_URL: inferApiBaseUrl()
    });
})(window);
