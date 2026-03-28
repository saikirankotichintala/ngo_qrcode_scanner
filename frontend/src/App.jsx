import { Navigate, Route, Routes } from "react-router-dom";
import { getUserRole } from "./lib/auth";
import AdminPage from "./pages/AdminPage";
import BagPage from "./pages/BagPage";
import EmployeePage from "./pages/EmployeePage";
import LoginPage from "./pages/LoginPage";
import ProductDetailsPage from "./pages/ProductDetailsPage";
import ProductPage from "./pages/ProductPage";
import TeamPage from "./pages/TeamPage";
import TraceabilityPage from "./pages/TraceabilityPage";

function ProtectedRoute({ roles, children }) {
  const role = getUserRole();

  if (!role) {
    return <Navigate to="/login" replace />;
  }

  if (roles.length && !roles.includes(role)) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/admin"
        element={
          <ProtectedRoute roles={["admin"]}>
            <AdminPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/employee"
        element={
          <ProtectedRoute roles={["admin"]}>
            <EmployeePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/product"
        element={
          <ProtectedRoute roles={["admin", "volunteer"]}>
            <ProductPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/product-details"
        element={
          <ProtectedRoute roles={["admin"]}>
            <ProductDetailsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/team"
        element={
          <ProtectedRoute roles={["admin"]}>
            <TeamPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/bag"
        element={
          <ProtectedRoute roles={["admin", "volunteer"]}>
            <BagPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/traceability"
        element={
          <ProtectedRoute roles={["admin", "volunteer"]}>
            <TraceabilityPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
