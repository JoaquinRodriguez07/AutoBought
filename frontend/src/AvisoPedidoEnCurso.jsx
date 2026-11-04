import { useNavigate } from "react-router-dom";

import { usePedidos } from "./context/PedidosContext";
import { IconoCamion } from "./Iconos";
import { faltaPagar } from "./seguimientoPedido";

// Cuál mostrar si hay varios: el que está más cerca de llegar.
const PRIORIDAD = { shipped: 0, packing: 1, confirmed: 2 };

function masAvanzado(pedidos) {
  return [...pedidos].sort(
    (a, b) =>
      (faltaPagar(a) ? 9 : PRIORIDAD[a.estado] ?? 5) - (faltaPagar(b) ? 9 : PRIORIDAD[b.estado] ?? 5)
  )[0];
}

function textoDelAviso(pedido) {
  const numero = `#${pedido.id}`;
  if (faltaPagar(pedido)) {
    return pedido.estadoPago === "rejected"
      ? `El pago de tu pedido ${numero} fue rechazado`
      : `Tu pedido ${numero} está esperando el pago`;
  }
  return {
    shipped: `Tu pedido ${numero} está en camino`,
    packing: `Estamos empaquetando tu pedido ${numero}`,
  }[pedido.estado] ?? `Estamos preparando tu pedido ${numero}`;
}

/**
 * El aviso del inicio (arriba del título del banner) cuando el cliente tiene pedidos en curso: le dice en
 * qué anda el más avanzado y lo lleva a seguirlo. Sin pedidos en curso no
 * se muestra.
 */
export default function AvisoPedidoEnCurso() {
  const { enCurso } = usePedidos();
  const navigate = useNavigate();

  if (enCurso.length === 0) return null;

  const pedido = masAvanzado(enCurso);
  const varios = enCurso.length > 1;
  const texto = textoDelAviso(pedido);

  return (
    <section
      aria-label="Tus pedidos en curso"
      className="mb-8 max-w-[680px] bg-white/95 rounded-xl shadow-2xl px-4 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <p className="flex items-center gap-3 text-sm text-gray-800">
          <IconoCamion className="w-5 h-5 shrink-0 text-orange-500" />
          <span>
            <span className="font-black">{texto}</span>
            {varios && <span className="text-gray-600"> · Tenés {enCurso.length} pedidos en curso</span>}
          </span>
        </p>
        <button
          type="button"
          onClick={() => navigate(varios ? "/pedidos" : `/pedidos/${pedido.id}`)}
          className="text-sm font-black text-orange-600 hover:underline whitespace-nowrap"
        >
          {varios ? "Ver mis pedidos →" : "Ver seguimiento →"}
        </button>
      </div>
    </section>
  );
}
