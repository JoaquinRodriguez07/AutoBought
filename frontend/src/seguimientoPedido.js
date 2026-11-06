// Las etapas de un pedido que sigue su curso, en orden.
const ETAPAS = ["confirmed", "packing", "shipped", "delivered"];

/**
 * Los pasos de la línea de tiempo: { estado, hecho, fecha }. Si el pedido
 * sigue su curso, se ven las cuatro etapas (las que faltan, sin marcar). Si
 * se canceló, solo las que alcanzó y al final «Cancelado».
 */
export function pasosDeSeguimiento(compra) {
  const seguimiento = compra.seguimiento?.length
    ? compra.seguimiento
    : [{ estado: compra.estado, fecha: null }];
  // La última vez que pasó por cada estado (un pago tardío vuelve a confirmarlo).
  const fechas = {};
  for (const paso of seguimiento) fechas[paso.estado] = paso.fecha;

  if (compra.estado === "cancelled") {
    const alcanzadas = ETAPAS.filter((etapa) => etapa in fechas);
    return [
      ...alcanzadas.map((estado) => ({ estado, hecho: true, fecha: fechas[estado] })),
      { estado: "cancelled", hecho: true, fecha: fechas.cancelled ?? null },
    ];
  }

  const actual = ETAPAS.indexOf(compra.estado);
  return ETAPAS.map((estado, indice) => ({
    estado,
    hecho: indice <= actual,
    fecha: indice <= actual ? fechas[estado] ?? null : null,
  }));
}

// Pedidos con Mercado Pago que todavía no se pagaron.
export const PAGO_SIN_COMPLETAR = {
  pending: "pendiente",
  rejected: "rechazado",
};

export function faltaPagar(compra) {
  return Boolean(PAGO_SIN_COMPLETAR[compra.estadoPago]) && compra.estado !== "cancelled";
}

// Se canceló solo porque venció el plazo sin pagarse (el stock volvió).
export function vencioSinPagar(compra) {
  if (compra.estado !== "cancelled") return false;
  if (compra.motivoCancelacion) return compra.motivoCancelacion === "expired";
  return Boolean(PAGO_SIN_COMPLETAR[compra.estadoPago]);
}

export const canceladoPorLaTienda = (compra) =>
  compra.estado === "cancelled" && compra.motivoCancelacion === "store";

/** Todavía no terminó: falta pagarlo, o se está preparando o enviando. */
export function estaEnCurso(compra) {
  return faltaPagar(compra) || ["confirmed", "packing", "shipped"].includes(compra.estado);
}

/** La frase grande de un pedido en curso: qué pasa ahora con él. */
export function fraseDelEstado(compra) {
  if (faltaPagar(compra)) {
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

export const formatearPrecio = (precio) =>
  new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency: "UYU",
    maximumFractionDigits: 0,
  }).format(Number(precio) || 0);

export const formatearFecha = (fecha) => {
  if (!fecha) return "Fecha no disponible";
  return new Date(fecha).toLocaleDateString("es-UY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

export const formatearFechaHora = (fecha) =>
  new Date(fecha).toLocaleString("es-UY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export function textoProductos(items) {
  if (!items?.length) return "";
  const primero = items[0].nombre || "Producto";
  if (items.length === 1) return primero;
  const resto = items.length - 1;
  return `${primero} y ${resto} ${resto === 1 ? "producto más" : "productos más"}`;
}

// Cómo se llama cada estado en pantalla.
export const NOMBRE_ESTADO = {
  confirmed: "Confirmado",
  packing: "Empaquetando",
  shipped: "Enviado",
  delivered: "Entregado",
  cancelled: "Cancelado",
};
