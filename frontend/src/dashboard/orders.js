import { useState } from "react";
import toast from "react-hot-toast";
import { changeOrderStatus } from "./dashboardApi";
import { TONES } from "./pieces";

/* Lo que comparten el listado de pedidos y el detalle (SCRUM-171). */

// En el orden en que avanza un pedido; "cancelado" va aparte.
export const ORDER_STATUSES = {
  confirmed: { texto: "Confirmado", tono: "border-blue-200 bg-blue-50 text-blue-700" },
  packing: { texto: "Empaquetando", tono: "border-violet-200 bg-violet-50 text-violet-700" },
  ready_for_pickup: { texto: "Listo para retirar", tono: "border-orange-200 bg-orange-50 text-orange-700" },
  shipped: { texto: "Enviado", tono: "border-indigo-200 bg-indigo-50 text-indigo-700" },
  delivered: { texto: "Entregado", tono: TONES.verde },
  cancelled: { texto: "Cancelado", tono: TONES.neutro },
};

export const ORDER_PAYMENTS = {
  approved: { texto: "Pagado", tono: TONES.verde },
  pending: { texto: "Esperando pago", tono: TONES.ambar },
  rejected: { texto: "Pago rechazado", tono: TONES.rojo },
  // Los pedidos de antes de Mercado Pago se cobraban al comprar.
  null: { texto: "Pagado", tono: TONES.verde },
};

// Un pedido cancelado y pagado: si ya se le devolvió el dinero al cliente.
export const ORDER_REFUNDS = {
  refunded: { texto: "Devuelto", tono: TONES.neutro },
  falta: { texto: "Falta devolver", tono: TONES.rojo },
};

// Cómo se puede ordenar el listado (el orden lo hace el backend, porque el
// listado viene de a páginas). "priority": en curso, el que más espera
// primero; cerrados, el más nuevo.
export const ORDER_SORTS = {
  priority: "Recomendado",
  newest: "Más nuevos",
  oldest: "Más viejos",
  client_asc: "Cliente (A–Z)",
  client_desc: "Cliente (Z–A)",
  total_desc: "Mayor total",
  total_asc: "Menor total",
};

export const REASON_MIN = 5;
export const REASON_MAX = 200;
// Largo máximo de la nota interna (como en el backend).
export const NOTE_MAX = 500;

const shortDate = new Intl.DateTimeFormat("es-UY", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const longDate = new Intl.DateTimeFormat("es-UY", { dateStyle: "full", timeStyle: "short" });

export const formatOrderDate = (date, { larga = false } = {}) =>
  (larga ? longDate : shortDate).format(new Date(date));

// "Av. Italia 1234, apto. 301"
export function streetText(shipping) {
  return `${shipping.street} ${shipping.number}${shipping.apartamento ? `, apto. ${shipping.apartamento}` : ""}`;
}

// Avanzar o cancelar un pedido, igual en el listado y en el detalle (y, solo
// en el detalle, volverlo un paso atrás).
// `onCambiado(pedido)` recibe el pedido como quedó; los errores (un 409
// porque otro lo cambió, Mercado Pago caído al cancelar) quedan en `error`.
export function useStatusChange(onCambiado) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toCancel, setToCancel] = useState(null);
  const [toGoBack, setToGoBack] = useState(null);

  // Volver un paso atrás corrige un error de la tienda: se confirma antes y
  // al cliente no le llega mail.
  const goBack = async () => {
    const pedido = toGoBack;
    setError("");
    setBusy(true);
    try {
      const updated = await changeOrderStatus(pedido.id, pedido.previousStatus);
      setToGoBack(null);
      toast.success(`Pedido #${updated.id}: volvió a ${ORDER_STATUSES[updated.estado].texto}. Al cliente no le llega mail.`);
      onCambiado(updated);
    } catch (failure) {
      setToGoBack(null);
      setError(failure.message);
      onCambiado(null);
    } finally {
      setBusy(false);
    }
  };

  const avisar = (pedido) => {
    toast.success(`Pedido #${pedido.id}: ${ORDER_STATUSES[pedido.estado].texto}. Le avisamos al cliente por mail.`);
    onCambiado(pedido);
  };

  const avanzar = async (pedido) => {
    setError("");
    setBusy(true);
    try {
      avisar(await changeOrderStatus(pedido.id, pedido.nextStatus));
    } catch (failure) {
      setError(failure.message);
      onCambiado(null); // se recarga, para ver cómo quedó
    } finally {
      setBusy(false);
    }
  };

  return {
    busy,
    error,
    clearError: () => setError(""),
    avanzar,
    toCancel,
    askCancel: (pedido) => {
      setError("");
      setToCancel(pedido);
    },
    closeCancel: () => setToCancel(null),
    toGoBack,
    askGoBack: (pedido) => {
      setError("");
      setToGoBack(pedido);
    },
    closeGoBack: () => setToGoBack(null),
    goBack,
    onCancel: (pedido) => {
      setToCancel(null);
      avisar(pedido);
    },
  };
}
