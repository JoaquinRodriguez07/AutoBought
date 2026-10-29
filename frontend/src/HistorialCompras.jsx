import { useEffect, useState } from "react";

import { crearLinkPago, obtenerDetalleCompra, obtenerHistorialCompras } from "./api";
import CuentaLayout from "./CuentaLayout";
import { irA } from "./redirigir";

const ESTADOS_PEDIDO = {
  confirmed: { texto: "Confirmado", clase: "bg-blue-50 text-blue-700" },
  shipped: { texto: "Enviado", clase: "bg-orange-50 text-orange-700" },
  delivered: { texto: "Entregado", clase: "bg-green-50 text-green-700" },
  cancelled: { texto: "Cancelado", clase: "bg-gray-100 text-gray-500" },
};

// Pedidos con Mercado Pago que todavía no se pagaron.
const PAGO_SIN_COMPLETAR = {
  pending: "pendiente",
  rejected: "rechazado",
};

function textoDireccion(d) {
  const apartamento = d.apartamento ? ` apto ${d.apartamento}` : "";
  return `${d.calle} ${d.numero}${apartamento}, ${d.ciudad}, ${d.departamento}`;
}

function EstadoPedido({ estado }) {
  const { texto, clase } = ESTADOS_PEDIDO[estado] ?? {
    texto: "Sin estado",
    clase: "bg-gray-100 text-gray-500",
  };
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-xs font-black uppercase ${clase}`}>
      {texto}
    </span>
  );
}

export default function HistorialCompras(navegacion) {
  const [compras, setCompras] = useState([]);
  const [compraSeleccionada, setCompraSeleccionada] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [error, setError] = useState("");
  const [errorDetalle, setErrorDetalle] = useState("");
  const [abriendoPago, setAbriendoPago] = useState(false);


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
    setAbriendoPago(true);
    setErrorDetalle("");
    try {
      irA(await crearLinkPago(compra.id));
    } catch (errorPago) {
      setErrorDetalle(errorPago.message || "No pudimos abrir Mercado Pago.");
      setAbriendoPago(false);
    }
  };

  return (
    <CuentaLayout
      {...navegacion}
      seccion="historial"
      titulo={compraSeleccionada ? `Pedido #${compraSeleccionada.id}` : "Historial de compras"}
      descripcion={compraSeleccionada ? null : "Las compras que hiciste."}
    >
      {error && (
        <p role="alert" className="text-center text-red-600 font-bold">
          {error}
        </p>
      )}

      {errorDetalle && (
        <p role="alert" className="text-center text-red-600 font-bold mb-6">
          {errorDetalle}
        </p>
      )}

      {cargando ? (
        <p role="status" className="text-center text-gray-500">
          Cargando historial de compras...
        </p>
      ) : compraSeleccionada ? (
        <section aria-label={`Detalle del pedido ${compraSeleccionada.id}`}>
          <button
            type="button"
            onClick={() => {
              setCompraSeleccionada(null);
              setErrorDetalle("");
            }}
            className="text-orange-500 text-sm font-bold hover:underline mb-6"
          >
            ← Volver al historial
          </button>
          <div className="mb-2">
            <EstadoPedido estado={compraSeleccionada.estado} />
          </div>
          <p className="text-gray-600 mb-2">
            Fecha: {formatearFecha(compraSeleccionada.fecha)}
          </p>
          {compraSeleccionada.direccion && (
            <p className="text-gray-600 mb-2">
              Envío: {textoDireccion(compraSeleccionada.direccion)}
            </p>
          )}
          {compraSeleccionada.metodoPago && (
            <p className="text-gray-600 mb-2">
              Pago: {compraSeleccionada.metodoPago}
              {PAGO_SIN_COMPLETAR[compraSeleccionada.estadoPago] &&
                ` (${PAGO_SIN_COMPLETAR[compraSeleccionada.estadoPago]})`}
            </p>
          )}
          {PAGO_SIN_COMPLETAR[compraSeleccionada.estadoPago] && (
            <button
              type="button"
              onClick={() => pagar(compraSeleccionada)}
              disabled={abriendoPago}
              className="bg-orange-500 hover:bg-orange-600 text-white rounded-md px-5 py-2.5 mb-4 text-sm font-black disabled:opacity-40"
            >
              {abriendoPago ? "ABRIENDO MERCADO PAGO..." : "PAGAR CON MERCADO PAGO"}
            </button>
          )}
          <p className="text-gray-900 font-black mb-6">
            Total: {formatearPrecio(compraSeleccionada.total)}
          </p>
          <ul className="space-y-3">
            {(compraSeleccionada.items || []).map((producto, index) => (
              <li
                key={producto.partId || index}
                className="flex justify-between gap-4 border-b border-gray-100 pb-3"
              >
                <div>
                  <p className="font-bold">
                    {producto.nombre || "Producto"}
                  </p>
                  {producto.codigo && (
                    <p className="text-xs text-gray-400">
                      Código: {producto.codigo}
                    </p>
                  )}
                  <p className="text-sm text-gray-500">
                    Cantidad: {producto.cantidad}
                  </p>
                </div>
                <p className="font-bold whitespace-nowrap">
                  Precio unitario: {formatearPrecio(producto.precio)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : cargandoDetalle ? (
        <p role="status" className="text-center text-gray-500">
          Cargando detalle de la compra...
        </p>
      ) : error ? null : compras.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-4xl mb-5">🛒</div>
          <p className="text-gray-500 text-sm font-bold">
            Todavía no realizaste ninguna compra.
          </p>
          <p className="text-gray-300 text-xs mt-2">
            Cuando realices una compra, aparecerá acá.
          </p>
        </div>
      ) : (
        <ul aria-label="Compras realizadas" className="space-y-5">
          {compras.map((compra) => (
            <li
              key={compra.id}
              className="border border-gray-200 rounded-xl p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
            >
              <div>
                <p className="text-[11px] text-gray-400 font-bold uppercase">
                  COMPRA
                </p>
                <p className="text-sm font-black text-gray-900">
                  #{compra.id}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-gray-400 font-bold uppercase">
                  FECHA
                </p>
                <p className="text-sm font-bold">
                  {formatearFecha(compra.fecha)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-gray-400 font-bold uppercase">
                  ESTADO
                </p>
                <EstadoPedido estado={compra.estado} />
              </div>
              <div>
                <p className="text-[11px] text-gray-400 font-bold uppercase">
                  TOTAL
                </p>
                <p className="text-lg font-black">
                  {formatearPrecio(compra.total)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => verDetalle(compra)}
                disabled={cargandoDetalle}
                aria-label={`Ver detalle del pedido #${compra.id}`}
                className="text-orange-500 text-sm font-bold hover:underline disabled:opacity-50"
              >
                Ver detalle
              </button>
            </li>
          ))}
        </ul>
      )}
    </CuentaLayout>
  );
}
