import { useNavigate } from "react-router-dom";

import { usePedidos } from "./context/PedidosContext";
import { textoPlazoPago } from "./plazoPago";
import { faltaPagar, formatearPrecio, fraseDelEstado } from "./seguimientoPedido";
import { BarraProgreso } from "./TarjetaPedidoEnCurso";

// Cuántos pedidos se muestran en el inicio; el resto, en «Mis pedidos».
const MAXIMO = 2;

// Primero los que están más cerca de llegar; los que falta pagar, al final.
const PRIORIDAD = { shipped: 0, packing: 1, confirmed: 2 };
const prioridad = (pedido) => (faltaPagar(pedido) ? 9 : PRIORIDAD[pedido.estado] ?? 5);

function cantidadDeProductos(pedido) {
  const unidades = (pedido.items || []).reduce((total, item) => total + (item.cantidad || 0), 0);
  if (!unidades) return "";
  return unidades === 1 ? "1 producto" : `${unidades} productos`;
}

/**
 * Sección del inicio con los pedidos en curso del cliente (como "Las
 * mejores marcas", con su encabezado): qué pasa con cada uno y su
 * progreso. Sin pedidos en curso no se muestra.
 */
export default function PedidosEnCursoInicio() {
  const { enCurso } = usePedidos();
  const navigate = useNavigate();

  if (enCurso.length === 0) return null;

  const pedidos = [...enCurso].sort((a, b) => prioridad(a) - prioridad(b)).slice(0, MAXIMO);

  return (
    <section aria-labelledby="titulo-pedidos-en-curso" className="bg-white border-b border-gray-100">
      <div className="max-w-[1100px] mx-auto px-6 md:px-10 pt-10 pb-10">
        <div className="flex items-end justify-between gap-4 mb-5">
          <div>
            <p className="text-orange-500 text-xs font-black tracking-[4px]">SEGUÍ TU COMPRA</p>
            <h2 id="titulo-pedidos-en-curso" className="text-xl md:text-2xl font-black italic uppercase mt-1">
              Tus pedidos en curso
            </h2>
          </div>
          <button
            type="button"
            onClick={() => navigate("/pedidos")}
            className="text-orange-500 text-sm font-bold hover:underline whitespace-nowrap"
          >
            {enCurso.length > MAXIMO ? `Ver los ${enCurso.length} →` : "Ver mis pedidos →"}
          </button>
        </div>

        <ul className={`grid grid-cols-1 gap-4 ${pedidos.length > 1 ? "md:grid-cols-2" : ""}`}>
          {pedidos.map((pedido) => {
            const sinPagar = faltaPagar(pedido);
            const detalle = [`Pedido #${pedido.id}`, cantidadDeProductos(pedido), formatearPrecio(pedido.total)]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={pedido.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/pedidos/${pedido.id}`)}
                  aria-label={`Ver el seguimiento del pedido #${pedido.id}: ${fraseDelEstado(pedido)}`}
                  className="w-full text-left rounded-xl border border-gray-200 bg-white p-5 transition hover:border-orange-300 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className={`text-lg font-black ${sinPagar ? "text-amber-700" : "text-gray-900"}`}>
                        {fraseDelEstado(pedido)}
                      </p>
                      <p className="text-sm text-gray-500 mt-0.5">{detalle}</p>
                    </div>
                    <span className="text-sm font-bold text-orange-500 whitespace-nowrap">
                      {sinPagar ? "Pagar →" : "Ver seguimiento →"}
                    </span>
                  </div>
                  {sinPagar ? (
                    pedido.vencePago && (
                      <p className="mt-4 text-sm text-gray-600">
                        Tus repuestos quedan reservados hasta {textoPlazoPago(pedido.vencePago)}.
                      </p>
                    )
                  ) : (
                    <BarraProgreso compra={pedido} />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
