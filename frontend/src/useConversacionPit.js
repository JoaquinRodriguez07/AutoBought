import { useCallback, useEffect, useRef, useState } from "react";

import { consultarAsistente } from "./api";
import { vehiculoCompleto } from "./context/VehicleContext";

const SIN_CONVERSACION = { historial: [], firma: null };

let ultimoId = 0;
const nuevoId = () => {
  ultimoId += 1;
  return ultimoId;
};

const claveDe = (vehiculo) => (vehiculoCompleto(vehiculo) ? `${vehiculo.brand}|${vehiculo.model}|${vehiculo.year}` : "");

/**
 * useConversacionPit
 * ==========================================
 * La lógica del chat con Pit, separada de cómo se ve (ChatPit). Guarda dos
 * cosas distintas:
 *
 * - `mensajes`: lo que se ve en pantalla (burbujas del cliente, respuestas
 *   de Pit con sus repuestos, errores).
 * - `conversacion`: el historial y la firma que devolvió el backend. No se
 *   muestra: se le manda de vuelta, tal cual, en el próximo mensaje.
 *
 * Si cambia el vehículo, la conversación vuelve a empezar: lo que hablaron
 * era de otro auto (y el backend la rechazaría, porque la firma incluye el
 * vehículo).
 */
export function useConversacionPit(vehiculo) {
  const [mensajes, setMensajes] = useState([]);
  const [pensando, setPensando] = useState(false);
  const [conversacion, setConversacion] = useState(SIN_CONVERSACION);

  const clave = claveDe(vehiculo);
  const [claveDeLaCharla, setClaveDeLaCharla] = useState(clave);
  if (clave !== claveDeLaCharla) {
    // Se ajusta durante el render (como recomienda React) en vez de en un
    // efecto, así nunca se ve la charla vieja con el auto nuevo.
    setClaveDeLaCharla(clave);
    setMensajes([]);
    setConversacion(SIN_CONVERSACION);
    setPensando(false);
  }

  // Cada reinicio (o cambio de auto) es un "turno" nuevo. Si llega tarde la
  // respuesta de un mensaje de antes, se descarta en vez de mezclarla.
  const turno = useRef(0);
  const claveActual = useRef(clave);
  useEffect(() => {
    if (claveActual.current !== clave) turno.current += 1;
    claveActual.current = clave;
  }, [clave]);

  const reiniciar = useCallback(() => {
    turno.current += 1;
    setMensajes([]);
    setConversacion(SIN_CONVERSACION);
    setPensando(false);
  }, []);

  const enviar = async (texto) => {
    const consulta = texto.trim();
    if (consulta.length < 3 || pensando || !clave) return;

    const miTurno = turno.current;
    const llegoTarde = () => miTurno !== turno.current;

    setMensajes((anteriores) => [...anteriores, { id: nuevoId(), rol: "cliente", texto: consulta }]);
    setPensando(true);

    try {
      const respuesta = await consultarAsistente({
        texto: consulta,
        marca: vehiculo.brand,
        modelo: vehiculo.model,
        anio: vehiculo.year,
        historial: conversacion.historial,
        firma: conversacion.firma,
      });
      if (llegoTarde()) return;

      setConversacion({ historial: respuesta.historial, firma: respuesta.firma });
      setMensajes((anteriores) => [...anteriores, { id: nuevoId(), rol: "pit", consulta, respuesta }]);
    } catch (error) {
      if (llegoTarde()) return;

      // El backend no aceptó el historial: el próximo mensaje empieza una
      // conversación nueva.
      if (error.status === 400) setConversacion(SIN_CONVERSACION);
      setMensajes((anteriores) => [
        ...anteriores,
        { id: nuevoId(), rol: "pit", consulta, error: { mensaje: error.message, status: error.status } },
      ]);
    } finally {
      if (!llegoTarde()) setPensando(false);
    }
  };

  return { mensajes, pensando, enviar, reiniciar };
}
