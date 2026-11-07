// Detalle de un pedido del cliente: seguimiento, pago, productos y envío.

import { useState } from "react";

import { confirmarRecepcion, crearLinkPago } from "./api";
import { IconoAlerta, IconoCheck } from "./Iconos";
import { textoPlazoPago } from "./plazoPago";
import { irA } from "./redirigir";
import {
  NOMBRE_ESTADO,
  PAGO_SIN_COMPLETAR,
  canceladoPorLaTienda,
  faltaPagar,
  formatearFechaHora,
  formatearPrecio,
  pasosDeSeguimiento,
  vencioSinPagar,
} from "./seguimientoPedido";
import { FotoProducto } from "./TarjetaPedidoEnCurso";

const CLASES_ESTADO = {
  confirmed: "bg-blue-50 text-blue-700 ring-blue-200",
  packing: "bg-violet-50 text-violet-700 ring-violet-200",
  shipped: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  delivered: "bg-green-50 text-green-700 ring-green-200",
  cancelled: "bg-gray-50 text-gray-500 ring-gray-200",
};

const PENDIENTE_DE_PAGO = { texto: "Pendiente de pago", clase: "bg-amber-50 text-amber-800 ring-amber-200" };

/**
 * La etiqueta del pedido. Mientras no se pagó, eso es lo que importa: el
 * estado del envío ("Confirmado") se ve recién con el pago aprobado.
 */
export function EstadoPedido({ compra }) {
  const { texto, clase } = faltaPagar(compra)
    ? PENDIENTE_DE_PAGO
    : {
        texto: NOMBRE_ESTADO[compra.estado] ?? "Sin estado",
        clase: CLASES_ESTADO[compra.estado] ?? "bg-gray-50 text-gray-500 ring-gray-200",
      };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide whitespace-nowrap ring-1 ring-inset ${clase}`}>
      {texto}
    </span>
  );
}

function LineaDeTiempo({ compra }) {
  const pasos = pasosDeSeguimiento(compra);
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
                  <IconoCheck className="w-4 h-4" />
                ) : (
                  <span className="text-xs font-black">{indice + 1}</span>
                )}
              </span>
              <div>
                <p className={`text-sm font-bold ${paso.hecho ? "text-gray-900" : "text-gray-400"}`}>
                  {NOMBRE_ESTADO[paso.estado] ?? paso.estado}
                </p>
                {paso.hecho && paso.fecha && (
                  <p className="text-xs text-gray-500 mt-0.5">{formatearFechaHora(paso.fecha)}</p>
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

function textoDireccion(d) {
  const apartamento = d.apartamento ? ` apto ${d.apartamento}` : "";
  return `${d.calle} ${d.numero}${apartamento}, ${d.ciudad}, ${d.departamento}`;
}

const botonPrincipal =
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
export default function DetallePedido({ compra, onVolver, textoVolver, onActualizado }) {
  const [error, setError] = useState("");
  const [pagando, setPagando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [recibido, setRecibido] = useState(false);

  const pagar = async () => {
    setPagando(true);
    setError("");
    try {
      irA(await crearLinkPago(compra.id));
    } catch (errorPago) {
      setError(errorPago.message || "No pudimos abrir Mercado Pago.");
      setPagando(false);
    }
  };

  const confirmarLlegada = async () => {
    setConfirmando(true);
    setError("");
    try {
      const entregada = await confirmarRecepcion(compra.id);
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
        <EstadoPedido compra={compra} />
      </div>

      {error && (
        <p role="alert" className="bg-red-50 border border-red-200 text-red-600 rounded-md px-4 py-3 text-sm font-bold mb-6">
          {error}
        </p>
      )}

      {faltaPagar(compra) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex gap-3">
            <IconoAlerta className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
            <div>
              <p className="text-sm font-black text-gray-900">
                {compra.estadoPago === "rejected" ? "El pago fue rechazado" : "Este pedido todavía no está pagado"}
              </p>
              <p className="text-sm text-gray-600 mt-1">
                {compra.vencePago
                  ? `Tus repuestos quedan reservados hasta ${textoPlazoPago(compra.vencePago)}. Si no se paga, el pedido se cancela solo.`
                  : "Tus repuestos quedan reservados mientras completás el pago."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={pagar}
            disabled={pagando}
            aria-label={`Pagar el pedido #${compra.id} con Mercado Pago`}
            className={botonPrincipal}
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
          <button type="button" onClick={confirmarLlegada} disabled={confirmando} className={botonPrincipal}>
            {confirmando ? "Confirmando..." : "Ya lo recibí"}
          </button>
        </div>
      )}

      {recibido && compra.estado === "delivered" && (
        <p role="status" className="bg-green-50 border border-green-200 text-green-700 rounded-md px-4 py-3 text-sm font-bold mb-6">
          ¡Listo! Marcamos el pedido como entregado. Te mandamos un mail con el resumen.
        </p>
      )}

      {canceladoPorLaTienda(compra) && (
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

      {!faltaPagar(compra) && <LineaDeTiempo compra={compra} />}

      {vencioSinPagar(compra) && (
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
                <FotoProducto producto={producto} clase="w-16 h-16" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900">{producto.nombre || "Producto"}</p>
                  {producto.codigo && <p className="text-xs text-gray-400 mt-0.5">Código: {producto.codigo}</p>}
                  <p className="text-xs text-gray-500 mt-1">
                    {`Cantidad: ${producto.cantidad} · ${formatearPrecio(producto.precio)} c/u`}
                  </p>
                </div>
                <p className="text-sm font-black whitespace-nowrap">
                  {formatearPrecio(producto.precio * producto.cantidad)}
                </p>
              </li>
            ))}
          </ul>
        </div>

        <aside className="bg-white border border-gray-200 rounded-xl p-5 h-fit space-y-5">
          {compra.direccion && (
            <div>
              <p className="text-xs font-black uppercase text-gray-500">Envío</p>
              <p className="text-sm text-gray-700 mt-1">{textoDireccion(compra.direccion)}</p>
            </div>
          )}
          {compra.metodoPago && (
            <div>
              <p className="text-xs font-black uppercase text-gray-500">Pago</p>
              <p className="text-sm text-gray-700 mt-1">
                {compra.metodoPago}
                {faltaPagar(compra) && ` (${PAGO_SIN_COMPLETAR[compra.estadoPago]})`}
                {vencioSinPagar(compra) && " (no se completó)"}
              </p>
            </div>
          )}
          <div className="border-t border-gray-200 pt-4 flex justify-between items-end">
            <span className="text-sm font-bold">Total</span>
            <span className="text-2xl font-black text-orange-500">{formatearPrecio(compra.total)}</span>
          </div>
        </aside>
      </div>
    </section>
  );
}
