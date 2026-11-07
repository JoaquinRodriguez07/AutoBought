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
async function fetchVisible(filtros, visibles) {
  const paginas = Math.ceil(visibles / PAGE_SIZE);
  const respuestas = await Promise.all(
    Array.from({ length: paginas }, (_, i) =>
      getOrders(i === 0 ? { ...filtros, limite: PAGE_SIZE } : { ...filtros, limite: PAGE_SIZE, desde: i * PAGE_SIZE })
    )
  );
  return { ...respuestas[0], pedidos: respuestas.flatMap((respuesta) => respuesta.pedidos) };
}

function productsText(items) {
  const unidades = items.reduce((total, item) => total + item.cantidad, 0);
  const primero = items[0] ? `${items[0].cantidad} × ${items[0].nombre}` : "";
  return items.length > 1 ? `${primero} y ${items.length - 1} más (${unidades} u.)` : primero;
}

// Cómo ordenar el listado, con el mismo desplegable que la categoría de la
// barra de filtros del dashboard.
function SortSelector({ valor, onCambiar }) {
  return (
    <div className="flex items-center gap-2">
      <span id="etiqueta-orden-pedidos" className="text-xs text-muted-foreground whitespace-nowrap">
        Ordenar por
      </span>
      <Select items={SORT_ITEMS} value={valor} onValueChange={onCambiar}>
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
export default function SellerOrders({ estadoInicial = "todos", onCambio, onDetalle }) {
  const [estado, setEstado] = useState(estadoInicial in ORDER_STATUSES ? estadoInicial : "todos");
  const [orden, setOrden] = useState(DEFAULT_SORT);
  const [visibles, setVisibles] = useState(PAGE_SIZE);
  const [version, setVersion] = useState(0);

  const consulta = useQuery(
    () =>
      fetchVisible(
        {
          estado: estado === "todos" ? undefined : estado,
          orden: orden === DEFAULT_SORT ? undefined : orden,
        },
        visibles
      ),
    `${estado}|${orden}|${visibles}|${version}`
  );
  const cambio = useStatusChange((pedido) => {
    setVersion((v) => v + 1);
    if (pedido) onCambio?.();
  });

  // Otro filtro u orden: se vuelve a la primera página.
  const elegir = (cambiar) => (valor) => {
    cambiar(valor);
    setVisibles(PAGE_SIZE);
    cambio.limpiarError();
  };

  return (
    <QueryState consulta={consulta}>
      {({ pedidos, total, porEstado }) => {
        const todos = Object.values(porEstado).reduce((suma, n) => suma + n, 0);
        return (
          <div className="flex flex-col gap-4">
            <section
              aria-label="Filtros de pedidos"
              className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between"
            >
              <Options
                etiqueta="Estado del pedido"
                valor={estado}
                onCambiar={elegir(setEstado)}
                opciones={[
                  ["todos", `Todos (${formatNumber(todos)})`],
                  ...Object.entries(ORDER_STATUSES).map(([valor, { texto }]) => [
                    valor,
                    `${texto} (${formatNumber(porEstado[valor] ?? 0)})`,
                  ]),
                ]}
              />
              <SortSelector valor={orden} onCambiar={elegir(setOrden)} />
            </section>

            {cambio.error && (
              <Alert variant="destructive">
                <CircleAlertIcon />
                <AlertDescription>{cambio.error}</AlertDescription>
              </Alert>
            )}

            {pedidos.length === 0 ? (
              <NoData>
                {estado === "todos" ? "Todavía no hay pedidos." : `No hay pedidos en «${ORDER_STATUSES[estado].texto}».`}
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
                    {pedidos.map((pedido) => (
                      // Toda la fila abre el detalle; con teclado, el número (un botón).
                      <TableRow key={pedido.id} onClick={() => onDetalle?.(pedido.id)} className="cursor-pointer">
                        <TableCell className="pl-4 sm:pl-5">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onDetalle?.(pedido.id);
                            }}
                            aria-label={`Ver el detalle del pedido #${pedido.id}`}
                            className="font-medium tabular-nums hover:text-orange-600 hover:underline underline-offset-2"
                          >
                            #{pedido.id}
                          </button>
                          <span className="block text-xs text-muted-foreground">{formatOrderDate(pedido.fecha)}</span>
                        </TableCell>
                        <TableCell>
                          <span className="block">{pedido.cliente.nombre}</span>
                          <span className="block text-xs text-muted-foreground">{pedido.cliente.email}</span>
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
                          {pedido.motivoCancelacion && (
                            <span className="block mt-1 text-xs text-muted-foreground max-w-[200px] truncate" title={pedido.motivoCancelacion}>
                              {pedido.motivoCancelacion}
                            </span>
                          )}
                        </TableCell>
                        {/* Los botones hacen lo suyo, sin abrir el detalle. */}
                        <TableCell className="pr-4 sm:pr-5 text-right" onClick={(event) => event.stopPropagation()}>
                          <OrderActions
                            pedido={pedido}
                            ocupado={cambio.ocupado}
                            onAvanzar={cambio.avanzar}
                            onCancelar={cambio.pedirCancelar}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 sm:px-5">
                  <p className="text-xs text-muted-foreground">
                    Mostrando {formatNumber(pedidos.length)} de {formatNumber(total)} pedidos.
                  </p>
                  {total > pedidos.length && (
                    <Button variant="outline" size="sm" onClick={() => setVisibles((v) => v + PAGE_SIZE)} className="text-xs">
                      Mostrar {formatNumber(Math.min(PAGE_SIZE, total - pedidos.length))} más
                    </Button>
                  )}
                </div>
              </section>
            )}

            <CancelOrderDialog pedido={cambio.aCancelar} onCerrar={cambio.cerrarCancelar} onCancelado={cambio.alCancelar} />
          </div>
        );
      }}
    </QueryState>
  );
}
