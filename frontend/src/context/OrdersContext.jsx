// Los pedidos del cliente para el ícono de la barra y el inicio.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { getPurchaseHistory } from "../api";
import { isSeller, getSession, isSessionValid } from "../auth";
import { isActive } from "../orderTracking";
import { AUTO_REFRESH_MS, useAutoRefresh } from "../useAutoRefresh";

/**
 * PedidosContext
 * ==========================================
 * Los pedidos del cliente, para lo que se ve fuera de «Mis pedidos»: el
 * número del ícono de la barra y el aviso del inicio. Se cargan al entrar,
 * al iniciar sesión y al volver al inicio; «Mis pedidos» los actualiza
 * cuando los trae o cuando cambia uno (ej. «Ya lo recibí»). Además se
 * vuelven a pedir cada tanto, para que los cambios del vendedor se vean
 * sin recargar.
 */

const NO_ORDERS = [];

const OrdersContext = createContext(null);

export function OrdersProvider({ children }) {
  const [orders, setOrders] = useState(NO_ORDERS);
  // Cuándo llegaron los pedidos por última vez (de acá o de «Mis pedidos»).
  const lastUpdate = useRef(0);

  const establecer = useCallback((list) => {
    lastUpdate.current = Date.now();
    setOrders(list);
  }, []);

  const reload = useCallback(async () => {
    const session = getSession();
    // El vendedor no compra (la API le responde 403).
    if (!isSessionValid(session) || isSeller(session)) return;
    try {
      establecer(await getPurchaseHistory());
    } catch {
      // Si falla, queda lo que había: es solo un aviso.
    }
  }, [establecer]);

  // Si «Mis pedidos» ya los trajo hace poco (está abierta y pide sola), no
  // hace falta pedirlos dos veces. La mitad del intervalo deja margen para
  // que los dos temporizadores no se salteen por milisegundos.
  useAutoRefresh(async () => {
    if (Date.now() - lastUpdate.current < AUTO_REFRESH_MS / 2) return;
    await reload();
  });

  // La primera carga, al abrir la tienda con la sesión ya iniciada.
  useEffect(() => {
    const session = getSession();
    if (!isSessionValid(session) || isSeller(session)) return undefined;

    let cancelled = false;
    getPurchaseHistory()
      .then((list) => {
        if (!cancelled) establecer(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [establecer]);

  const clean = useCallback(() => setOrders(NO_ORDERS), []);

  const value = useMemo(
    () => ({
      orders,
      inProgress: orders.filter(isActive),
      reload,
      establecer,
      clean,
    }),
    [orders, reload, establecer, clean]
  );

  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>;
}

const NO_PROVIDER = {
  orders: NO_ORDERS,
  inProgress: NO_ORDERS,
  reload: () => {},
  establecer: () => {},
  clean: () => {},
};

/** Sin el proveedor (en algunos tests) no hay pedidos y nada falla. */
export function useOrders() {
  return useContext(OrdersContext) ?? NO_PROVIDER;
}
