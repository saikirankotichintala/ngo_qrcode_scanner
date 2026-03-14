import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getUserRole, ROLE_ROUTES, setSession } from "../lib/auth";

const USER_CREDENTIALS = {
  admin: { password: "1234", role: "admin" },
  volunteer: { password: "1234", role: "volunteer" }
};

export default function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const role = getUserRole();
    if (role && ROLE_ROUTES[role]) {
      navigate(ROLE_ROUTES[role], { replace: true });
    }
  }, [navigate]);

  function handleSubmit(event) {
    event.preventDefault();

    const normalizedUsername = username.trim().toLowerCase();
    const user = USER_CREDENTIALS[normalizedUsername];

    if (!user || user.password !== password.trim()) {
      setErrorMessage("Invalid username or password.");
      return;
    }

    setSession(normalizedUsername, user.role);
    navigate(ROLE_ROUTES[user.role], { replace: true });
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
        <h1>Amarswaroop Foundation</h1>
        <p className="subtitle">QR Product Tracking System</p>

        <form className="stack" onSubmit={handleSubmit}>
          <label htmlFor="username">Username</label>
          <input
            id="username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />

          <button type="submit">Login</button>
        </form>

        <p className={`status${errorMessage ? " status-error" : ""}`}>{errorMessage}</p>

        <div className="hint-box">
          <p>
            <strong>Demo Users</strong>
          </p>
          <p>admin / 1234</p>
          <p>volunteer / 1234</p>
        </div>
      </section>
    </main>
  );
}

