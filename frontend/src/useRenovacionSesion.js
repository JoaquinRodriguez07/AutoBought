import { useEffect, useRef } from "react";
import { renovarToken } from "./api";
import { msHastaRenovacion } from "./auth";

// Si la renovación falla por algo pasajero (sin red, 5xx), se reintenta
// cada tanto mientras el token siga vivo. Cuando venza, el backend contesta
// 401 y el reintento termina en `onVencida`.
export const REINTENTO_RENOVACION_MS = 30 * 1000;

// Piso del temporizador justo después de una renovación: evita un bucle de
// pedidos si el backend alguna vez emite tokens con menos vida que el margen.
const ESPERA_MINIMA_MS = 5 * 1000;

// setTimeout guarda la demora en 32 bits con signo: con más de ~24,8 días
// desborda y dispara de inmediato. Una demora mayor se parte en tramos.
const ESPERA_MAXIMA_MS = 2 ** 31 - 1;

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
export function useRenovacionSesion(token, { onRenovada, onVencida }) {
  // Los callbacks se leen desde refs para que cambiarlos en cada render no
  // reinicie el temporizador.
  const callbacks = useRef({ onRenovada, onVencida });
  useEffect(() => {
    callbacks.current = { onRenovada, onVencida };
  });

  const recienRenovado = useRef(false);

  useEffect(() => {
    if (!token || msHastaRenovacion(token) === null) return undefined;

    let cancelado = false;
    let enCurso = false;
    let temporizador = null;
    const piso = recienRenovado.current ? ESPERA_MINIMA_MS : 0;
    recienRenovado.current = false;

    const limpiar = () => {
      clearTimeout(temporizador);
      temporizador = null;
    };

    const programar = (ms) => {
      limpiar();
      temporizador = setTimeout(alCumplirseElTiempo, Math.min(ms, ESPERA_MAXIMA_MS));
    };

    // Puede llegar antes de hora (demora partida en tramos o reloj que se
    // ajustó): se vuelve a medir contra el reloj real antes de pedir nada.
    function alCumplirseElTiempo() {
      const falta = msHastaRenovacion(token);

      if (falta > 0) {
        programar(falta);
      } else {
        renovar();
      }
    }

    async function renovar() {
      if (cancelado || enCurso) return;
      enCurso = true;
      limpiar();

      let data;
      try {
        data = await renovarToken();
      } catch (error) {
        enCurso = false;
        if (cancelado) return;

        if (error.status === 401) {
          callbacks.current.onVencida();
        } else {
          programar(REINTENTO_RENOVACION_MS);
        }
        return;
      }

      enCurso = false;
      if (cancelado) return;

      // Al cambiar el token el efecto se reejecuta y programa el próximo.
      recienRenovado.current = true;
      callbacks.current.onRenovada(data);
    }

    const reprogramar = () => {
      if (cancelado || enCurso) return;
      programar(Math.max(msHastaRenovacion(token), piso));
    };

    const alVolverLaPestaña = () => {
      if (document.visibilityState !== "visible" || cancelado || enCurso) return;

      // Si ya llegó la hora de renovar (el temporizador se frenó), se hace
      // ahora mismo; si no, se reajusta el temporizador al reloj real.
      if (msHastaRenovacion(token) === 0) {
        renovar();
      } else {
        reprogramar();
      }
    };

    reprogramar();
    document.addEventListener("visibilitychange", alVolverLaPestaña);

    return () => {
      cancelado = true;
      limpiar();
      document.removeEventListener("visibilitychange", alVolverLaPestaña);
    };
  }, [token]);
}
