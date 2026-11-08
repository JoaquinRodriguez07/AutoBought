import { Navigate, Outlet } from "react-router-dom";
import { isSeller, hasActiveSession, getSession } from "./auth";

// Rutas del portal del vendedor. Sin sesión va al login; con sesión de
// cliente vuelve a la tienda.
export default function EmployeeRoute() {
  if (!hasActiveSession()) {
    return <Navigate to="/login" replace />;
  }

  if (!isSeller(getSession())) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
