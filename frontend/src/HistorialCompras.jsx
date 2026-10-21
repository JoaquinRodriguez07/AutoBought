import { useEffect, useState } from "react";

import { obtenerDetalleCompra, obtenerHistorialCompras } from "./api";
import Navbar from "./Navbar";

const ESTADOS_PEDIDO = {
  confirmed: { texto: "Confirmado", clase: "bg-blue-50 text-blue-700" },
  shipped: { texto: "Enviado", clase: "bg-orange-50 text-orange-700" },
  delivered: { texto: "Entregado", clase: "bg-green-50 text-green-700" },
  cancelled: { texto: "Cancelado", clase: "bg-gray-100 text-gray-500" },
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
    <span className={`inline-block rounded-full px-3 py-1 text-[9px] font-black uppercase ${clase}`}>
      {texto}
    </span>
  );
}

export default function HistorialCompras({
  onHome,
  onCatalogo,
  onLogin,
  onMarcas,
  onCarrito,
  onFavoritos,
  cantidadCarrito = 0,
  cantidadFavoritos = 0,
  onPerfil,
}) {
  const [compras, setCompras] = useState([]);
  const [compraSeleccionada, setCompraSeleccionada] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [error, setError] = useState("");
  const [errorDetalle, setErrorDetalle] = useState("");


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

  return (
    <div className="min-h-screen flex flex-col font-sans bg-linear-to-b from-black to-[#492202]">
      <Navbar
        paginaActual="perfil"
        onHome={onHome}
        onCatalogo={onCatalogo}
        onLogin={onLogin}
        onMarcas={onMarcas}
        onCarrito={onCarrito}
        onFavoritos={onFavoritos}
        cantidadCarrito={cantidadCarrito}
        cantidadFavoritos={cantidadFavoritos}
      />

      <main className="min-h-screen flex items-center justify-center px-5 pt-24 pb-10">
        <div className="w-full max-w-[950px] bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-gray-50 border-b border-gray-200 px-8 md:px-12 py-8">
            <button
              type="button"
              onClick={onPerfil}
              className="text-orange-500 text-[9px] font-bold hover:underline mb-4"
            >
              ← VOLVER A MI PERFIL
            </button>
            <p className="text-orange-500 text-[9px] font-black tracking-[4px]">
              AUTOBOUGHT
            </p>
            <h1 className="text-3xl font-black italic uppercase mt-2 text-gray-900">
              {compraSeleccionada ? "DETALLE DE COMPRA" : "HISTORIAL DE COMPRAS"}
            </h1>
            <p className="text-gray-400 text-[10px] mt-2">
              {compraSeleccionada
                ? `Pedido #${compraSeleccionada.id}`
                : "Consultá tus compras realizadas anteriormente."}
            </p>
          </div>

          <div className="p-8 md:p-12">
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
                  </p>
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
                <p className="text-gray-300 text-[9px] mt-2">
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
                      <p className="text-[8px] text-gray-400 font-bold uppercase">
                        COMPRA
                      </p>
                      <p className="text-sm font-black text-gray-900">
                        #{compra.id}
                      </p>
                    </div>
                    <div>
                      <p className="text-[8px] text-gray-400 font-bold uppercase">
                        FECHA
                      </p>
                      <p className="text-sm font-bold">
                        {formatearFecha(compra.fecha)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[8px] text-gray-400 font-bold uppercase">
                        ESTADO
                      </p>
                      <EstadoPedido estado={compra.estado} />
                    </div>
                    <div>
                      <p className="text-[8px] text-gray-400 font-bold uppercase">
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
          </div>
        </div>
      </main>
    </div>
  );
}
