import { useEffect, useRef } from "react";

import ChatPit from "./ChatPit";
import { IconoPit } from "./Iconos";
import { usePit } from "./context/PitContext";

/**
 * PanelPit
 * ==========================================
 * Pit en todo el sitio: un botón flotante abajo a la derecha que abre la
 * conversación en un panel lateral, sin salir de la página. En celular el
 * panel ocupa toda la pantalla.
 *
 * Es un diálogo: tapa la página (se cierra tocando afuera, con Escape o
 * con la cruz), el foco entra al chat al abrir y vuelve al botón al cerrar.
 * Las acciones que llevan a otra página (ver un repuesto, el carrito, el
 * catálogo) cierran el panel; la charla queda guardada en PitContext.
 */
export default function PanelPit({ onDetalle, onElegirVehiculo, onBuscarEnCatalogo, onVerCarrito }) {
  const { vehiculo, conversacion, abierto, abrir, cerrar } = usePit();
  const boton = useRef(null);
  const estabaAbierto = useRef(abierto);
  const hayCharla = conversacion.mensajes.length > 0;

  useEffect(() => {
    if (!abierto) {
      // Al cerrar, el foco vuelve al botón que lo abrió.
      if (estabaAbierto.current) boton.current?.focus();
      estabaAbierto.current = false;
      return undefined;
    }
    estabaAbierto.current = true;

    const conEscape = (e) => {
      if (e.key === "Escape") cerrar();
    };
    // La página de atrás no se mueve mientras el panel está abierto.
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", conEscape);
    return () => {
      document.body.style.overflow = overflowAnterior;
      document.removeEventListener("keydown", conEscape);
    };
  }, [abierto, cerrar]);

  // Cierra el panel y después navega.
  const yCerrar = (accion) => (...args) => {
    cerrar();
    accion?.(...args);
  };

  if (!abierto) {
    return (
      <div className="fixed right-4 bottom-4 md:right-8 md:bottom-7 z-40 flex items-center gap-3">
        <button
          type="button"
          onClick={abrir}
          tabIndex={-1}
          aria-hidden="true"
          className="hidden md:block bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-bold shadow-lg hover:border-orange-500 transition"
        >
          {hayCharla ? "Seguir con Pit" : "¿Qué le pasa a tu auto?"}
        </button>
        <button
          ref={boton}
          type="button"
          onClick={abrir}
          aria-label={hayCharla ? "Seguir la conversación con Pit" : "Abrir Pit, el asistente con IA"}
          className="relative w-16 h-16 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white shadow-lg flex items-center justify-center transition"
        >
          {/* El latido llama la atención solo mientras no hay charla. */}
          {!hayCharla && (
            <span aria-hidden="true" className="absolute inset-0 rounded-2xl bg-orange-500 opacity-60 motion-safe:animate-ping" />
          )}
          <IconoPit className="relative w-8 h-8" />
          {hayCharla && (
            <span aria-hidden="true" className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-green-500 border-2 border-white" />
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50">
      <div aria-hidden="true" data-testid="fondo-pit" onClick={cerrar} className="absolute inset-0 bg-black/45 motion-safe:animate-aparecer" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Pit, tu mecánico con IA"
        className="absolute inset-y-0 right-0 w-full sm:w-[440px] shadow-2xl motion-safe:animate-entrar-derecha"
      >
        <ChatPit
          vehiculo={vehiculo}
          conversacion={conversacion}
          autoFocus
          onCerrar={cerrar}
          onDetalle={yCerrar(onDetalle)}
          onElegirVehiculo={yCerrar(onElegirVehiculo)}
          onBuscarEnCatalogo={yCerrar(onBuscarEnCatalogo)}
          onVerCarrito={yCerrar(onVerCarrito)}
        />
      </div>
    </div>
  );
}
