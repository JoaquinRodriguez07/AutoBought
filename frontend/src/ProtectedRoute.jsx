import { Navigate, Outlet } from "react-router-dom";
import { isSeller, hasActiveSession, getSession } from "./auth";

// Rutas que exigen sesión. Son pantallas de cliente, así que un vendedor
// se manda a su portal.
export default function ProtectedRoute() {
  if (!hasActiveSession()) {
    return <Navigate to="/login" replace />;
  }

  if (isSeller(getSession())) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
