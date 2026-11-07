// Las etapas de un pedido que sigue su curso, en orden.
const STAGES = ["confirmed", "packing", "shipped", "delivered"];

/**
 * Los pasos de la línea de tiempo: { estado, hecho, fecha }. Si el pedido
 * sigue su curso, se ven las cuatro etapas (las que faltan, sin marcar). Si
 * se canceló, solo las que alcanzó y al final «Cancelado».
 */
export function trackingSteps(compra) {
  const seguimiento = compra.seguimiento?.length
    ? compra.seguimiento
    : [{ estado: compra.estado, fecha: null }];
  // La última vez que pasó por cada estado (un pago tardío vuelve a confirmarlo).
  const fechas = {};
  for (const paso of seguimiento) fechas[paso.estado] = paso.fecha;

  if (compra.estado === "cancelled") {
    const alcanzadas = STAGES.filter((etapa) => etapa in fechas);
    return [
      ...alcanzadas.map((estado) => ({ estado, hecho: true, fecha: fechas[estado] })),
      { estado: "cancelled", hecho: true, fecha: fechas.cancelled ?? null },
    ];
  }

  const actual = STAGES.indexOf(compra.estado);
  return STAGES.map((estado, indice) => ({
    estado,
    hecho: indice <= actual,
    fecha: indice <= actual ? fechas[estado] ?? null : null,
  }));
}

// Pedidos con Mercado Pago que todavía no se pagaron.
export const INCOMPLETE_PAYMENT = {
  pending: "pendiente",
  rejected: "rechazado",
};

export function isUnpaid(compra) {
  return Boolean(INCOMPLETE_PAYMENT[compra.estadoPago]) && compra.estado !== "cancelled";
}

// Se canceló solo porque venció el plazo sin pagarse (el stock volvió).
export function expiredUnpaid(compra) {
  if (compra.estado !== "cancelled") return false;
  if (compra.motivoCancelacion) return compra.motivoCancelacion === "expired";
  return Boolean(INCOMPLETE_PAYMENT[compra.estadoPago]);
}

export const cancelledByStore = (compra) =>
  compra.estado === "cancelled" && compra.motivoCancelacion === "store";

/** Todavía no terminó: falta pagarlo, o se está preparando o enviando. */
export function isActive(compra) {
  return isUnpaid(compra) || ["confirmed", "packing", "shipped"].includes(compra.estado);
}

/** La frase grande de un pedido en curso: qué pasa ahora con él. */
export function statusPhrase(compra) {
  if (isUnpaid(compra)) {
    return compra.estadoPago === "rejected" ? "El pago fue rechazado" : "Falta pagar";
  }
  return {
    confirmed: "Lo estamos preparando",
    packing: "Lo estamos empaquetando",
    shipped: "Está en camino",
    delivered: "Entregado",
    cancelled: "Cancelado",
  }[compra.estado] ?? "";
}

export const formatPrice = (precio) =>
  new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency: "UYU",
    maximumFractionDigits: 0,
  }).format(Number(precio) || 0);

export const formatDate = (fecha) => {
  if (!fecha) return "Fecha no disponible";
  return new Date(fecha).toLocaleDateString("es-UY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

export const formatDateTime = (fecha) =>
  new Date(fecha).toLocaleString("es-UY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export function productsText(items) {
  if (!items?.length) return "";
  const primero = items[0].nombre || "Producto";
  if (items.length === 1) return primero;
  const resto = items.length - 1;
  return `${primero} y ${resto} ${resto === 1 ? "producto más" : "productos más"}`;
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
export function shortPhrase(compra) {
  if (isUnpaid(compra)) return compra.estadoPago === "rejected" ? "Pago rechazado" : "Falta pagar";
  return { confirmed: "Preparando", packing: "Empaquetando", shipped: "En camino" }[compra.estado] ?? statusPhrase(compra);
}

// Del más avanzado al menos: enviado, empaquetando, preparando y, al
// final, los que falta pagar. Entre iguales, el más nuevo primero.
const PROGRESS_ORDER = { shipped: 0, packing: 1, confirmed: 2 };
const position = (pedido) => (isUnpaid(pedido) ? 9 : PROGRESS_ORDER[pedido.estado] ?? 5);

export function sortByProgress(pedidos) {
  return [...pedidos].sort(
    (a, b) => position(a) - position(b) || new Date(b.fecha || 0) - new Date(a.fecha || 0)
  );
}
