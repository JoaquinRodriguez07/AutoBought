// La tarjeta de un pedido en curso, con su progreso.

import { IconoCheck } from "./Iconos";
import { imagenDeRepuesto, usarImagenGenerica } from "./mapearRepuesto";
import { pagaloAntesDe } from "./plazoPago";
import {
  NOMBRE_ESTADO,
  faltaPagar,
  formatearFecha,
  formatearPrecio,
  fraseDelEstado,
  pasosDeSeguimiento,
  textoProductos,
} from "./seguimientoPedido";

// Cuántas fotos de productos se ven en cada pedido.
const MINIATURAS = 3;

export function FotoProducto({ producto, clase }) {
  return (
    <div className={`shrink-0 bg-gray-50 border border-gray-100 rounded-md overflow-hidden ${clase}`}>
      <img
        onError={usarImagenGenerica}
        src={imagenDeRepuesto(producto.nombre || "")}
        alt=""
        className="w-full h-full object-contain p-1"
      />
    </div>
  );
}

export function Miniaturas({ items }) {
  if (!items?.length) return null;
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="flex gap-2">
        {items.slice(0, MINIATURAS).map((producto, index) => (
          <FotoProducto key={producto.partId || index} producto={producto} clase="w-14 h-14" />
        ))}
        {items.length > MINIATURAS && (
          <div className="w-14 h-14 shrink-0 rounded-md bg-gray-50 border border-gray-100 flex items-center justify-center text-xs font-black text-gray-500">
            +{items.length - MINIATURAS}
          </div>
        )}
      </div>
      <p className="text-sm text-gray-700 truncate">{textoProductos(items)}</p>
    </div>
  );
}

/** Las cuatro etapas en una barrita: hechas en naranja, las que faltan en gris. */
export function BarraProgreso({ compra }) {
  const pasos = pasosDeSeguimiento(compra);
  const hechos = pasos.filter((paso) => paso.hecho).length;
  return (
    <ol
      aria-label={`Progreso del pedido #${compra.id}: ${hechos} de ${pasos.length} etapas`}
      className="grid grid-cols-4 mt-5"
    >
      {pasos.map((paso, indice) => (
        <li key={paso.estado} className="relative flex flex-col items-center text-center">
          {/* La línea hacia la etapa anterior. */}
          {indice > 0 && (
            <span
              aria-hidden="true"
              className={`absolute top-2.5 right-1/2 w-full h-0.5 ${paso.hecho ? "bg-orange-500" : "bg-gray-200"}`}
            />
          )}
          <span
            className={`relative z-10 w-5 h-5 rounded-full flex items-center justify-center ${
              paso.hecho ? "bg-orange-500 text-white" : "bg-white ring-2 ring-inset ring-gray-200"
            }`}
          >
            {paso.hecho && <IconoCheck className="w-3 h-3" />}
          </span>
          <span className={`mt-1.5 px-0.5 text-xs sm:text-xs leading-tight break-words ${paso.hecho ? "font-bold text-gray-900" : "text-gray-500"}`}>
            {NOMBRE_ESTADO[paso.estado]}
          </span>
        </li>
      ))}
    </ol>
  );
}

const botonPrincipal =
  "h-10 px-5 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold transition whitespace-nowrap disabled:opacity-40";

/**
 * Un pedido que todavía no terminó, en «Mis pedidos»: qué pasa ahora con
 * él (en grande), la barrita de progreso y lo que se puede hacer (pagar o
 * avisar que llegó).
 */
export default function TarjetaPedidoEnCurso({
  compra,
  onVerDetalle,
  onPagar,
  onRecibido,
  pagando = false,
  confirmando = false,
  ocupado = false,
}) {
  const sinPagar = faltaPagar(compra);
  const plazo = sinPagar && compra.vencePago ? pagaloAntesDe(compra.vencePago) : "";

  return (
    <li className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 shadow-xs hover:border-gray-300 transition">
      {/* Sin flex-wrap: el precio queda siempre arriba a la derecha y,
          si no entra, la frase baja de renglón. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-base sm:text-lg font-black leading-snug ${sinPagar ? "text-amber-700" : "text-gray-900"}`}>
            {fraseDelEstado(compra)}
          </p>
          <p className="text-sm text-gray-500 mt-0.5">
            <span className="font-bold text-gray-700">Pedido #{compra.id}</span>
            <span className="mx-2 text-gray-300">·</span>
            {formatearFecha(compra.fecha)}
          </p>
        </div>
        <p className="shrink-0 text-base sm:text-lg font-black whitespace-nowrap">{formatearPrecio(compra.total)}</p>
      </div>

      {sinPagar ? (
        plazo && <p className="text-sm text-gray-600 mt-3">{plazo}. Si no se paga, el pedido se cancela solo.</p>
      ) : (
        <BarraProgreso compra={compra} />
      )}

      <div className="mt-5 flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex-1 min-w-0">
          <Miniaturas items={compra.items} />
        </div>
        <div className="flex items-center justify-between md:justify-end gap-4">
          {sinPagar && (
            <button
              type="button"
              onClick={() => onPagar(compra)}
              disabled={ocupado}
              aria-label={`Pagar el pedido #${compra.id} con Mercado Pago`}
              className={botonPrincipal}
            >
              {pagando ? "Abriendo..." : "Pagar"}
            </button>
          )}
          {compra.estado === "shipped" && (
            <button
              type="button"
              onClick={() => onRecibido(compra)}
              disabled={ocupado}
              aria-label={`Ya recibí el pedido #${compra.id}`}
              className={botonPrincipal}
            >
              {confirmando ? "Confirmando..." : "Ya lo recibí"}
            </button>
          )}
          <button
            type="button"
            onClick={() => onVerDetalle(compra)}
            aria-label={`Ver detalle del pedido #${compra.id}`}
            className="text-gray-600 text-sm font-bold hover:text-orange-500 whitespace-nowrap"
          >
            Ver detalle →
          </button>
        </div>
      </div>
    </li>
  );
}
