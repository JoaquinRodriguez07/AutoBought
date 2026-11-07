// Los pedidos del cliente para el ícono de la barra y el inicio.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { getPurchaseHistory } from "../api";
import { isSeller, getSession, isSessionValid } from "../auth";
import { isActive } from "../orderTracking";

/**
 * PedidosContext
 * ==========================================
 * Los pedidos del cliente, para lo que se ve fuera de «Mis pedidos»: el
 * número del ícono de la barra y el aviso del inicio. Se cargan al entrar,
 * al iniciar sesión y al volver al inicio; «Mis pedidos» los actualiza
 * cuando los trae o cuando cambia uno (ej. «Ya lo recibí»).
 */

const NO_ORDERS = [];

const OrdersContext = createContext(null);

export function OrdersProvider({ children }) {
  const [pedidos, setPedidos] = useState(NO_ORDERS);

  const recargar = useCallback(async () => {
    const sesion = getSession();
    // El vendedor no compra (la API le responde 403).
    if (!isSessionValid(sesion) || isSeller(sesion)) return;
    try {
      setPedidos(await getPurchaseHistory());
    } catch {
      // Si falla, queda lo que había: es solo un aviso.
    }
  }, []);

  // La primera carga, al abrir la tienda con la sesión ya iniciada.
  useEffect(() => {
    const sesion = getSession();
    if (!isSessionValid(sesion) || isSeller(sesion)) return undefined;

    let cancelado = false;
    getPurchaseHistory()
      .then((lista) => {
        if (!cancelado) setPedidos(lista);
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, []);

  const clean = useCallback(() => setPedidos(NO_ORDERS), []);

  const value = useMemo(
    () => ({
      pedidos,
      enCurso: pedidos.filter(isActive),
      recargar,
      establecer: setPedidos,
      clean,
    }),
    [pedidos, recargar, clean]
  );

  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>;
}

const NO_PROVIDER = {
  pedidos: NO_ORDERS,
  enCurso: NO_ORDERS,
  recargar: () => {},
  establecer: () => {},
  clean: () => {},
};

/** Sin el proveedor (en algunos tests) no hay pedidos y nada falla. */
export function useOrders() {
  return useContext(OrdersContext) ?? NO_PROVIDER;
}
