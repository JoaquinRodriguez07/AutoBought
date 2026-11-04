import { useEffect, useState } from "react";

import { crearLinkPago, obtenerDetalleCompra, obtenerHistorialCompras } from "./api";
import { usePedidos } from "./context/PedidosContext";
import CuentaLayout from "./CuentaLayout";
import DetallePedido, { EstadoPedido } from "./DetallePedido";
import { IconoCaja } from "./Iconos";
import { pagaloAntesDe } from "./plazoPago";
import { irA } from "./redirigir";
import {
  canceladoPorLaTienda,
  faltaPagar,
  formatearFecha,
  formatearPrecio,
  textoProductos,
  vencioSinPagar,
} from "./seguimientoPedido";
import { FotoProducto } from "./TarjetaPedidoEnCurso";

// Cuántas fotos de productos se ven en cada pedido de la lista.
const MINIATURAS = 3;

// La línea chica al lado del estado: cuánto queda para pagar, o por qué se canceló.
function notaPago(compra) {
  if (vencioSinPagar(compra)) return "No se completó el pago a tiempo";
  if (canceladoPorLaTienda(compra)) return "Lo canceló la tienda";
  if (!faltaPagar(compra)) return "";
  const plazo = compra.vencePago ? pagaloAntesDe(compra.vencePago) : "";
  if (compra.estadoPago === "rejected") return plazo ? `Pago rechazado · ${plazo}` : "Pago rechazado";
  return plazo;
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
  const { establecer } = usePedidos();

  // Después de «Ya lo recibí»: el pedido entregado reemplaza al de la lista
  // (y el número de pedidos en curso de la barra baja).
  const actualizarCompra = (entregada) => {
    setCompraSeleccionada(entregada);
    const lista = compras.map((anterior) => (anterior.id === entregada.id ? entregada : anterior));
    setCompras(lista);
    establecer(lista);
  };

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

        <DetallePedido
          compra={compraSeleccionada}
          textoVolver="← Volver al historial"
          onVolver={() => {
            setCompraSeleccionada(null);
            setErrorDetalle("");
          }}
          onActualizado={actualizarCompra}
        />
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
