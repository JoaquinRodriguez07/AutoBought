import { useEffect, useRef } from "react";
import { renewToken } from "./api";
import { msUntilRenewal } from "./auth";

// Si la renovación falla por algo pasajero (sin red, 5xx), se reintenta
// cada tanto mientras el token siga vivo. Cuando venza, el backend contesta
// 401 y el reintento termina en `onVencida`.
export const RENEWAL_RETRY_MS = 30 * 1000;

// Piso del temporizador justo después de una renovación: evita un bucle de
// pedidos si el backend alguna vez emite tokens con menos vida que el margen.
const MIN_WAIT_MS = 5 * 1000;

// setTimeout guarda la demora en 32 bits con signo: con más de ~24,8 días
// desborda y dispara de inmediato. Una demora mayor se parte en tramos.
const MAX_WAIT_MS = 2 ** 31 - 1;

/**
 * Mantiene viva la sesión del cliente: un rato antes de que venza el token
 * actual (ver MARGEN_RENOVACION_MS) pide uno nuevo y avisa con `onRenovada`.
 *
 * - `token`: el token vigente de la sesión. Cada vez que cambia (login,
 *   logout o una renovación) se reprograma el temporizador.
 * - `onRenovada({ access_token, token_type })`: reemplaza el token en la
 *   sesión.
 * - `onVencida()`: el backend rechazó el token (401): la sesión terminó y
 *   hay que volver a iniciar sesión.
 *
 * Los temporizadores del navegador se frenan con la pestaña en segundo plano
 * o la compu suspendida, así que además de programar se recalcula cuando la
 * pestaña vuelve a estar visible.
 */
export function useSessionRenewal(token, { onRenewed, onExpired }) {
  // Los callbacks se leen desde refs para que cambiarlos en cada render no
  // reinicie el temporizador.
  const callbacks = useRef({ onRenewed, onExpired });
  useEffect(() => {
    callbacks.current = { onRenewed, onExpired };
  });

  const justRenewed = useRef(false);

  useEffect(() => {
    if (!token || msUntilRenewal(token) === null) return undefined;

    let cancelled = false;
    let inProgress = false;
    let temporizador = null;
    const piso = justRenewed.current ? MIN_WAIT_MS : 0;
    justRenewed.current = false;

    const clean = () => {
      clearTimeout(temporizador);
      temporizador = null;
    };

    const programar = (ms) => {
      clean();
      temporizador = setTimeout(onElapseTime, Math.min(ms, MAX_WAIT_MS));
    };

    // Puede llegar antes de hora (demora partida en tramos o reloj que se
    // ajustó): se vuelve a medir contra el reloj real antes de pedir nada.
    function onElapseTime() {
      const falta = msUntilRenewal(token);

      if (falta > 0) {
        programar(falta);
      } else {
        void renovar();
      }
    }

    async function renovar() {
      if (cancelled || inProgress) return;
      inProgress = true;
      clean();

      let data;
      try {
        data = await renewToken();
      } catch (error) {
        inProgress = false;
        if (cancelled) return;

        if (error.status === 401) {
          callbacks.current.onExpired();
        } else {
          programar(RENEWAL_RETRY_MS);
        }
        return;
      }

      inProgress = false;
      if (cancelled) return;

      // Al cambiar el token el efecto se reejecuta y programa el próximo.
      justRenewed.current = true;
      callbacks.current.onRenewed(data);
    }

    const reprogramar = () => {
      if (cancelled || inProgress) return;
      programar(Math.max(msUntilRenewal(token), piso));
    };

    const onGoBackTab = () => {
      if (document.visibilityState !== "visible" || cancelled || inProgress) return;

      // Si ya llegó la hora de renovar (el temporizador se frenó), se hace
      // ahora mismo; si no, se reajusta el temporizador al reloj real.
      if (msUntilRenewal(token) === 0) {
        void renovar();
      } else {
        reprogramar();
      }
    };

    reprogramar();
    document.addEventListener("visibilitychange", onGoBackTab);

    return () => {
      cancelled = true;
      clean();
      document.removeEventListener("visibilitychange", onGoBackTab);
    };
  }, [token]);
}
