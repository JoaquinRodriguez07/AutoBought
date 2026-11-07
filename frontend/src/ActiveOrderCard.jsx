// La tarjeta de un pedido en curso, con su progreso.

import { CheckIcon } from "./Icons";
import { partImage, useGenericImage } from "./mapPart";
import { payBefore } from "./paymentDeadline";
import {
  STATUS_NAME,
  isUnpaid,
  formatDate,
  formatPrice,
  statusPhrase,
  trackingSteps,
  productsText,
} from "./orderTracking";

// Cuántas fotos de productos se ven en cada pedido.
const THUMBNAILS = 3;

export function ProductPhoto({ product, clase }) {
  return (
    <div className={`shrink-0 bg-gray-50 border border-gray-100 rounded-md overflow-hidden ${clase}`}>
      <img
        onError={useGenericImage}
        src={partImage(product.displayName || "")}
        alt=""
        className="w-full h-full object-contain p-1"
      />
    </div>
  );
}

export function Thumbnails({ items }) {
  if (!items?.length) return null;
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="flex gap-2">
        {items.slice(0, THUMBNAILS).map((product, index) => (
          <ProductPhoto key={product.partId || index} product={product} clase="w-14 h-14" />
        ))}
        {items.length > THUMBNAILS && (
          <div className="w-14 h-14 shrink-0 rounded-md bg-gray-50 border border-gray-100 flex items-center justify-center text-xs font-black text-gray-500">
            +{items.length - THUMBNAILS}
          </div>
        )}
      </div>
      <p className="text-sm text-gray-700 truncate">{productsText(items)}</p>
    </div>
  );
}

/** Las cuatro etapas en una barrita: hechas en naranja, las que faltan en gris. */
export function ProgressBar({ purchase }) {
  const steps = trackingSteps(purchase);
  const hechos = steps.filter((step) => step.hecho).length;
  return (
    <ol
      aria-label={`Progreso del pedido #${purchase.id}: ${hechos} de ${steps.length} etapas`}
      className="grid grid-cols-4 mt-5"
    >
      {steps.map((step, indice) => (
        <li key={step.estado} className="relative flex flex-col items-center text-center">
          {/* La línea hacia la etapa anterior. */}
          {indice > 0 && (
            <span
              aria-hidden="true"
              className={`absolute top-2.5 right-1/2 w-full h-0.5 ${step.hecho ? "bg-orange-500" : "bg-gray-200"}`}
            />
          )}
          <span
            className={`relative z-10 w-5 h-5 rounded-full flex items-center justify-center ${
              step.hecho ? "bg-orange-500 text-white" : "bg-white ring-2 ring-inset ring-gray-200"
            }`}
          >
            {step.hecho && <CheckIcon className="w-3 h-3" />}
          </span>
          <span className={`mt-1.5 px-0.5 text-xs sm:text-xs leading-tight break-words ${step.hecho ? "font-bold text-gray-900" : "text-gray-500"}`}>
            {STATUS_NAME[step.estado]}
          </span>
        </li>
      ))}
    </ol>
  );
}

const primaryButton =
  "h-10 px-5 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold transition whitespace-nowrap disabled:opacity-40";

/**
 * Un pedido que todavía no terminó, en «Mis pedidos»: qué pasa ahora con
 * él (en grande), la barrita de progreso y lo que se puede hacer (pagar o
 * avisar que llegó).
 */
export default function ActiveOrderCard({
  purchase,
  onSeeDetail,
  onPay,
  onReceived,
  paying = false,
  confirming = false,
  busy = false,
}) {
  const withoutPay = isUnpaid(purchase);
  const deadline = withoutPay && purchase.expiresPayment ? payBefore(purchase.expiresPayment) : "";

  return (
    <li className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 shadow-xs hover:border-gray-300 transition">
      {/* Sin flex-wrap: el precio queda siempre arriba a la derecha y,
          si no entra, la frase baja de renglón. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-base sm:text-lg font-black leading-snug ${withoutPay ? "text-amber-700" : "text-gray-900"}`}>
            {statusPhrase(purchase)}
          </p>
          <p className="text-sm text-gray-500 mt-0.5">
            <span className="font-bold text-gray-700">Pedido #{purchase.id}</span>
            <span className="mx-2 text-gray-300">·</span>
            {formatDate(purchase.date)}
          </p>
        </div>
        <p className="shrink-0 text-base sm:text-lg font-black whitespace-nowrap">{formatPrice(purchase.total)}</p>
      </div>

      {withoutPay ? (
        deadline && <p className="text-sm text-gray-600 mt-3">{deadline}. Si no se paga, el pedido se cancela solo.</p>
      ) : (
        <ProgressBar purchase={purchase} />
      )}

      <div className="mt-5 flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex-1 min-w-0">
          <Thumbnails items={purchase.items} />
        </div>
        <div className="flex items-center justify-between md:justify-end gap-4">
          {withoutPay && (
            <button
              type="button"
              onClick={() => onPay(purchase)}
              disabled={busy}
              aria-label={`Pagar el pedido #${purchase.id} con Mercado Pago`}
              className={primaryButton}
            >
              {paying ? "Abriendo..." : "Pagar"}
            </button>
          )}
          {purchase.estado === "shipped" && (
            <button
              type="button"
              onClick={() => onReceived(purchase)}
              disabled={busy}
              aria-label={`Ya recibí el pedido #${purchase.id}`}
              className={primaryButton}
            >
              {confirming ? "Confirmando..." : "Ya lo recibí"}
            </button>
          )}
          <button
            type="button"
            onClick={() => onSeeDetail(purchase)}
            aria-label={`Ver detalle del pedido #${purchase.id}`}
            className="text-gray-600 text-sm font-bold hover:text-orange-500 whitespace-nowrap"
          >
            Ver detalle →
          </button>
        </div>
      </div>
    </li>
  );
}
