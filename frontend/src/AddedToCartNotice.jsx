import { useEffect, useRef, useState } from "react";
import { useGenericImage } from "./mapPart";
import { CloseIcon, CheckIcon } from "./Icons";

// Cuánto queda a la vista el aviso antes de irse solo.
export const NOTICE_DURATION_MS = 5000;

const price = (rawValue) => `$${Number(rawValue || 0).toLocaleString("es-UY")}`;

/**
 * ConfirmacionAgregarCarrito
 * ==========================================
 * Aviso chico (abajo a la derecha; en celular, abajo a lo ancho) que
 * confirma que un repuesto se agregó al carrito. No tapa la página y se
 * va solo a los pocos segundos; mientras el mouse (o el foco del
 * teclado) está encima, espera. También se cierra con Escape.
 *
 * Lo renderiza CartContext, así sale igual desde cualquier pantalla. Hay
 * uno solo a la vez: si se vuelve a agregar el mismo repuesto, el aviso
 * se actualiza ("×3") y vuelve a contar en lugar de apilar otro.
 *
 * `aviso` puede ser:
 *   - { tipo: "agregado", producto, cantidadAgregada }
 *   - { tipo: "login" }  → se quiso agregar sin sesión iniciada
 *
 * El contenedor con `aria-live` se renderiza siempre (aunque esté
 * vacío) para que los lectores de pantalla anuncien el aviso cuando
 * aparece: si la región nace junto con el texto, muchos no lo leen.
 */
export default function AddedToCartNotice({
  aviso,
  cartQuantity,
  total,
  onUndo,
  onClose,
  onSeeCart,
  onStartSession,
}) {
  const [paused, setPaused] = useState(false);

  // Al cerrarse, la pausa se descarta. Si no, al cerrar uno con el mouse
  // encima (Deshacer, ✕) nunca llega el mouseLeave y el siguiente no se
  // iría solo. Mientras sigue abierto (por ejemplo, "×3") la pausa se
  // respeta.
  if (!aviso && paused) {
    setPaused(false);
  }

  // Quien lo usa puede pasar `onCerrar` como función nueva en cada
  // render: se guarda en una ref para que eso no reinicie la cuenta.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!aviso || paused) return;
    const temporizador = setTimeout(() => close.current(), NOTICE_DURATION_MS);
    return () => clearTimeout(temporizador);
  }, [aviso, paused]);

  useEffect(() => {
    if (!aviso) return;
    const closeWithEscape = (event) => {
      if (event.key === "Escape") close.current();
    };
    document.addEventListener("keydown", closeWithEscape);
    return () => document.removeEventListener("keydown", closeWithEscape);
  }, [aviso]);

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="fixed z-[60] bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 sm:w-[360px] pointer-events-none"
    >
      {aviso && (
        <div
          role="status"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
          className="pointer-events-auto rounded-xl bg-[#151719] text-white shadow-2xl p-4 motion-safe:animate-entrar-aviso"
        >
          {aviso.tipo === "login" ? (
            <LoginContent onStartSession={onStartSession} onClose={onClose} />
          ) : (
            <AddedContent
              aviso={aviso}
              cartQuantity={cartQuantity}
              total={total}
              onUndo={onUndo}
              onClose={onClose}
              onSeeCart={onSeeCart}
            />
          )}
        </div>
      )}
    </div>
  );
}

function CloseButton({ onClose }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Cerrar aviso"
      className="text-gray-400 hover:text-white"
    >
      <CloseIcon />
    </button>
  );
}

function AddedContent({
  aviso,
  cartQuantity,
  total,
  onUndo,
  onClose,
  onSeeCart,
}) {
  const { product, addedQuantity } = aviso;

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-black">
          <span className="w-5 h-5 rounded-full bg-green-600 flex items-center justify-center">
            <CheckIcon className="w-3 h-3" />
          </span>
          Agregado al carrito
        </p>
        <CloseButton onClose={onClose} />
      </div>

      <div className="mt-3 flex gap-3">
        <img onError={useGenericImage}
          src={product.image}
          alt=""
          className="w-14 h-14 shrink-0 rounded-md object-cover bg-white/10"
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold truncate" title={product.displayName}>
            {product.displayName}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {price(product.price)} · ×{addedQuantity}
          </p>
        </div>
      </div>

      <p className="mt-3 pt-3 border-t border-white/10 text-xs text-gray-400">
        Tu carrito ({cartQuantity} {cartQuantity === 1 ? "producto" : "productos"}):{" "}
        <span className="font-black text-white">{price(total)}</span>
      </p>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-md border border-white/20 py-2 text-sm font-bold text-gray-200 hover:border-orange-500 hover:text-orange-400 transition"
        >
          Seguir comprando
        </button>
        <button
          type="button"
          onClick={onSeeCart}
          className="flex-1 rounded-md bg-orange-500 py-2 text-sm font-bold text-white hover:bg-orange-600 transition"
        >
          Ver carrito
        </button>
      </div>

      <button
        type="button"
        onClick={onUndo}
        className="mt-2 w-full text-center text-xs text-gray-400 underline hover:text-orange-400"
      >
        Deshacer
      </button>
    </>
  );
}

function LoginContent({ onStartSession, onClose }) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-black">
          Iniciá sesión para agregar productos al carrito.
        </p>
        <CloseButton onClose={onClose} />
      </div>
      <button
        type="button"
        onClick={onStartSession}
        className="mt-3 w-full rounded-md bg-orange-500 py-2 text-sm font-bold text-white hover:bg-orange-600 transition"
      >
        Iniciar sesión
      </button>
    </>
  );
}
