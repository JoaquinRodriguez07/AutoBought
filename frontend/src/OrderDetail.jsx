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
  ready_for_pickup: "bg-orange-50 text-orange-700 ring-orange-200",
  delivered: "bg-green-50 text-green-700 ring-green-200",
  cancelled: "bg-gray-50 text-gray-500 ring-gray-200",
};

const PENDING_PAYMENT = { texto: "Pendiente de pago", clase: "bg-amber-50 text-amber-800 ring-amber-200" };

/**
 * La etiqueta del pedido. Mientras no se pagó, eso es lo que importa: el
 * estado del envío ("Confirmado") se ve recién con el pago aprobado.
 */
export function OrderStatusBadge({ purchase }) {
  const { texto, clase } = isUnpaid(purchase)
    ? PENDING_PAYMENT
    : {
        texto: STATUS_NAME[purchase.estado] ?? "Sin estado",
        clase: STATUS_CLASSES[purchase.estado] ?? "bg-gray-50 text-gray-500 ring-gray-200",
      };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide whitespace-nowrap ring-1 ring-inset ${clase}`}>
      {texto}
    </span>
  );
}

function Timeline({ purchase }) {
  const steps = trackingSteps(purchase);
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
      <h3 className="text-xs font-black uppercase text-gray-500 mb-4">Seguimiento</h3>
      <ol aria-label="Seguimiento del pedido" className="grid grid-cols-1 sm:grid-flow-col sm:auto-cols-fr gap-4">
        {steps.map((step, indice) => {
          const cancelled = step.estado === "cancelled";
          const color = cancelled
            ? "bg-gray-400 text-white"
            : step.hecho
              ? "bg-orange-500 text-white"
              : "bg-white text-gray-300 ring-2 ring-inset ring-gray-200";
          return (
            <li
              key={step.estado}
              aria-current={indice === steps.length - 1 || (step.hecho && !steps[indice + 1]?.hecho) ? "step" : undefined}
              className="flex sm:flex-col items-center sm:text-center gap-3 sm:gap-2"
            >
              <span className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center ${color}`}>
                {step.hecho ? (
                  <CheckIcon className="w-4 h-4" />
                ) : (
                  <span className="text-xs font-black">{indice + 1}</span>
                )}
              </span>
              <div>
                <p className={`text-sm font-bold ${step.hecho ? "text-gray-900" : "text-gray-400"}`}>
                  {STATUS_NAME[step.estado] ?? step.estado}
                </p>
                {step.hecho && step.date && (
                  <p className="text-xs text-gray-500 mt-0.5">{formatDateTime(step.date)}</p>
                )}
                {!step.hecho && <p className="text-xs text-gray-400 mt-0.5">Pendiente</p>}
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
  return `${d.street} ${d.number}${apartamento}, ${d.city}, ${d.department}`;
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
export default function OrderDetail({ purchase, onGoBack, textGoBack, onUpdated }) {
  const [error, setError] = useState("");
  const [paying, setPaying] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [received, setReceived] = useState(false);

  const pay = async () => {
    setPaying(true);
    setError("");
    try {
      goTo(await createPaymentLink(purchase.id));
    } catch (paymentError) {
      setError(paymentError.message || "No pudimos abrir Mercado Pago.");
      setPaying(false);
    }
  };

  const confirmArrival = async () => {
    setConfirming(true);
    setError("");
    try {
      const delivered = await confirmReceipt(purchase.id);
      setReceived(true);
      onUpdated?.(delivered);
    } catch (errorRecepcion) {
      setError(errorRecepcion.message || "No pudimos confirmar la llegada del pedido.");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <section aria-label={`Detalle del pedido ${purchase.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <button type="button" onClick={onGoBack} className="text-orange-500 text-sm font-bold hover:underline">
          {textGoBack}
        </button>
        <OrderStatusBadge purchase={purchase} />
      </div>

      {error && (
        <p role="alert" className="bg-red-50 border border-red-200 text-red-600 rounded-md px-4 py-3 text-sm font-bold mb-6">
          {error}
        </p>
      )}

      {isUnpaid(purchase) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex gap-3">
            <AlertIcon className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
            <div>
              <p className="text-sm font-black text-gray-900">
                {purchase.paymentStatus === "rejected" ? "El pago fue rechazado" : "Este pedido todavía no está pagado"}
              </p>
              <p className="text-sm text-gray-600 mt-1">
                {purchase.expiresPayment
                  ? `Tus repuestos quedan reservados hasta ${paymentDeadlineText(purchase.expiresPayment)}. Si no se paga, el pedido se cancela solo.`
                  : "Tus repuestos quedan reservados mientras completás el pago."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={pay}
            disabled={paying}
            aria-label={`Pagar el pedido #${purchase.id} con Mercado Pago`}
            className={primaryButton}
          >
            {paying ? "Abriendo..." : "Pagar con Mercado Pago"}
          </button>
        </div>
      )}

      {purchase.estado === "ready_for_pickup" && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-5 mb-6">
          <p className="text-sm font-black">Tu pedido está listo para retirar</p>
          <p className="text-sm text-gray-600 mt-1">Pasá por el local en el horario indicado en el correo de aviso.</p>
        </div>
      )}

      {purchase.estado === "shipped" && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-sm font-black text-gray-900">Tu pedido está en camino</p>
            <p className="text-sm text-gray-600 mt-1">Cuando te llegue, avisanos para darlo por entregado.</p>
          </div>
          <button type="button" onClick={confirmArrival} disabled={confirming} className={primaryButton}>
            {confirming ? "Confirmando..." : "Ya lo recibí"}
          </button>
        </div>
      )}

      {received && purchase.estado === "delivered" && (
        <p role="status" className="bg-green-50 border border-green-200 text-green-700 rounded-md px-4 py-3 text-sm font-bold mb-6">
          ¡Listo! Marcamos el pedido como entregado. Te mandamos un mail con el resumen.
        </p>
      )}

      {cancelledByStore(purchase) && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
          <p className="text-sm font-black text-gray-900">La tienda canceló este pedido</p>
          {purchase.detailCancellation && (
            <p className="text-sm text-gray-600 mt-1">Motivo: {purchase.detailCancellation}</p>
          )}
          <p className="text-sm text-gray-600 mt-1">
            Si ya lo habías pagado, te devolvemos el dinero. El reintegro puede tardar unos días en verse.
          </p>
        </div>
      )}

      {!isUnpaid(purchase) && <Timeline purchase={purchase} />}

      {expiredUnpaid(purchase) && (
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
            {(purchase.items || []).map((product, index) => (
              <li key={product.partId || index} className="flex items-center gap-4 py-4">
                <ProductPhoto product={product} clase="w-16 h-16" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900">{product.displayName || "Producto"}</p>
                  {product.code && <p className="text-xs text-gray-400 mt-0.5">Código: {product.code}</p>}
                  <p className="text-xs text-gray-500 mt-1">
                    {`Cantidad: ${product.quantity} · ${formatPrice(product.price)} c/u`}
                  </p>
                </div>
                <p className="text-sm font-black whitespace-nowrap">
                  {formatPrice(product.price * product.quantity)}
                </p>
              </li>
            ))}
          </ul>
        </div>

        <aside className="bg-white border border-gray-200 rounded-xl p-5 h-fit space-y-5">
          {purchase.deliveryMethod === "pickup" && (
            <div><p className="text-xs font-black uppercase text-gray-500">Entrega</p>
              <p className="text-sm text-gray-700 mt-1">Retiro en el local. Revisá el mail para ver dirección y horario.</p></div>
          )}
          {purchase.shippingAddress && (
            <div>
              <p className="text-xs font-black uppercase text-gray-500">Envío</p>
              <p className="text-sm text-gray-700 mt-1">{addressText(purchase.shippingAddress)}</p>
            </div>
          )}
          {purchase.paymentMethod && (
            <div>
              <p className="text-xs font-black uppercase text-gray-500">Pago</p>
              <p className="text-sm text-gray-700 mt-1">
                {purchase.paymentMethod}
                {isUnpaid(purchase) && ` (${INCOMPLETE_PAYMENT[purchase.paymentStatus]})`}
                {expiredUnpaid(purchase) && " (no se completó)"}
              </p>
            </div>
          )}
          <div className="border-t border-gray-200 pt-4 flex justify-between items-end">
            <span className="text-sm font-bold">Total</span>
            <span className="text-2xl font-black text-orange-500">{formatPrice(purchase.total)}</span>
          </div>
        </aside>
      </div>
    </section>
  );
}
