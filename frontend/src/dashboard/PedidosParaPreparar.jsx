import { ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { obtenerPedidos } from "./apiDashboard";
import { formatearNumero, formatearPesos } from "./formato";
import { formatearFechaPedido } from "./pedidos";
import { EstadoConsulta, Panel, SinDatos } from "./piezas";
import { useConsulta } from "./useConsulta";

function textoProductos(items) {
  const unidades = items.reduce((total, item) => total + item.cantidad, 0);
  const primero = items[0]?.nombre ?? "";
  return items.length > 1 ? `${primero} y ${items.length - 1} más · ${unidades} u.` : `${primero} · ${unidades} u.`;
}

// Resumen del dashboard (SCRUM-171): los pedidos pagados que esperan que
// alguien los empiece a preparar, del que lleva más esperando al más
// nuevo. Cada uno abre su detalle. `version` sube cuando cambia algo.
export default function PedidosParaPreparar({ limite = 5, version, onDetalle, onVerTodos }) {
  const consulta = useConsulta(
    () => obtenerPedidos({ estado: "confirmed", soloPagados: true, limite }),
    `para-preparar|${limite}|${version}`
  );

  return (
    <Panel
      titulo="Pedidos para preparar"
      id="titulo-pedidos-para-preparar"
      detalle="Pagados y sin empezar. Tocá uno para ver el detalle."
      accion={
        <Button variant="ghost" size="sm" onClick={onVerTodos} className="text-xs text-orange-600 hover:text-orange-700">
          Ver todos
          <ChevronRightIcon />
        </Button>
      }
    >
      <EstadoConsulta consulta={consulta}>
        {({ pedidos, total }) =>
          pedidos.length === 0 ? (
            <SinDatos>No hay pedidos pagados esperando. ¡Todo al día!</SinDatos>
          ) : (
            <>
              <ul aria-label="Pedidos para preparar" className="-mx-1 flex flex-col divide-y">
                {pedidos.map((pedido) => (
                  <li key={pedido.id}>
                    <button
                      type="button"
                      onClick={() => onDetalle(pedido.id)}
                      aria-label={`Ver el detalle del pedido #${pedido.id} de ${pedido.cliente.nombre}`}
                      className="group flex w-full items-center gap-3 px-1 py-3 text-left"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="truncate text-sm font-medium group-hover:text-orange-600 group-hover:underline underline-offset-2">
                            <span className="tabular-nums">#{pedido.id}</span> · {pedido.cliente.nombre}
                          </span>
                          <span className="shrink-0 text-sm font-semibold tabular-nums">{formatearPesos(pedido.total)}</span>
                        </span>
                        <span className="mt-0.5 flex justify-between gap-3 text-xs text-muted-foreground">
                          <span className="truncate">{textoProductos(pedido.items)}</span>
                          <span className="shrink-0">{formatearFechaPedido(pedido.fecha)}</span>
                        </span>
                      </span>
                      <ChevronRightIcon className="size-4 shrink-0 text-gray-400 group-hover:text-orange-600" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
              {total > pedidos.length && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Y {formatearNumero(total - pedidos.length)} más esperando.
                </p>
              )}
            </>
          )
        }
      </EstadoConsulta>
    </Panel>
  );
}
