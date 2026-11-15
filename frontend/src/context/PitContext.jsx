// La conversación con Pit, compartida entre el panel y el chat.

import { createContext, useCallback, useContext, useState } from "react";

import { usePitConversation } from "../usePitConversation";
import { useVehicle } from "./VehicleContext";

/**
 * PitContext
 * ==========================================
 * Una sola conversación con Pit para todo el sitio. Vive por encima de las
 * rutas (ver main.jsx), igual que el carrito: si el cliente abre Pit en el
 * catálogo, va al detalle de un repuesto y lo vuelve a abrir, la charla
 * sigue ahí. Las invitaciones a Pit (inicio, catálogo) abren el mismo panel.
 *
 * `abierto` es si el panel flotante está a la vista. `abrir(texto)` lo abre
 * con ese texto ya escrito en el chat (por ejemplo, lo que el cliente buscó
 * en el catálogo sin encontrar nada), listo para mandar.
 */
const PitContext = createContext(null);

export function PitProvider({ children }) {
  const { activeVehicle } = useVehicle();
  const conversation = usePitConversation(activeVehicle);
  const [isOpen, setIsOpen] = useState(false);
  const [borrador, setBorrador] = useState("");

  // Se usa también directo como onClick: ahí llega el evento, no un texto.
  const open = useCallback((texto) => {
    setBorrador(typeof texto === "string" ? texto : "");
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);

  // Al cerrar sesión: se cierra el panel y se borra la charla, para que
  // el próximo que use la compu no la vea.
  const { reset } = conversation;
  const forget = useCallback(() => {
    setIsOpen(false);
    reset();
  }, [reset]);

  const value = { vehicle: activeVehicle, conversation, isOpen, borrador, open, close, forget };

  return <PitContext.Provider value={value}>{children}</PitContext.Provider>;
}

/** Como usePit, pero sin Pit (fuera del proveedor) devuelve null en vez de
 * fallar: para componentes que se usan en muchas pantallas, como el menú. */
export function useOptionalPit() {
  return useContext(PitContext);
}

export function usePit() {
  const ctx = useContext(PitContext);

  if (!ctx) {
    throw new Error("usePit debe usarse dentro de <PitProvider>");
  }

  return ctx;
}
