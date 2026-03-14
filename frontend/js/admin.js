function navigateTo(page) {
    window.location.href = page;
}

function bindButton(id, callback) {
    const button = document.getElementById(id);
    if (button) {
        button.addEventListener("click", callback);
    }
}

function handleLogout() {
    localStorage.removeItem("ngo_user");
    localStorage.removeItem("ngo_role");
    navigateTo("login.html");
}

function setupNavigation() {
    bindButton("goEmployee", function () {
        navigateTo("employee.html");
    });

    bindButton("goProduct", function () {
        navigateTo("product.html");
    });

    bindButton("goProductDetails", function () {
        navigateTo("product-details.html");
    });

    bindButton("goTeam", function () {
        navigateTo("team.html");
    });

    bindButton("goLogout", handleLogout);
}

document.addEventListener("DOMContentLoaded", function () {
    setupNavigation();
});
