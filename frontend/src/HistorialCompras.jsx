// «Mis compras › Anteriores»: los pedidos que ya terminaron.

import { useEffect, useState } from "react";

import { obtenerDetalleCompra, obtenerHistorialCompras } from "./api";
import { usePedidos } from "./context/PedidosContext";
import CuentaLayout from "./CuentaLayout";
import DetallePedido, { EstadoPedido } from "./DetallePedido";
import { IconoCaja } from "./Iconos";
import PestanasCompras from "./PestanasCompras";
import {
  canceladoPorLaTienda,
  estaEnCurso,
  formatearFecha,
  formatearPrecio,
  textoProductos,
  vencioSinPagar,
} from "./seguimientoPedido";
import { FotoProducto } from "./TarjetaPedidoEnCurso";

// Cuántas fotos de productos se ven en cada pedido de la lista.
const MINIATURAS = 3;

// La línea chica al lado del estado: por qué se canceló.
function notaCancelacion(compra) {
  if (vencioSinPagar(compra)) return "No se completó el pago a tiempo";
  if (canceladoPorLaTienda(compra)) return "Lo canceló la tienda";
  return "";
}

function CargandoHistorial() {
  return (
    <div role="status" className="space-y-4">
      <span className="sr-only">Cargando historial de compras...</span>
      {[0, 1, 2].map((i) => (
        <div key={i} aria-hidden="true" className="bg-white border border-gray-200 rounded-xl p-5 animate-pulse">
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

  // Las que están en curso van en la otra pestaña (/pedidos): acá solo
  // las que ya terminaron (entregadas o canceladas).
  const anteriores = compras.filter((compra) => !estaEnCurso(compra));

  return (
    <CuentaLayout
      {...navegacion}
      seccion="compras"
      titulo={compraSeleccionada ? `Pedido #${compraSeleccionada.id}` : "Mis compras"}
      descripcion={compraSeleccionada ? `Realizado el ${formatearFecha(compraSeleccionada.fecha)}` : undefined}
    >
      {!compraSeleccionada && <PestanasCompras actual="anteriores" />}

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
          textoVolver="← Volver a mis compras"
          onVolver={() => {
            setCompraSeleccionada(null);
            setErrorDetalle("");
          }}
          onActualizado={actualizarCompra}
        />
      ) : cargandoDetalle ? (
        <CargandoHistorial />
      ) : error ? null : anteriores.length === 0 ? (
        <div className="text-center py-16 bg-white border border-dashed border-gray-300 rounded-xl">
          <IconoCaja className="w-10 h-10 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-600 text-sm font-bold">
            Todavía no tenés compras terminadas.
          </p>
          <p className="text-gray-500 text-sm mt-2">
            Cuando te llegue un pedido, lo vas a ver acá.
          </p>
        </div>
      ) : (

        /* LISTA */

        <ul aria-label="Compras anteriores" className="space-y-4">
          {anteriores.map((compra) => {
            const items = compra.items || [];
            return (
              <li key={compra.id} className="bg-white border border-gray-200 rounded-xl shadow-xs hover:border-gray-300 transition">
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
                  <p className="text-sm text-gray-500">
                    <span className="font-black text-gray-900">#{compra.id}</span>
                    <span className="mx-2 text-gray-300">·</span>
                    {formatearFecha(compra.fecha)}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {notaCancelacion(compra) && (
                      <span className="text-xs text-gray-500">{notaCancelacion(compra)}</span>
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
                      <p className="text-xs text-gray-400 font-bold uppercase">Total</p>
                      <p className="text-lg font-black">{formatearPrecio(compra.total)}</p>
                    </div>
                    <div className="flex items-center gap-4">
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
