import { useEffect, useState } from "react";

import { crearLinkPago, obtenerDetalleCompra, obtenerHistorialCompras } from "./api";
import CuentaLayout from "./CuentaLayout";
import { IconoAlerta, IconoCaja } from "./Iconos";
import { imagenDeRepuesto, usarImagenGenerica } from "./mapearRepuesto";
import { textoPlazoPago } from "./plazoPago";
import { irA } from "./redirigir";

const ESTADOS_PEDIDO = {
  confirmed: { texto: "Confirmado", clase: "bg-blue-50 text-blue-700 ring-blue-200" },
  shipped: { texto: "Enviado", clase: "bg-indigo-50 text-indigo-700 ring-indigo-200" },
  delivered: { texto: "Entregado", clase: "bg-green-50 text-green-700 ring-green-200" },
  cancelled: { texto: "Cancelado", clase: "bg-gray-50 text-gray-500 ring-gray-200" },
};

const PENDIENTE_DE_PAGO = { texto: "Pendiente de pago", clase: "bg-amber-50 text-amber-800 ring-amber-200" };

// Pedidos con Mercado Pago que todavía no se pagaron.
const PAGO_SIN_COMPLETAR = {
  pending: "pendiente",
  rejected: "rechazado",
};

// Cuántas fotos de productos se ven en cada pedido de la lista.
const MINIATURAS = 3;

function faltaPagar(compra) {
  return Boolean(PAGO_SIN_COMPLETAR[compra.estadoPago]) && compra.estado !== "cancelled";
}

// Se canceló solo porque venció el plazo sin pagarse (el stock volvió).
function vencioSinPagar(compra) {
  return Boolean(PAGO_SIN_COMPLETAR[compra.estadoPago]) && compra.estado === "cancelled";
}

// La línea chica al lado del estado: cuánto queda para pagar, o por qué se canceló.
function notaPago(compra) {
  if (vencioSinPagar(compra)) return "No se completó el pago a tiempo";
  if (!faltaPagar(compra)) return "";
  const plazo = compra.vencePago ? `Pagalo antes de ${textoPlazoPago(compra.vencePago)}` : "";
  if (compra.estadoPago === "rejected") return plazo ? `Pago rechazado · ${plazo}` : "Pago rechazado";
  return plazo;
}

function textoDireccion(d) {
  const apartamento = d.apartamento ? ` apto ${d.apartamento}` : "";
  return `${d.calle} ${d.numero}${apartamento}, ${d.ciudad}, ${d.departamento}`;
}

function textoProductos(items) {
  if (items.length === 0) return "";
  const primero = items[0].nombre || "Producto";
  if (items.length === 1) return primero;
  const resto = items.length - 1;
  return `${primero} y ${resto} ${resto === 1 ? "producto más" : "productos más"}`;
}

const formatearPrecio = (precio) =>
  new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency: "UYU",
    maximumFractionDigits: 0,
  }).format(Number(precio) || 0);

const formatearFecha = (fecha) => {
  if (!fecha) return "Fecha no disponible";

  return new Date(fecha).toLocaleDateString("es-UY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

/**
 * La etiqueta del pedido. Mientras no se pagó, eso es lo que importa: el
 * estado del envío ("Confirmado") se ve recién con el pago aprobado.
 */
function EstadoPedido({ compra }) {
  const { texto, clase } = faltaPagar(compra)
    ? PENDIENTE_DE_PAGO
    : ESTADOS_PEDIDO[compra.estado] ?? { texto: "Sin estado", clase: "bg-gray-50 text-gray-500 ring-gray-200" };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide whitespace-nowrap ring-1 ring-inset ${clase}`}>
      {texto}
    </span>
  );
}

function FotoProducto({ producto, clase }) {
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

function CargandoHistorial() {
  return (
    <div role="status" className="space-y-4">
      <span className="sr-only">Cargando historial de compras...</span>
      {[0, 1, 2].map((i) => (
        <div key={i} aria-hidden="true" className="border border-gray-200 rounded-xl p-5 animate-pulse">
          <div className="flex justify-between">
            <div className="h-4 w-40 bg-gray-100 rounded" />
            <div className="h-6 w-24 bg-gray-100 rounded-full" />
          </div>
          <div className="flex gap-2 mt-5">
            <div className="w-14 h-14 bg-gray-100 rounded-md" />
            <div className="w-14 h-14 bg-gray-100 rounded-md" />
          </div>
          <div className="h-5 w-28 bg-gray-100 rounded mt-5" />
        </div>
      ))}
    </div>
  );
}

export default function HistorialCompras(navegacion) {
  const [compras, setCompras] = useState([]);
  const [compraSeleccionada, setCompraSeleccionada] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [error, setError] = useState("");
  const [errorDetalle, setErrorDetalle] = useState("");
  // El pedido cuyo link de Mercado Pago se está pidiendo.
  const [pagandoId, setPagandoId] = useState(null);

  useEffect(() => {
    let cancelado = false;

    const cargarCompras = async () => {
      setCargando(true);
      setError("");
      try {
        const historial = await obtenerHistorialCompras();
        if (!cancelado) setCompras(historial);
      } catch (errorCarga) {
        if (!cancelado) {
          setError(errorCarga.message || "No pudimos cargar tu historial de compras.");
        }
      } finally {
        if (!cancelado) setCargando(false);
      }
    };

    cargarCompras();
    return () => {
      cancelado = true;
    };
  }, []);

  const verDetalle = async (compra) => {
    setCargandoDetalle(true);
    setErrorDetalle("");
    try {
      const detalle = await obtenerDetalleCompra(compra.id);
      setCompraSeleccionada(detalle);
    } catch (errorCarga) {
      setErrorDetalle(
        errorCarga.message || "No pudimos cargar el detalle de la compra."
      );
    } finally {
      setCargandoDetalle(false);
    }
  };

  const pagar = async (compra) => {
    setPagandoId(compra.id);
    setErrorDetalle("");
    try {
      irA(await crearLinkPago(compra.id));
    } catch (errorPago) {
      setErrorDetalle(errorPago.message || "No pudimos abrir Mercado Pago.");
      setPagandoId(null);
    }
  };

  // En el detalle es el botón principal (naranja); en la lista, uno
  // secundario, para que la lista no se llene de naranja.
  const botonPagar = (compra, texto, principal) => (
    <button
      type="button"
      onClick={() => pagar(compra)}
      disabled={pagandoId !== null}
      aria-label={`Pagar el pedido #${compra.id} con Mercado Pago`}
      className={`rounded-md text-xs font-black transition whitespace-nowrap disabled:opacity-40 ${
        principal
          ? "h-10 px-5 shrink-0 bg-orange-500 hover:bg-orange-600 text-white"
          : "h-9 px-4 bg-white border border-gray-300 text-gray-800 hover:border-orange-500 hover:text-orange-600"
      }`}
    >
      {pagandoId === compra.id ? "ABRIENDO..." : texto}
    </button>
  );

  return (
    <CuentaLayout
      {...navegacion}
      seccion="historial"
      titulo={compraSeleccionada ? `Pedido #${compraSeleccionada.id}` : "Historial de compras"}
      descripcion={
        compraSeleccionada
          ? `Realizado el ${formatearFecha(compraSeleccionada.fecha)}`
          : "Las compras que hiciste."
      }
    >
      {error && (
        <p role="alert" className="text-center text-red-600 font-bold">
          {error}
        </p>
      )}

      {errorDetalle && (
        <p role="alert" className="bg-red-50 border border-red-200 text-red-600 rounded-md px-4 py-3 text-sm font-bold mb-6">
          {errorDetalle}
        </p>
      )}

      {cargando ? (
        <CargandoHistorial />
      ) : compraSeleccionada ? (

        /* DETALLE */

        <section aria-label={`Detalle del pedido ${compraSeleccionada.id}`}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <button
              type="button"
              onClick={() => {
                setCompraSeleccionada(null);
                setErrorDetalle("");
              }}
              className="text-orange-500 text-sm font-bold hover:underline"
            >
              ← Volver al historial
            </button>
            <EstadoPedido compra={compraSeleccionada} />
          </div>

          {faltaPagar(compraSeleccionada) && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex gap-3">
                <IconoAlerta className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <p className="text-sm font-black text-gray-900">
                    {compraSeleccionada.estadoPago === "rejected"
                      ? "El pago fue rechazado"
                      : "Este pedido todavía no está pagado"}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    {compraSeleccionada.vencePago
                      ? `Tus repuestos quedan reservados hasta ${textoPlazoPago(compraSeleccionada.vencePago)}. Si no se paga, el pedido se cancela solo.`
                      : "Tus repuestos quedan reservados mientras completás el pago."}
                  </p>
                </div>
              </div>
              {botonPagar(compraSeleccionada, "PAGAR CON MERCADO PAGO", true)}
            </div>
          )}

          {vencioSinPagar(compraSeleccionada) && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-6">
              <p className="text-sm font-black text-gray-900">
                Este pedido se canceló porque no se completó el pago a tiempo
              </p>
              <p className="text-sm text-gray-600 mt-1">
                No se te cobró nada. Si todavía querés los repuestos, podés volver a comprarlos desde el catálogo.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
            <div className="border border-gray-200 rounded-xl">
              <h3 className="text-xs font-black uppercase text-gray-500 px-5 pt-5">
                Productos
              </h3>
              <ul className="divide-y divide-gray-100 px-5">
                {(compraSeleccionada.items || []).map((producto, index) => (
                  <li key={producto.partId || index} className="flex items-center gap-4 py-4">
                    <FotoProducto producto={producto} clase="w-16 h-16" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900">
                        {producto.nombre || "Producto"}
                      </p>
                      {producto.codigo && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          Código: {producto.codigo}
                        </p>
                      )}
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

            <aside className="bg-gray-50 border border-gray-200 rounded-xl p-5 h-fit space-y-5">
              {compraSeleccionada.direccion && (
                <div>
                  <p className="text-xs font-black uppercase text-gray-500">Envío</p>
                  <p className="text-sm text-gray-700 mt-1">
                    {textoDireccion(compraSeleccionada.direccion)}
                  </p>
                </div>
              )}
              {compraSeleccionada.metodoPago && (
                <div>
                  <p className="text-xs font-black uppercase text-gray-500">Pago</p>
                  <p className="text-sm text-gray-700 mt-1">
                    {compraSeleccionada.metodoPago}
                    {faltaPagar(compraSeleccionada) &&
                      ` (${PAGO_SIN_COMPLETAR[compraSeleccionada.estadoPago]})`}
                    {vencioSinPagar(compraSeleccionada) && " (no se completó)"}
                  </p>
                </div>
              )}
              <div className="border-t border-gray-200 pt-4 flex justify-between items-end">
                <span className="text-sm font-bold">Total</span>
                <span className="text-2xl font-black text-orange-500">
                  {formatearPrecio(compraSeleccionada.total)}
                </span>
              </div>
            </aside>
          </div>
        </section>
      ) : cargandoDetalle ? (
        <CargandoHistorial />
      ) : error ? null : compras.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-gray-200 rounded-xl">
          <IconoCaja className="w-10 h-10 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 text-sm font-bold">
            Todavía no realizaste ninguna compra.
          </p>
          <p className="text-gray-400 text-xs mt-2">
            Cuando realices una compra, aparecerá acá.
          </p>
        </div>
      ) : (

        /* LISTA */

        <ul aria-label="Compras realizadas" className="space-y-4">
          {compras.map((compra) => {
            const items = compra.items || [];
            return (
              <li key={compra.id} className="border border-gray-200 rounded-xl hover:border-gray-300 transition">
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
                  <p className="text-sm text-gray-500">
                    <span className="font-black text-gray-900">#{compra.id}</span>
                    <span className="mx-2 text-gray-300">·</span>
                    {formatearFecha(compra.fecha)}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {notaPago(compra) && (
                      <span className="text-xs text-gray-500">{notaPago(compra)}</span>
                    )}
                    <EstadoPedido compra={compra} />
                  </div>
                </div>

                <div className="px-5 py-4 flex flex-col md:flex-row md:items-center gap-4">
                  {items.length > 0 && (
                    <div className="flex items-center gap-3 flex-1 min-w-0">
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
                  )}

                  <div className="flex items-center justify-between md:justify-end gap-5 md:ml-auto">
                    <div className="md:text-right">
                      <p className="text-[11px] text-gray-400 font-bold uppercase">Total</p>
                      <p className="text-lg font-black">{formatearPrecio(compra.total)}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      {faltaPagar(compra) && botonPagar(compra, "Completar pago", false)}
                      <button
                        type="button"
                        onClick={() => verDetalle(compra)}
                        disabled={cargandoDetalle}
                        aria-label={`Ver detalle del pedido #${compra.id}`}
                        className="text-gray-600 text-sm font-bold hover:text-orange-500 whitespace-nowrap disabled:opacity-50"
                      >
                        Ver detalle →
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </CuentaLayout>
  );
}
