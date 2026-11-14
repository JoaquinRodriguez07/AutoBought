import { useMemo } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { isSeller, hasActiveSession, getSession } from "./auth";

// Rutas que exigen sesión. Son pantallas de cliente, así que un vendedor
// se manda a su portal.
export default function ProtectedRoute() {
  // Se guarda a dónde iba, para volver ahí después de iniciar sesión. Con
  // useMemo el objeto es siempre el mismo: si cambiara en cada render,
  // Navigate volvería a navegar una y otra vez.
  const { pathname, search } = useLocation();
  const loginState = useMemo(() => ({ from: pathname + search }), [pathname, search]);

  if (!hasActiveSession()) {
    return <Navigate to="/login" replace state={loginState} />;
  }

  if (isSeller(getSession())) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
