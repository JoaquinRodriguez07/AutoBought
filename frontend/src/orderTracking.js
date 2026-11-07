// Las etapas de un pedido que sigue su curso, en orden.
const STAGES = ["confirmed", "packing", "shipped", "delivered"];

/**
 * Los pasos de la línea de tiempo: { estado, hecho, fecha }. Si el pedido
 * sigue su curso, se ven las cuatro etapas (las que faltan, sin marcar). Si
 * se canceló, solo las que alcanzó y al final «Cancelado».
 */
export function trackingSteps(purchase) {
  const tracking = purchase.tracking?.length
    ? purchase.tracking
    : [{ estado: purchase.estado, date: null }];
  // La última vez que pasó por cada estado (un pago tardío vuelve a confirmarlo).
  const dates = {};
  for (const step of tracking) dates[step.estado] = step.date;

  if (purchase.estado === "cancelled") {
    const reached = STAGES.filter((etapa) => etapa in dates);
    return [
      ...reached.map((estado) => ({ estado, hecho: true, date: dates[estado] })),
      { estado: "cancelled", hecho: true, date: dates.cancelled ?? null },
    ];
  }

  const current = STAGES.indexOf(purchase.estado);
  return STAGES.map((estado, indice) => ({
    estado,
    hecho: indice <= current,
    date: indice <= current ? dates[estado] ?? null : null,
  }));
}

// Pedidos con Mercado Pago que todavía no se pagaron.
export const INCOMPLETE_PAYMENT = {
  pending: "pendiente",
  rejected: "rechazado",
};

export function isUnpaid(purchase) {
  return Boolean(INCOMPLETE_PAYMENT[purchase.paymentStatus]) && purchase.estado !== "cancelled";
}

// Se canceló solo porque venció el plazo sin pagarse (el stock volvió).
export function expiredUnpaid(purchase) {
  if (purchase.estado !== "cancelled") return false;
  if (purchase.reasonCancellation) return purchase.reasonCancellation === "expired";
  return Boolean(INCOMPLETE_PAYMENT[purchase.paymentStatus]);
}

export const cancelledByStore = (purchase) =>
  purchase.estado === "cancelled" && purchase.reasonCancellation === "store";

/** Todavía no terminó: falta pagarlo, o se está preparando o enviando. */
export function isActive(purchase) {
  return isUnpaid(purchase) || ["confirmed", "packing", "shipped"].includes(purchase.estado);
}

/** La frase grande de un pedido en curso: qué pasa ahora con él. */
export function statusPhrase(purchase) {
  if (isUnpaid(purchase)) {
    return purchase.paymentStatus === "rejected" ? "El pago fue rechazado" : "Falta pagar";
  }
  return {
    confirmed: "Lo estamos preparando",
    packing: "Lo estamos empaquetando",
    shipped: "Está en camino",
    delivered: "Entregado",
    cancelled: "Cancelado",
  }[purchase.estado] ?? "";
}

export const formatPrice = (price) =>
  new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency: "UYU",
    maximumFractionDigits: 0,
  }).format(Number(price) || 0);

export const formatDate = (date) => {
  if (!date) return "Fecha no disponible";
  return new Date(date).toLocaleDateString("es-UY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

export const formatDateTime = (date) =>
  new Date(date).toLocaleString("es-UY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export function productsText(items) {
  if (!items?.length) return "";
  const first = items[0].displayName || "Producto";
  if (items.length === 1) return first;
  const resto = items.length - 1;
  return `${first} y ${resto} ${resto === 1 ? "producto más" : "productos más"}`;
}

// Cómo se llama cada estado en pantalla.
export const STATUS_NAME = {
  confirmed: "Confirmado",
  packing: "Empaquetando",
  shipped: "Enviado",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

/** La frase en corto, para lugares chicos (la tarjeta del inicio). */
export function shortPhrase(purchase) {
  if (isUnpaid(purchase)) return purchase.paymentStatus === "rejected" ? "Pago rechazado" : "Falta pagar";
  return { confirmed: "Preparando", packing: "Empaquetando", shipped: "En camino" }[purchase.estado] ?? statusPhrase(purchase);
}

// Del más avanzado al menos: enviado, empaquetando, preparando y, al
// final, los que falta pagar. Entre iguales, el más nuevo primero.
const PROGRESS_ORDER = { shipped: 0, packing: 1, confirmed: 2 };
const position = (pedido) => (isUnpaid(pedido) ? 9 : PROGRESS_ORDER[pedido.estado] ?? 5);

export function sortByProgress(orders) {
  return [...orders].sort(
    (a, b) => position(a) - position(b) || new Date(b.date || 0) - new Date(a.date || 0)
  );
}
