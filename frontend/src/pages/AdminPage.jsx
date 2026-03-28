import { useNavigate } from "react-router-dom";
import { clearSession } from "../lib/auth";

export default function AdminPage() {
  const navigate = useNavigate();

  function handleLogout() {
    clearSession();
    navigate("/login", { replace: true });
  }

  return (
    <main className="page">
      <section className="card">
        <img
          className="logo"
          src="/assets/logo.png"
          alt="Amarswaroop Foundation logo"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
        <h1>Admin Dashboard</h1>
        <p className="subtitle">Choose what you want to manage</p>

        <div className="nav-grid">
          <button type="button" onClick={() => navigate("/employee")}>
            Employee Registration
          </button>
          <button type="button" onClick={() => navigate("/product")}>
            Product Registration
          </button>
          <button type="button" className="secondary" onClick={() => navigate("/product-details")}>
            Product Details
          </button>
          <button type="button" className="secondary" onClick={() => navigate("/team")}>
            Employee &amp; Volunteer Details
          </button>
          <button type="button" className="secondary" onClick={() => navigate("/traceability")}>
            Traceability Sync
          </button>
          <button type="button" className="secondary" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </section>
    </main>
  );
}

