const USER_CREDENTIALS = {
    admin: { password: "1234", role: "admin" },
    volunteer: { password: "1234", role: "volunteer" }
};

const ROLE_ROUTES = {
    admin: "admin.html",
    volunteer: "product.html"
};

function setError(message) {
    const errorElement = document.getElementById("errorMsg");
    errorElement.textContent = message;
    errorElement.className = "status";

    if (message) {
        errorElement.classList.add("status-error");
    }
}

function getInputValue(id) {
    const element = document.getElementById(id);
    return element.value.trim();
}

function handleLogin(event) {
    event.preventDefault();

    const username = getInputValue("username").toLowerCase();
    const password = getInputValue("password");
    const user = USER_CREDENTIALS[username];

    if (!user || user.password !== password) {
        setError("Invalid username or password.");
        return;
    }

    localStorage.setItem("ngo_user", username);
    localStorage.setItem("ngo_role", user.role);
    window.location.href = ROLE_ROUTES[user.role];
}

document.addEventListener("DOMContentLoaded", function () {
    const form = document.getElementById("loginForm");
    form.addEventListener("submit", handleLogin);
});
