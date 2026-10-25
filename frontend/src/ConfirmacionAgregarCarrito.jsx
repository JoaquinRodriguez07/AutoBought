import { useEffect, useRef, useState } from "react";
import { IconoCerrar, IconoCheck } from "./Iconos";

// Cuánto queda a la vista el aviso antes de irse solo.
export const DURACION_AVISO_MS = 5000;

const precio = (valor) => `$${Number(valor || 0).toLocaleString("es-UY")}`;

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
export default function ConfirmacionAgregarCarrito({
  aviso,
  cantidadCarrito,
  total,
  onDeshacer,
  onCerrar,
  onVerCarrito,
  onIniciarSesion,
}) {
  const [pausado, setPausado] = useState(false);

  // Al cerrarse, la pausa se descarta. Si no, al cerrar uno con el mouse
  // encima (Deshacer, ✕) nunca llega el mouseLeave y el siguiente no se
  // iría solo. Mientras sigue abierto (por ejemplo, "×3") la pausa se
  // respeta.
  if (!aviso && pausado) {
    setPausado(false);
  }

  // Quien lo usa puede pasar `onCerrar` como función nueva en cada
  // render: se guarda en una ref para que eso no reinicie la cuenta.
  const cerrar = useRef(onCerrar);
  useEffect(() => {
    cerrar.current = onCerrar;
  }, [onCerrar]);

  useEffect(() => {
    if (!aviso || pausado) return;
    const temporizador = setTimeout(() => cerrar.current(), DURACION_AVISO_MS);
    return () => clearTimeout(temporizador);
  }, [aviso, pausado]);

  useEffect(() => {
    if (!aviso) return;
    const cerrarConEscape = (event) => {
      if (event.key === "Escape") cerrar.current();
    };
    document.addEventListener("keydown", cerrarConEscape);
    return () => document.removeEventListener("keydown", cerrarConEscape);
  }, [aviso]);

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="fixed z-[60] bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 sm:w-[360px] pointer-events-none"
    >
      {aviso && (
        <div
          onMouseEnter={() => setPausado(true)}
          onMouseLeave={() => setPausado(false)}
          onFocus={() => setPausado(true)}
          onBlur={() => setPausado(false)}
          className="pointer-events-auto rounded-xl bg-[#151719] text-white shadow-2xl p-4 motion-safe:animate-entrar-aviso"
        >
          {aviso.tipo === "login" ? (
            <ContenidoLogin onIniciarSesion={onIniciarSesion} onCerrar={onCerrar} />
          ) : (
            <ContenidoAgregado
              aviso={aviso}
              cantidadCarrito={cantidadCarrito}
              total={total}
              onDeshacer={onDeshacer}
              onCerrar={onCerrar}
              onVerCarrito={onVerCarrito}
            />
          )}
        </div>
      )}
    </div>
  );
}

function BotonCerrar({ onCerrar }) {
  return (
    <button
      type="button"
      onClick={onCerrar}
      aria-label="Cerrar aviso"
      className="text-gray-400 hover:text-white"
    >
      <IconoCerrar />
    </button>
  );
}

function ContenidoAgregado({
  aviso,
  cantidadCarrito,
  total,
  onDeshacer,
  onCerrar,
  onVerCarrito,
}) {
  const { producto, cantidadAgregada } = aviso;

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-black">
          <span className="w-5 h-5 rounded-full bg-green-600 flex items-center justify-center">
            <IconoCheck className="w-3 h-3" />
          </span>
          Agregado al carrito
        </p>
        <BotonCerrar onCerrar={onCerrar} />
      </div>

      <div className="mt-3 flex gap-3">
        <img
          src={producto.imagen}
          alt=""
          className="w-14 h-14 shrink-0 rounded-md object-cover bg-white/10"
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold truncate" title={producto.nombre}>
            {producto.nombre}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {precio(producto.precio)} · ×{cantidadAgregada}
          </p>
        </div>
      </div>

      <p className="mt-3 pt-3 border-t border-white/10 text-xs text-gray-400">
        Tu carrito ({cantidadCarrito} {cantidadCarrito === 1 ? "producto" : "productos"}):{" "}
        <span className="font-black text-white">{precio(total)}</span>
      </p>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onCerrar}
          className="flex-1 rounded-md border border-white/20 py-2 text-xs font-black text-gray-200 hover:border-orange-500 hover:text-orange-400 transition"
        >
          Seguir comprando
        </button>
        <button
          type="button"
          onClick={onVerCarrito}
          className="flex-1 rounded-md bg-orange-500 py-2 text-xs font-black text-white hover:bg-orange-600 transition"
        >
          Ver carrito
        </button>
      </div>

      <button
        type="button"
        onClick={onDeshacer}
        className="mt-2 w-full text-center text-xs text-gray-400 underline hover:text-orange-400"
      >
        Deshacer
      </button>
    </>
  );
}

function ContenidoLogin({ onIniciarSesion, onCerrar }) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-black">
          Iniciá sesión para agregar productos al carrito.
        </p>
        <BotonCerrar onCerrar={onCerrar} />
      </div>
      <button
        type="button"
        onClick={onIniciarSesion}
        className="mt-3 w-full rounded-md bg-orange-500 py-2 text-xs font-black text-white hover:bg-orange-600 transition"
      >
        Iniciar sesión
      </button>
    </>
  );
}
