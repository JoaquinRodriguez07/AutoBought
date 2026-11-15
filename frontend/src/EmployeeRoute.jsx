import { useMemo } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { isSeller, hasActiveSession, getSession } from "./auth";

// Rutas del portal del vendedor. Sin sesión va al login; con sesión de
// cliente vuelve a la tienda.
export default function EmployeeRoute() {
  // Se guarda a dónde iba, para volver ahí después de iniciar sesión. Con
  // useMemo el objeto es siempre el mismo: si cambiara en cada render,
  // Navigate volvería a navegar una y otra vez.
  const { pathname, search } = useLocation();
  const loginState = useMemo(() => ({ from: pathname + search }), [pathname, search]);

  if (!hasActiveSession()) {
    return <Navigate to="/login" replace state={loginState} />;
  }

  if (!isSeller(getSession())) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
