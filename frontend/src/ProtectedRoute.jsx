import { Navigate, Outlet } from "react-router-dom";
import { esVendedor, haySesionActiva, obtenerSesion } from "./auth";

// Rutas que exigen sesión. Son pantallas de cliente, así que un vendedor
// se manda a su portal.
export default function ProtectedRoute() {
  if (!haySesionActiva()) {
    return <Navigate to="/login" replace />;
  }

  if (esVendedor(obtenerSesion())) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
