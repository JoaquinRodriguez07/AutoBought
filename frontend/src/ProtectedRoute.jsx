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

// Rutas de cliente que no exigen sesión por sí mismas (cada pantalla decide
// qué hace sin sesión): solo desvía al vendedor a su portal.
export function ClientOnlyRoute() {
  if (esVendedor(obtenerSesion())) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
