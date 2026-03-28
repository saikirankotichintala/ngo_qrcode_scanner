(function (window) {
    const DEFAULT_PROD_API_BASE_URL = "https://ngo-qrcode-backend.onrender.com";
    const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);
    const LEGACY_BROKEN_HOSTS = new Set(["ngo-qrcode-scanner.onrender.com"]);

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

    function isLocalHostname(hostname) {
        return LOCAL_HOSTNAMES.has(String(hostname || "").toLowerCase());
    }

    function parseHostname(value) {
        try {
            return new URL(value).hostname || "";
        } catch (error) {
            return "";
        }
    }

    function usesInsecureHttp(value) {
        return /^http:\/\//i.test(String(value || ""));
    }

    function isUnsafeForCurrentPage(value) {
        if (!value) {
            return false;
        }

        const pageHostname = String((window.location || {}).hostname || "");
        const pageProtocol = String((window.location || {}).protocol || "");
        const targetHostname = parseHostname(value).toLowerCase();
        const targetIsLocal = isLocalHostname(targetHostname);
        const pageIsLocal = isLocalHostname(pageHostname);

        if (LEGACY_BROKEN_HOSTS.has(targetHostname)) {
            return true;
        }

        if (!pageIsLocal && targetIsLocal) {
            return true;
        }

        if (pageProtocol === "https:" && usesInsecureHttp(value) && !targetIsLocal) {
            return true;
        }

        return false;
    }

    function pickConfiguredApiBaseUrl() {
        const candidates = [
            normalizeBaseUrl(window.NGO_API_BASE_URL),
            getStoredApiBaseUrl()
        ];

        for (let index = 0; index < candidates.length; index += 1) {
            const candidate = candidates[index];
            if (candidate && !isUnsafeForCurrentPage(candidate)) {
                return candidate;
            }
        }

        return "";
    }

    function inferApiBaseUrl() {
        const configuredBaseUrl = pickConfiguredApiBaseUrl();
        if (configuredBaseUrl) {
            return configuredBaseUrl;
        }

        const pageLocation = window.location || {};
        const hostname = pageLocation.hostname;
        const protocol = pageLocation.protocol === "https:" ? "https:" : "http:";

        if (hostname && isLocalHostname(hostname)) {
            return protocol + "//" + hostname + ":5000";
        }

        if (protocol === "https:") {
            return DEFAULT_PROD_API_BASE_URL;
        }

        return "http://127.0.0.1:5000";
    }

    window.NGO_CONFIG = Object.freeze({
        API_BASE_URL: inferApiBaseUrl()
    });
})(window);
