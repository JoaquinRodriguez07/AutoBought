import { useNavigate } from "react-router-dom";

import { usePedidos } from "./context/PedidosContext";
import { IconoCaja, IconoCamion, IconoCheck, IconoTarjeta } from "./Iconos";
import { pagaloAntesDe } from "./plazoPago";
import {
  faltaPagar,
  formatearPrecio,
  fraseCorta,
  fraseDelEstado,
  ordenarPorAvance,
  pasosDeSeguimiento,
} from "./seguimientoPedido";

// Cuántos pedidos entran en la tarjeta; el resto, en «Mis pedidos».
const MAXIMO = 3;

function iconoDe(pedido) {
  if (faltaPagar(pedido)) return IconoTarjeta;
  return { shipped: IconoCamion, packing: IconoCaja }[pedido.estado] ?? IconoCheck;
}

/** Las cuatro etapas en segmentos: las hechas en naranja. */
function Progreso({ pedido }) {
  const pasos = pasosDeSeguimiento(pedido);
  const hechos = pasos.filter((paso) => paso.hecho).length;
  return (
    <div
      role="img"
      aria-label={`Progreso del pedido #${pedido.id}: ${hechos} de ${pasos.length} etapas`}
      className="mt-3 grid grid-cols-4 gap-1"
    >
      {pasos.map((paso) => (
        <span key={paso.estado} className={`h-1.5 rounded-full ${paso.hecho ? "bg-orange-500" : "bg-white/25"}`} />
      ))}
    </div>
  );
}

/**
 * Los pedidos en curso del cliente, en el banner del inicio: debajo del
 * selector de auto, en un recuadro blanco semitransparente, hasta 3
 * pedidos del más avanzado al menos. Sin sesión o sin pedidos en
 * curso no se muestra.
 */
export default function PedidosEnCursoInicio() {
  const { enCurso } = usePedidos();
  const navigate = useNavigate();

  if (enCurso.length === 0) return null;

  const pedidos = ordenarPorAvance(enCurso).slice(0, MAXIMO);
  const columnas = { 1: "md:grid-cols-1", 2: "md:grid-cols-2", 3: "md:grid-cols-3" }[pedidos.length];

  return (
    // Dentro del banner, debajo del selector: blanco semitransparente
    // (vidrio esmerilado), para distinguirse del selector oscuro.
    <section
      aria-labelledby="titulo-pedidos-en-curso"
      className="mt-4 bg-white/[0.22] backdrop-blur-md border border-white/30 rounded-xl shadow-2xl"
    >
      <div className="flex items-center justify-between gap-4 px-5 md:px-6 pt-5">
        <div className="flex items-baseline gap-3 flex-wrap">
          <p className="text-orange-500 text-xs font-black tracking-[3px] whitespace-nowrap">SEGUÍ TU COMPRA</p>
          <h2 id="titulo-pedidos-en-curso" className="text-sm font-black text-white">
            Tus pedidos en curso
          </h2>
        </div>
        <button
          type="button"
          onClick={() => navigate("/pedidos")}
          className="text-orange-400 text-sm font-bold hover:text-orange-300 whitespace-nowrap"
        >
          {enCurso.length > MAXIMO ? `Ver los ${enCurso.length} →` : "Ver todo →"}
        </button>
      </div>

      <ul className={`grid grid-cols-1 ${columnas} divide-y md:divide-y-0 md:divide-x divide-white/20 mt-2`}>
        {pedidos.map((pedido) => {
          const sinPagar = faltaPagar(pedido);
          const Icono = iconoDe(pedido);
          return (
            <li key={pedido.id}>
              <button
                type="button"
                onClick={() => navigate(`/pedidos/${pedido.id}`)}
                aria-label={`Ver el seguimiento del pedido #${pedido.id}: ${fraseDelEstado(pedido)}`}
                className="group w-full h-full text-left px-5 md:px-6 py-4 rounded-xl hover:bg-white/10 transition"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center ${
                      sinPagar ? "bg-amber-400/10 text-amber-300" : "bg-orange-500/20 text-orange-300"
                    }`}
                  >
                    <Icono className="w-5 h-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`font-black ${sinPagar ? "text-amber-300" : "text-white"}`}>
                        {fraseCorta(pedido)}
                      </p>
                      <span aria-hidden="true" className="text-gray-400 group-hover:text-orange-300 transition">
                        →
                      </span>
                    </div>
                    <p className="text-xs text-gray-300 mt-0.5">
                      Pedido #{pedido.id} · {formatearPrecio(pedido.total)}
                    </p>
                    {sinPagar ? (
                      pedido.vencePago && (
                        <p className="text-xs text-amber-200/90 mt-3">{pagaloAntesDe(pedido.vencePago)}</p>
                      )
                    ) : (
                      <Progreso pedido={pedido} />
                    )}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
