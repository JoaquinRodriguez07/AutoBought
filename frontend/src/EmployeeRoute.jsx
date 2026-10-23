import { Navigate, Outlet } from "react-router-dom";
import { esVendedor, haySesionActiva, obtenerSesion } from "./auth";

// Rutas del portal del vendedor. Sin sesión va al login; con sesión de
// cliente vuelve a la tienda.
export default function EmployeeRoute() {
  if (!haySesionActiva()) {
    return <Navigate to="/login" replace />;
  }

  if (!esVendedor(obtenerSesion())) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
