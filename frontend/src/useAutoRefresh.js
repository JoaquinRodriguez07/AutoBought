import { useEffect, useRef } from "react";

// Cada cuánto se vuelven a pedir los pedidos con la pestaña a la vista.
// Es una consulta chica (solo los pedidos del cliente) y solo corre con la
// pestaña visible, así que el backend casi no lo nota.
export const AUTO_REFRESH_MS = 15 * 1000;

/**
 * Llama a `refresh` cada `intervalMs` mientras la pestaña está visible, y
 * también apenas el usuario vuelve a ella (cambió de pestaña o de programa).
 * Sirve para ver los cambios que hace otro (ej. el vendedor pasa el pedido
 * a «Enviado») sin recargar la página.
 *
 * - `enabled: false` lo frena (ej. mientras el usuario está pagando).
 * - Si la consulta anterior todavía no volvió, no se lanza otra encima.
 * - `refresh` se lee desde una ref: cambiarla en cada render no reinicia
 *   el temporizador.
 */
export function useAutoRefresh(refresh, { enabled = true, intervalMs = AUTO_REFRESH_MS } = {}) {
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  });

  useEffect(() => {
    if (!enabled) return undefined;

    let inFlight = false;
    const run = async () => {
      if (inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        await refreshRef.current();
      } catch {
        // Si falla, queda lo que había y se prueba en la próxima vuelta.
      } finally {
        inFlight = false;
      }
    };

    const onGoBack = () => {
      if (document.visibilityState === "visible") void run();
    };

    const timer = setInterval(() => void run(), intervalMs);
    document.addEventListener("visibilitychange", onGoBack);
    window.addEventListener("focus", onGoBack);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onGoBack);
      window.removeEventListener("focus", onGoBack);
    };
  }, [enabled, intervalMs]);
}
