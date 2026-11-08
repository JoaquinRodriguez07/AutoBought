// Hook con la conversación con Pit: mensajes, envío y errores.

import { useCallback, useEffect, useRef, useState } from "react";

import { askAssistant } from "./api";
import { isVehicleComplete } from "./context/VehicleContext";

const NO_CONVERSATION = { historial: [], firma: null };

let lastId = 0;
const newId = () => {
  lastId += 1;
  return lastId;
};

const keyFor = (vehicle) => (isVehicleComplete(vehicle) ? `${vehicle.brand}|${vehicle.model}|${vehicle.year}` : "");

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
export function usePitConversation(vehicle) {
  const [messages, setMessages] = useState([]);
  const [thinking, setThinking] = useState(false);
  const [conversation, setConversation] = useState(NO_CONVERSATION);

  const key = keyFor(vehicle);
  const [keyChat, setKeyChat] = useState(key);
  if (key !== keyChat) {
    // Se ajusta durante el render (como recomienda React) en vez de en un
    // efecto, así nunca se ve la charla vieja con el auto nuevo.
    setKeyChat(key);
    setMessages([]);
    setConversation(NO_CONVERSATION);
    setThinking(false);
  }

  // Cada reinicio (o cambio de auto) es un "turno" nuevo. Si llega tarde la
  // respuesta de un mensaje de antes, se descarta en vez de mezclarla.
  const turno = useRef(0);
  const currentKey = useRef(key);
  useEffect(() => {
    if (currentKey.current !== key) turno.current += 1;
    currentKey.current = key;
  }, [key]);

  const reset = useCallback(() => {
    turno.current += 1;
    setMessages([]);
    setConversation(NO_CONVERSATION);
    setThinking(false);
  }, []);

  const send = async (texto) => {
    const queryState = texto.trim();
    if (queryState.length < 3 || thinking || !key) return;

    const miTurno = turno.current;
    const llegoTarde = () => miTurno !== turno.current;

    setMessages((anteriores) => [...anteriores, { id: newId(), rol: "cliente", texto: queryState }]);
    setThinking(true);

    try {
      const response = await askAssistant({
        texto: queryState,
        marca: vehicle.brand,
        modelo: vehicle.model,
        anio: vehicle.year,
        historial: conversation.historial,
        firma: conversation.firma,
      });
      if (llegoTarde()) return;

      setConversation({ historial: response.historial, firma: response.firma });
      setMessages((anteriores) => [...anteriores, { id: newId(), rol: "pit", queryState, response }]);
    } catch (error) {
      if (llegoTarde()) return;

      // El backend no aceptó el historial: el próximo mensaje empieza una
      // conversación nueva.
      if (error.status === 400) setConversation(NO_CONVERSATION);
      setMessages((anteriores) => [
        ...anteriores,
        { id: newId(), rol: "pit", queryState, error: { message: error.message, status: error.status } },
      ]);
    } finally {
      if (!llegoTarde()) setThinking(false);
    }
  };

  return { messages, thinking, send, reset };
}
