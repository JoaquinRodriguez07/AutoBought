import { useState } from "react";
import toast from "react-hot-toast";
import { cambiarEstadoPedido } from "./apiDashboard";
import { TONOS } from "./piezas";

/* Lo que comparten el listado de pedidos y el detalle (SCRUM-171). */

// En el orden en que avanza un pedido; "cancelado" va aparte.
export const ESTADOS_PEDIDO = {
  confirmed: { texto: "Confirmado", tono: "border-blue-200 bg-blue-50 text-blue-700" },
  packing: { texto: "Empaquetando", tono: "border-violet-200 bg-violet-50 text-violet-700" },
  shipped: { texto: "Enviado", tono: "border-indigo-200 bg-indigo-50 text-indigo-700" },
  delivered: { texto: "Entregado", tono: TONOS.verde },
  cancelled: { texto: "Cancelado", tono: TONOS.neutro },
};

export const PAGOS_PEDIDO = {
  approved: { texto: "Pagado", tono: TONOS.verde },
  pending: { texto: "Esperando pago", tono: TONOS.ambar },
  rejected: { texto: "Pago rechazado", tono: TONOS.rojo },
  // Los pedidos de antes de Mercado Pago se cobraban al comprar.
  null: { texto: "Pagado", tono: TONOS.verde },
};

// Un pedido cancelado y pagado: si ya se le devolvió el dinero al cliente.
export const DEVOLUCION_PEDIDO = {
  devuelto: { texto: "Devuelto", tono: TONOS.neutro },
  falta: { texto: "Falta devolver", tono: TONOS.rojo },
};

// Cómo se puede ordenar el listado (el orden lo hace el backend, porque el
// listado viene de a páginas). "priority": en curso, el que más espera
// primero; cerrados, el más nuevo.
export const ORDENES_PEDIDO = {
  priority: "Recomendado",
  newest: "Más nuevos",
  oldest: "Más viejos",
  client_asc: "Cliente (A–Z)",
  client_desc: "Cliente (Z–A)",
  total_desc: "Mayor total",
  total_asc: "Menor total",
};

export const MOTIVO_MIN = 5;
export const MOTIVO_MAX = 200;
// Largo máximo de la nota interna (como en el backend).
export const NOTA_MAX = 500;

const fechaCorta = new Intl.DateTimeFormat("es-UY", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const fechaLarga = new Intl.DateTimeFormat("es-UY", { dateStyle: "full", timeStyle: "short" });

export const formatearFechaPedido = (fecha, { larga = false } = {}) =>
  (larga ? fechaLarga : fechaCorta).format(new Date(fecha));

// "Av. Italia 1234, apto. 301"
export function textoCalle(envio) {
  return `${envio.calle} ${envio.numero}${envio.apartamento ? `, apto. ${envio.apartamento}` : ""}`;
}

// Avanzar o cancelar un pedido, igual en el listado y en el detalle (y, solo
// en el detalle, volverlo un paso atrás).
// `onCambiado(pedido)` recibe el pedido como quedó; los errores (un 409
// porque otro lo cambió, Mercado Pago caído al cancelar) quedan en `error`.
export function useCambioDeEstado(onCambiado) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [aCancelar, setACancelar] = useState(null);
  const [aVolver, setAVolver] = useState(null);

  // Volver un paso atrás corrige un error de la tienda: se confirma antes y
  // al cliente no le llega mail.
  const volver = async () => {
    const pedido = aVolver;
    setError("");
    setOcupado(true);
    try {
      const actualizado = await cambiarEstadoPedido(pedido.id, pedido.anteriorEstado);
      setAVolver(null);
      toast.success(`Pedido #${actualizado.id}: volvió a ${ESTADOS_PEDIDO[actualizado.estado].texto}. Al cliente no le llega mail.`);
      onCambiado(actualizado);
    } catch (falla) {
      setAVolver(null);
      setError(falla.message);
      onCambiado(null);
    } finally {
      setOcupado(false);
    }
  };

  const avisar = (pedido) => {
    toast.success(`Pedido #${pedido.id}: ${ESTADOS_PEDIDO[pedido.estado].texto}. Le avisamos al cliente por mail.`);
    onCambiado(pedido);
  };

  const avanzar = async (pedido) => {
    setError("");
    setOcupado(true);
    try {
      avisar(await cambiarEstadoPedido(pedido.id, pedido.siguienteEstado));
    } catch (falla) {
      setError(falla.message);
      onCambiado(null); // se recarga, para ver cómo quedó
    } finally {
      setOcupado(false);
    }
  };

  return {
    ocupado,
    error,
    limpiarError: () => setError(""),
    avanzar,
    aCancelar,
    pedirCancelar: (pedido) => {
      setError("");
      setACancelar(pedido);
    },
    cerrarCancelar: () => setACancelar(null),
    aVolver,
    pedirVolver: (pedido) => {
      setError("");
      setAVolver(pedido);
    },
    cerrarVolver: () => setAVolver(null),
    volver,
    alCancelar: (pedido) => {
      setACancelar(null);
      avisar(pedido);
    },
  };
}
