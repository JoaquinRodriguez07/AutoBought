import { useEffect, useRef, useState } from "react";

// Cuánto queda a la vista el aviso antes de irse solo.
export const DURACION_AVISO_MS = 5000;

/**
 * ConfirmacionAgregarCarrito
 * ==========================================
 * Aviso chico (abajo a la derecha; en celular, abajo a lo ancho) que
 * confirma que un repuesto se agregó al carrito. No tapa la página y se
 * va solo a los pocos segundos; mientras el mouse está encima, espera.
 * Si se agrega otro repuesto, el aviso se reemplaza y vuelve a contar.
 */
export default function ConfirmacionAgregarCarrito({
  producto,
  onDeshacer,
  onCerrar,
  onVerCarrito,
}) {
  const [pausado, setPausado] = useState(false);

  // Quien lo usa pasa `onCerrar` como función nueva en cada render: se
  // guarda en una ref para que eso no reinicie la cuenta.
  const cerrar = useRef(onCerrar);
  useEffect(() => {
    cerrar.current = onCerrar;
  }, [onCerrar]);

  useEffect(() => {
    if (!producto || pausado) return;
    const temporizador = setTimeout(() => cerrar.current(), DURACION_AVISO_MS);
    return () => clearTimeout(temporizador);
  }, [producto, pausado]);

  if (!producto) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      className="fixed z-[60] bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 sm:w-[360px] rounded-xl bg-[#151719] text-white shadow-2xl p-4"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black">Agregado al carrito</p>
          <p className="mt-0.5 text-xs text-gray-400 truncate">{producto.nombre}</p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar aviso"
          className="text-gray-400 hover:text-white leading-none text-lg"
        >
          ✕
        </button>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={async () => {
            await onDeshacer(producto);
            onCerrar();
          }}
          className="flex-1 rounded-md border border-white/20 py-2 text-xs font-black text-gray-200 hover:border-orange-500 hover:text-orange-400 transition"
        >
          Deshacer
        </button>
        <button
          type="button"
          onClick={onVerCarrito}
          className="flex-1 rounded-md bg-orange-500 py-2 text-xs font-black text-white hover:bg-orange-600 transition"
        >
          Ver carrito
        </button>
      </div>
    </div>
  );
}
