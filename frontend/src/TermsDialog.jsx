import { useEffect } from "react";
import TermsContent from "./TermsContent";

/**
 * Los términos y condiciones en una ventana encima del registro: se leen
 * sin salir del formulario ni abrir otra pestaña. «Aceptar» tilda el
 * casillero; «Cerrar», Escape o tocar afuera la cierran sin tildarlo.
 */
export default function TermsDialog({ onClose, onAccept }) {
  useEffect(() => {
    const closeWithEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeWithEscape);
    return () => document.removeEventListener("keydown", closeWithEscape);
  }, [onClose]);

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-terminos"
        className="w-full max-w-[640px] max-h-[85vh] flex flex-col bg-white rounded-xl shadow-2xl"
      >
        <h2 id="titulo-terminos" className="px-6 pt-6 pb-4 text-lg font-black border-b border-gray-100">
          Términos y condiciones
        </h2>
        {/* Solo el texto se desplaza: los botones quedan siempre a la vista. */}
        <div className="px-6 py-5 overflow-y-auto">
          <TermsContent headingLevel={3} />
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="px-5 h-10 rounded-md border border-gray-300 text-sm font-bold hover:border-orange-500"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="px-5 h-10 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold"
          >
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}
