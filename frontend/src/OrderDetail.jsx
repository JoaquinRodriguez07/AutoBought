// Detalle de un pedido del cliente: seguimiento, pago, productos y envío.

import { useState } from "react";

import { confirmReceipt, createPaymentLink } from "./api";
import { AlertIcon, CheckIcon } from "./Icons";
import { paymentDeadlineText } from "./paymentDeadline";
import { goTo } from "./redirect";
import {
  STATUS_NAME,
  INCOMPLETE_PAYMENT,
  cancelledByStore,
  isUnpaid,
  formatDateTime,
  formatPrice,
  trackingSteps,
  expiredUnpaid,
} from "./orderTracking";
import { ProductPhoto } from "./ActiveOrderCard";

const STATUS_CLASSES = {
  confirmed: "bg-blue-50 text-blue-700 ring-blue-200",
  packing: "bg-violet-50 text-violet-700 ring-violet-200",
  shipped: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  delivered: "bg-green-50 text-green-700 ring-green-200",
  cancelled: "bg-gray-50 text-gray-500 ring-gray-200",
};

const PENDING_PAYMENT = { texto: "Pendiente de pago", clase: "bg-amber-50 text-amber-800 ring-amber-200" };

/**
 * La etiqueta del pedido. Mientras no se pagó, eso es lo que importa: el
 * estado del envío ("Confirmado") se ve recién con el pago aprobado.
 */
export function OrderStatusBadge({ compra }) {
  const { texto, clase } = isUnpaid(compra)
    ? PENDING_PAYMENT
    : {
        texto: STATUS_NAME[compra.estado] ?? "Sin estado",
        clase: STATUS_CLASSES[compra.estado] ?? "bg-gray-50 text-gray-500 ring-gray-200",
      };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide whitespace-nowrap ring-1 ring-inset ${clase}`}>
      {texto}
    </span>
  );
}

function Timeline({ compra }) {
  const pasos = trackingSteps(compra);
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
      <h3 className="text-xs font-black uppercase text-gray-500 mb-4">Seguimiento</h3>
      <ol aria-label="Seguimiento del pedido" className="grid grid-cols-1 sm:grid-flow-col sm:auto-cols-fr gap-4">
        {pasos.map((paso, indice) => {
          const cancelado = paso.estado === "cancelled";
          const color = cancelado
            ? "bg-gray-400 text-white"
            : paso.hecho
              ? "bg-orange-500 text-white"
              : "bg-white text-gray-300 ring-2 ring-inset ring-gray-200";
          return (
            <li
              key={paso.estado}
              aria-current={indice === pasos.length - 1 || (paso.hecho && !pasos[indice + 1]?.hecho) ? "step" : undefined}
              className="flex sm:flex-col items-center sm:text-center gap-3 sm:gap-2"
            >
              <span className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center ${color}`}>
                {paso.hecho ? (
                  <CheckIcon className="w-4 h-4" />
                ) : (
                  <span className="text-xs font-black">{indice + 1}</span>
                )}
              </span>
              <div>
                <p className={`text-sm font-bold ${paso.hecho ? "text-gray-900" : "text-gray-400"}`}>
                  {STATUS_NAME[paso.estado] ?? paso.estado}
                </p>
                {paso.hecho && paso.fecha && (
                  <p className="text-xs text-gray-500 mt-0.5">{formatDateTime(paso.fecha)}</p>
                )}
                {!paso.hecho && <p className="text-xs text-gray-400 mt-0.5">Pendiente</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function addressText(d) {
  const apartamento = d.apartamento ? ` apto ${d.apartamento}` : "";
  return `${d.calle} ${d.numero}${apartamento}, ${d.ciudad}, ${d.departamento}`;
}

const primaryButton =
  "h-10 px-5 shrink-0 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold transition whitespace-nowrap disabled:opacity-40";

/**
 * El detalle de un pedido, igual en las dos pestañas de «Mis compras»
 * (en curso y anteriores): qué falta (pagar o avisar que llegó), la línea de tiempo, los
 * productos, el envío y el total.
 *
 * Props:
 *  - compra       el pedido (ver mapearPedido en api.js)
 *  - onVolver     vuelve a la lista
 *  - textoVolver  el texto de ese botón
 *  - onActualizado(compra)  después de «Ya lo recibí», con el pedido entregado
 */
export default function OrderDetail({ compra, onVolver, textoVolver, onActualizado }) {
  const [error, setError] = useState("");
  const [pagando, setPagando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [recibido, setRecibido] = useState(false);

  const pagar = async () => {
    setPagando(true);
    setError("");
    try {
      goTo(await createPaymentLink(compra.id));
    } catch (errorPago) {
      setError(errorPago.message || "No pudimos abrir Mercado Pago.");
      setPagando(false);
    }
  };

  const confirmarLlegada = async () => {
    setConfirmando(true);
    setError("");
    try {
      const entregada = await confirmReceipt(compra.id);
      setRecibido(true);
      onActualizado?.(entregada);
    } catch (errorRecepcion) {
      setError(errorRecepcion.message || "No pudimos confirmar la llegada del pedido.");
    } finally {
      setConfirmando(false);
    }
  };

  return (
    <section aria-label={`Detalle del pedido ${compra.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <button type="button" onClick={onVolver} className="text-orange-500 text-sm font-bold hover:underline">
          {textoVolver}
        </button>
        <OrderStatusBadge compra={compra} />
      </div>

      {error && (
        <p role="alert" className="bg-red-50 border border-red-200 text-red-600 rounded-md px-4 py-3 text-sm font-bold mb-6">
          {error}
        </p>
      )}

      {isUnpaid(compra) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex gap-3">
            <AlertIcon className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
            <div>
              <p className="text-sm font-black text-gray-900">
                {compra.estadoPago === "rejected" ? "El pago fue rechazado" : "Este pedido todavía no está pagado"}
              </p>
              <p className="text-sm text-gray-600 mt-1">
                {compra.vencePago
                  ? `Tus repuestos quedan reservados hasta ${paymentDeadlineText(compra.vencePago)}. Si no se paga, el pedido se cancela solo.`
                  : "Tus repuestos quedan reservados mientras completás el pago."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={pagar}
            disabled={pagando}
            aria-label={`Pagar el pedido #${compra.id} con Mercado Pago`}
            className={primaryButton}
          >
            {pagando ? "Abriendo..." : "Pagar con Mercado Pago"}
          </button>
        </div>
      )}

      {compra.estado === "shipped" && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-sm font-black text-gray-900">Tu pedido está en camino</p>
            <p className="text-sm text-gray-600 mt-1">Cuando te llegue, avisanos para darlo por entregado.</p>
          </div>
          <button type="button" onClick={confirmarLlegada} disabled={confirmando} className={primaryButton}>
            {confirmando ? "Confirmando..." : "Ya lo recibí"}
          </button>
        </div>
      )}

      {recibido && compra.estado === "delivered" && (
        <p role="status" className="bg-green-50 border border-green-200 text-green-700 rounded-md px-4 py-3 text-sm font-bold mb-6">
          ¡Listo! Marcamos el pedido como entregado. Te mandamos un mail con el resumen.
        </p>
      )}

      {cancelledByStore(compra) && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
          <p className="text-sm font-black text-gray-900">La tienda canceló este pedido</p>
          {compra.detalleCancelacion && (
            <p className="text-sm text-gray-600 mt-1">Motivo: {compra.detalleCancelacion}</p>
          )}
          <p className="text-sm text-gray-600 mt-1">
            Si ya lo habías pagado, te devolvemos el dinero. El reintegro puede tardar unos días en verse.
          </p>
        </div>
      )}

      {!isUnpaid(compra) && <Timeline compra={compra} />}

      {expiredUnpaid(compra) && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
          <p className="text-sm font-black text-gray-900">
            Este pedido se canceló porque no se completó el pago a tiempo
          </p>
          <p className="text-sm text-gray-600 mt-1">
            No se te cobró nada. Si todavía querés los repuestos, podés volver a comprarlos desde el catálogo.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        <div className="bg-white border border-gray-200 rounded-xl">
          <h3 className="text-xs font-black uppercase text-gray-500 px-5 pt-5">Productos</h3>
          <ul className="divide-y divide-gray-100 px-5">
            {(compra.items || []).map((producto, index) => (
              <li key={producto.partId || index} className="flex items-center gap-4 py-4">
                <ProductPhoto producto={producto} clase="w-16 h-16" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900">{producto.nombre || "Producto"}</p>
                  {producto.codigo && <p className="text-xs text-gray-400 mt-0.5">Código: {producto.codigo}</p>}
                  <p className="text-xs text-gray-500 mt-1">
                    {`Cantidad: ${producto.cantidad} · ${formatPrice(producto.precio)} c/u`}
                  </p>
                </div>
                <p className="text-sm font-black whitespace-nowrap">
                  {formatPrice(producto.precio * producto.cantidad)}
                </p>
              </li>
            ))}
          </ul>
        </div>

        <aside className="bg-white border border-gray-200 rounded-xl p-5 h-fit space-y-5">
          {compra.direccion && (
            <div>
              <p className="text-xs font-black uppercase text-gray-500">Envío</p>
              <p className="text-sm text-gray-700 mt-1">{addressText(compra.direccion)}</p>
            </div>
          )}
          {compra.metodoPago && (
            <div>
              <p className="text-xs font-black uppercase text-gray-500">Pago</p>
              <p className="text-sm text-gray-700 mt-1">
                {compra.metodoPago}
                {isUnpaid(compra) && ` (${INCOMPLETE_PAYMENT[compra.estadoPago]})`}
                {expiredUnpaid(compra) && " (no se completó)"}
              </p>
            </div>
          )}
          <div className="border-t border-gray-200 pt-4 flex justify-between items-end">
            <span className="text-sm font-bold">Total</span>
            <span className="text-2xl font-black text-orange-500">{formatPrice(compra.total)}</span>
          </div>
        </aside>
      </div>
    </section>
  );
}
