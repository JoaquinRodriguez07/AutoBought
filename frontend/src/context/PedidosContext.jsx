// Los pedidos del cliente para el ícono de la barra y el inicio.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { obtenerHistorialCompras } from "../api";
import { esVendedor, obtenerSesion, sesionValida } from "../auth";
import { estaEnCurso } from "../seguimientoPedido";

/**
 * PedidosContext
 * ==========================================
 * Los pedidos del cliente, para lo que se ve fuera de «Mis pedidos»: el
 * número del ícono de la barra y el aviso del inicio. Se cargan al entrar,
 * al iniciar sesión y al volver al inicio; «Mis pedidos» los actualiza
 * cuando los trae o cuando cambia uno (ej. «Ya lo recibí»).
 */

const SIN_PEDIDOS = [];

const PedidosContext = createContext(null);

export function PedidosProvider({ children }) {
  const [pedidos, setPedidos] = useState(SIN_PEDIDOS);

  const recargar = useCallback(async () => {
    const sesion = obtenerSesion();
    // El vendedor no compra (la API le responde 403).
    if (!sesionValida(sesion) || esVendedor(sesion)) return;
    try {
      setPedidos(await obtenerHistorialCompras());
    } catch {
      // Si falla, queda lo que había: es solo un aviso.
    }
  }, []);

  // La primera carga, al abrir la tienda con la sesión ya iniciada.
  useEffect(() => {
    const sesion = obtenerSesion();
    if (!sesionValida(sesion) || esVendedor(sesion)) return undefined;

    let cancelado = false;
    obtenerHistorialCompras()
      .then((lista) => {
        if (!cancelado) setPedidos(lista);
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, []);

  const limpiar = useCallback(() => setPedidos(SIN_PEDIDOS), []);

  const value = useMemo(
    () => ({
      pedidos,
      enCurso: pedidos.filter(estaEnCurso),
      recargar,
      establecer: setPedidos,
      limpiar,
    }),
    [pedidos, recargar, limpiar]
  );

  return <PedidosContext.Provider value={value}>{children}</PedidosContext.Provider>;
}

const SIN_PROVEEDOR = {
  pedidos: SIN_PEDIDOS,
  enCurso: SIN_PEDIDOS,
  recargar: () => {},
  establecer: () => {},
  limpiar: () => {},
};

/** Sin el proveedor (en algunos tests) no hay pedidos y nada falla. */
export function usePedidos() {
  return useContext(PedidosContext) ?? SIN_PROVEEDOR;
}
