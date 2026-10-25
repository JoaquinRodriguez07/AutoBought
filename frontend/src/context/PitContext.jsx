import { createContext, useCallback, useContext, useState } from "react";

import { useConversacionPit } from "../useConversacionPit";
import { useVehicle } from "./VehicleContext";

/**
 * PitContext
 * ==========================================
 * Una sola conversación con Pit para todo el sitio. Vive por encima de las
 * rutas (ver main.jsx), igual que el carrito: si el cliente abre Pit en el
 * catálogo, va al detalle de un repuesto y lo vuelve a abrir, la charla
 * sigue ahí. Las invitaciones a Pit (inicio, catálogo) abren el mismo panel.
 *
 * `abierto` es si el panel flotante está a la vista.
 */
const PitContext = createContext(null);

export function PitProvider({ children }) {
  const { vehiculoActivo } = useVehicle();
  const conversacion = useConversacionPit(vehiculoActivo);
  const [abierto, setAbierto] = useState(false);

  const abrir = useCallback(() => setAbierto(true), []);
  const cerrar = useCallback(() => setAbierto(false), []);

  // Al cerrar sesión: se cierra el panel y se borra la charla, para que
  // el próximo que use la compu no la vea.
  const { reiniciar } = conversacion;
  const olvidar = useCallback(() => {
    setAbierto(false);
    reiniciar();
  }, [reiniciar]);

  const value = { vehiculo: vehiculoActivo, conversacion, abierto, abrir, cerrar, olvidar };

  return <PitContext.Provider value={value}>{children}</PitContext.Provider>;
}

export function usePit() {
  const ctx = useContext(PitContext);

  if (!ctx) {
    throw new Error("usePit debe usarse dentro de <PitProvider>");
  }

  return ctx;
}
