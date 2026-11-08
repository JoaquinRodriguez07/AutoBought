// El panel lateral de Pit, el asistente con IA.

import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import PitChat from "./PitChat";
import { PitIcon } from "./Icons";
import { usePit } from "./context/PitContext";
import { useVehicle } from "./context/VehicleContext";

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
const LABEL_SECONDS = 6;

export default function PitPanel({ onDetail, onSearchInCatalogo }) {
  const { vehicle, conversation, isOpen, borrador, open, close } = usePit();
  const { activateVehicle } = useVehicle();
  const button = useRef(null);
  const wasOpen = useRef(isOpen);
  const hasChat = conversation.messages.length > 0;
  // Al aparecer, el botón late dos veces para que se note; después queda
  // quieto. Una vez que el cliente lo abrió, ya sabe que está ahí.
  const [saludar, setSaludar] = useState(true);
  // El globito se ve unos segundos al aparecer; después, solo al pasar el
  // mouse o con el foco en el botón, para no tapar lo que hay abajo.
  const [label, setLabel] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setLabel(false), LABEL_SECONDS * 1000);
    return () => clearTimeout(timer);
  }, []);
  // Si se cambia de página con el panel abierto (por ejemplo, "Ver carrito"
  // en el aviso de agregado), se cierra: la charla queda guardada.
  const { pathname } = useLocation();
  const previousPage = useRef(pathname);
  useEffect(() => {
    if (previousPage.current === pathname) return;
    previousPage.current = pathname;
    close();
  }, [pathname, close]);

  const openPanel = () => {
    setSaludar(false);
    open();
  };

  useEffect(() => {
    if (!isOpen) {
      // Al cerrar, el foco vuelve al botón que lo abrió.
      if (wasOpen.current) button.current?.focus();
      wasOpen.current = false;
      return undefined;
    }
    wasOpen.current = true;

    const withEscape = (e) => {
      if (e.key === "Escape") close();
    };
    // La página de atrás no se mueve mientras el panel está abierto.
    const overflowPrevious = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", withEscape);
    return () => {
      document.body.style.overflow = overflowPrevious;
      document.removeEventListener("keydown", withEscape);
    };
  }, [isOpen, close]);

  // Cierra el panel y después navega.
  const andClose = (action) => (...args) => {
    close();
    action?.(...args);
  };

  if (!isOpen) {
    return (
      <div className="group fixed right-4 bottom-4 md:right-8 md:bottom-7 z-40 flex items-center gap-3">
        <button
          type="button"
          onClick={openPanel}
          tabIndex={-1}
          aria-hidden="true"
          className={`hidden ${label ? "md:block" : "md:group-hover:block md:group-focus-within:block"} bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-bold shadow-lg hover:border-orange-500 transition motion-safe:animate-aparecer`}
        >
          {hasChat ? "Seguir con Pit" : "¿Te puedo ayudar en algo?"}
        </button>
        <button
          ref={button}
          type="button"
          onClick={openPanel}
          aria-label={hasChat ? "Seguir la conversación con Pit" : "Abrir Pit, el asistente con IA"}
          className="relative w-12 h-12 md:w-16 md:h-16 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white shadow-lg flex items-center justify-center transition"
        >
          {saludar && !hasChat && (
            <span
              aria-hidden="true"
              data-testid="latido-pit"
              className="absolute inset-0 rounded-2xl bg-orange-500 opacity-0 motion-safe:animate-llamar"
            />
          )}
          <PitIcon className="relative w-6 h-6 md:w-8 md:h-8" />
          {hasChat && (
            <span aria-hidden="true" className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-green-500 border-2 border-white" />
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50">
      <div aria-hidden="true" data-testid="fondo-pit" onClick={close} className="absolute inset-0 bg-black/45 motion-safe:animate-aparecer" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Pit, tu mecánico con IA"
        className="absolute inset-y-0 right-0 w-full sm:w-[440px] shadow-2xl motion-safe:animate-entrar-derecha"
      >
        <PitChat
          vehicle={vehicle}
          conversation={conversation}
          autoFocus
          onClose={close}
          onDetail={andClose(onDetail)}
          onActivateVehicle={activateVehicle}
          initialText={borrador}
          onSearchInCatalogo={andClose(onSearchInCatalogo)}
        />
      </div>
    </div>
  );
}
