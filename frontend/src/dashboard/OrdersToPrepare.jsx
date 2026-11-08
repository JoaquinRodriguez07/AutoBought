// Resumen de los pedidos pagados que esperan que se preparen.

import { ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getOrders } from "./dashboardApi";
import { formatNumber, formatPesos } from "./format";
import { formatOrderDate } from "./orders";
import { QueryState, Panel, NoData } from "./pieces";
import { useQuery } from "./useQuery";

function productsText(items) {
  const units = items.reduce((total, item) => total + item.quantity, 0);
  const first = items[0]?.displayName ?? "";
  return items.length > 1 ? `${first} y ${items.length - 1} más · ${units} u.` : `${first} · ${units} u.`;
}

// Resumen del dashboard (SCRUM-171): los pedidos pagados que esperan que
// alguien los empiece a preparar, del que lleva más esperando al más
// nuevo. Cada uno abre su detalle. `version` sube cuando cambia algo.
export default function OrdersToPrepare({ limit = 5, version, onDetail, onSeeAll }) {
  const queryState = useQuery(
    () => getOrders({ estado: "confirmed", onlyPaid: true, limit }),
    `para-preparar|${limit}|${version}`
  );

  return (
    <Panel
      title="Pedidos para preparar"
      id="titulo-pedidos-para-preparar"
      details="Pagados y sin empezar. Tocá uno para ver el detalle."
      action={
        <Button variant="ghost" size="sm" onClick={onSeeAll} className="text-xs text-orange-600 hover:text-orange-700">
          Ver todos
          <ChevronRightIcon />
        </Button>
      }
    >
      <QueryState queryState={queryState}>
        {({ orders, total }) =>
          orders.length === 0 ? (
            <NoData>No hay pedidos pagados esperando. ¡Todo al día!</NoData>
          ) : (
            <>
              <ul aria-label="Pedidos para preparar" className="-mx-1 flex flex-col divide-y">
                {orders.map((pedido) => (
                  <li key={pedido.id}>
                    <button
                      type="button"
                      onClick={() => onDetail(pedido.id)}
                      aria-label={`Ver el detalle del pedido #${pedido.id} de ${pedido.customer.displayName}`}
                      className="group flex w-full items-center gap-3 px-1 py-3 text-left"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="truncate text-sm font-medium group-hover:text-orange-600 group-hover:underline underline-offset-2">
                            <span className="tabular-nums">#{pedido.id}</span> · {pedido.customer.displayName}
                          </span>
                          <span className="shrink-0 text-sm font-semibold tabular-nums">{formatPesos(pedido.total)}</span>
                        </span>
                        <span className="mt-0.5 flex justify-between gap-3 text-xs text-muted-foreground">
                          <span className="truncate">{productsText(pedido.items)}</span>
                          <span className="shrink-0">{formatOrderDate(pedido.date)}</span>
                        </span>
                      </span>
                      <ChevronRightIcon className="size-4 shrink-0 text-gray-400 group-hover:text-orange-600" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
              {total > orders.length && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Y {formatNumber(total - orders.length)} más esperando.
                </p>
              )}
            </>
          )
        }
      </QueryState>
    </Panel>
  );
}
