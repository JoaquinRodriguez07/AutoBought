// Listado de pedidos del portal del vendedor.

import { useState } from "react";
import { CircleAlertIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getOrders } from "./dashboardApi";
import { formatNumber, formatPesos } from "./format";
import { ORDER_STATUSES, ORDER_SORTS, formatOrderDate, useStatusChange } from "./orders";
import { QueryState, Options, NoData } from "./pieces";
import { OrderActions, CancelOrderDialog, OrderStatusBadgeSeller, PaymentBadge } from "./orderPieces";
import { useQuery } from "./useQuery";

const PAGE_SIZE = 50;
const DEFAULT_SORT = "priority";
const SORT_ITEMS = Object.entries(ORDER_SORTS).map(([value, label]) => ({ value, label }));

// Trae los primeros `visibles` pedidos de a una página por pedido (el
// backend no da más de 200 juntos). Se piden todas de nuevo cada vez, así
// un cambio de estado se ve en cualquier página que ya esté a la vista.
async function fetchVisible(filters, visible) {
  const paginas = Math.ceil(visible / PAGE_SIZE);
  const responses = await Promise.all(
    Array.from({ length: paginas }, (_, i) =>
      getOrders(i === 0 ? { ...filters, limit: PAGE_SIZE } : { ...filters, limit: PAGE_SIZE, from: i * PAGE_SIZE })
    )
  );
  return { ...responses[0], orders: responses.flatMap((response) => response.orders) };
}

function productsText(items) {
  const units = items.reduce((total, item) => total + item.quantity, 0);
  const first = items[0] ? `${items[0].quantity} × ${items[0].displayName}` : "";
  return items.length > 1 ? `${first} y ${items.length - 1} más (${units} u.)` : first;
}

// Cómo ordenar el listado, con el mismo desplegable que la categoría de la
// barra de filtros del dashboard.
function SortSelector({ rawValue, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <span id="etiqueta-orden-pedidos" className="text-xs text-muted-foreground whitespace-nowrap">
        Ordenar por
      </span>
      <Select items={SORT_ITEMS} value={rawValue} onValueChange={onChange}>
        <SelectTrigger aria-labelledby="etiqueta-orden-pedidos" className="h-9 w-full sm:w-48 bg-card">
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          {SORT_ITEMS.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// Pedidos de todos los clientes (SCRUM-171): filtro por estado, orden y
// botón para pasar cada uno al siguiente. Tocar la fila abre el detalle
// (`onDetalle`). `onCambio` avisa al Dashboard (el número del menú).
// `estadoInicial` llega por la URL (?estado=).
export default function SellerOrders({ initialStatus = "all", onCambio, onDetail }) {
  const [estado, setStatus] = useState(initialStatus in ORDER_STATUSES ? initialStatus : "all");
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [version, setVersion] = useState(0);

  const queryState = useQuery(
    () =>
      fetchVisible(
        {
          estado: estado === "all" ? undefined : estado,
          sort: sort === DEFAULT_SORT ? undefined : sort,
        },
        visible
      ),
    `${estado}|${sort}|${visible}|${version}`
  );
  const cambio = useStatusChange((pedido) => {
    setVersion((v) => v + 1);
    if (pedido) onCambio?.();
  });

  // Otro filtro u orden: se vuelve a la primera página.
  const choose = (change) => (rawValue) => {
    change(rawValue);
    setVisible(PAGE_SIZE);
    cambio.clearError();
  };

  return (
    <QueryState queryState={queryState}>
      {({ orders, total, byStatus }) => {
        const all = Object.values(byStatus).reduce((suma, n) => suma + n, 0);
        return (
          <div className="flex flex-col gap-4">
            <section
              aria-label="Filtros de pedidos"
              className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between"
            >
              <Options
                label="Estado del pedido"
                rawValue={estado}
                onChange={choose(setStatus)}
                opciones={[
                  ["all", `Todos (${formatNumber(all)})`],
                  ...Object.entries(ORDER_STATUSES).map(([rawValue, { texto }]) => [
                    rawValue,
                    `${texto} (${formatNumber(byStatus[rawValue] ?? 0)})`,
                  ]),
                ]}
              />
              <SortSelector rawValue={sort} onChange={choose(setSort)} />
            </section>

            {cambio.error && (
              <Alert variant="destructive">
                <CircleAlertIcon />
                <AlertDescription>{cambio.error}</AlertDescription>
              </Alert>
            )}

            {orders.length === 0 ? (
              <NoData>
                {estado === "all" ? "Todavía no hay pedidos." : `No hay pedidos en «${ORDER_STATUSES[estado].texto}».`}
              </NoData>
            ) : (
              <section aria-label="Listado de pedidos" className="rounded-xl border bg-card shadow-xs">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-4 sm:pl-5">Pedido</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="hidden lg:table-cell">Productos</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Pago</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="pr-4 sm:pr-5 text-right">
                        <span className="sr-only">Acciones</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((pedido) => (
                      // Toda la fila abre el detalle; con teclado, el número (un botón).
                      <TableRow key={pedido.id} onClick={() => onDetail?.(pedido.id)} className="cursor-pointer">
                        <TableCell className="pl-4 sm:pl-5">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onDetail?.(pedido.id);
                            }}
                            aria-label={`Ver el detalle del pedido #${pedido.id}`}
                            className="font-medium tabular-nums hover:text-orange-600 hover:underline underline-offset-2"
                          >
                            #{pedido.id}
                          </button>
                          <span className="block text-xs text-muted-foreground">{formatOrderDate(pedido.date)}</span>
                        </TableCell>
                        <TableCell>
                          <span className="block">{pedido.customer.displayName}</span>
                          <span className="block text-xs text-muted-foreground">{pedido.customer.email}</span>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-muted-foreground max-w-[260px] truncate">
                          {productsText(pedido.items)}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{formatPesos(pedido.total)}</TableCell>
                        <TableCell>
                          <PaymentBadge pedido={pedido} />
                        </TableCell>
                        <TableCell>
                          <OrderStatusBadgeSeller estado={pedido.estado} />
                          {pedido.reasonCancellation && (
                            <span className="block mt-1 text-xs text-muted-foreground max-w-[200px] truncate" title={pedido.reasonCancellation}>
                              {pedido.reasonCancellation}
                            </span>
                          )}
                        </TableCell>
                        {/* Los botones hacen lo suyo, sin abrir el detalle. */}
                        <TableCell className="pr-4 sm:pr-5 text-right" onClick={(event) => event.stopPropagation()}>
                          <OrderActions
                            pedido={pedido}
                            busy={cambio.busy}
                            onAvanzar={cambio.avanzar}
                            onCancel={cambio.askCancel}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 sm:px-5">
                  <p className="text-xs text-muted-foreground">
                    Mostrando {formatNumber(orders.length)} de {formatNumber(total)} pedidos.
                  </p>
                  {total > orders.length && (
                    <Button variant="outline" size="sm" onClick={() => setVisible((v) => v + PAGE_SIZE)} className="text-xs">
                      Mostrar {formatNumber(Math.min(PAGE_SIZE, total - orders.length))} más
                    </Button>
                  )}
                </div>
              </section>
            )}

            <CancelOrderDialog pedido={cambio.toCancel} onClose={cambio.closeCancel} onCancelled={cambio.onCancel} />
          </div>
        );
      }}
    </QueryState>
  );
}
