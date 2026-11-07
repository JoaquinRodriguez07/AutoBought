import { useState } from "react";
import { CircleAlertIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { obtenerPedidos } from "./apiDashboard";
import { formatearNumero, formatearPesos } from "./formato";
import { ESTADOS_PEDIDO, ORDENES_PEDIDO, formatearFechaPedido, useCambioDeEstado } from "./pedidos";
import { EstadoConsulta, Opciones, SinDatos } from "./piezas";
import { AccionesPedido, DialogoCancelarPedido, InsigniaEstadoPedido, InsigniaPago } from "./piezasPedido";
import { useConsulta } from "./useConsulta";

const POR_PAGINA = 50;
const ORDEN_POR_DEFECTO = "priority";
const ITEMS_ORDEN = Object.entries(ORDENES_PEDIDO).map(([value, label]) => ({ value, label }));

// Trae los primeros `visibles` pedidos de a una página por pedido (el
// backend no da más de 200 juntos). Se piden todas de nuevo cada vez, así
// un cambio de estado se ve en cualquier página que ya esté a la vista.
async function pedirVisibles(filtros, visibles) {
  const paginas = Math.ceil(visibles / POR_PAGINA);
  const respuestas = await Promise.all(
    Array.from({ length: paginas }, (_, i) =>
      obtenerPedidos(i === 0 ? { ...filtros, limite: POR_PAGINA } : { ...filtros, limite: POR_PAGINA, desde: i * POR_PAGINA })
    )
  );
  return { ...respuestas[0], pedidos: respuestas.flatMap((respuesta) => respuesta.pedidos) };
}

function textoProductos(items) {
  const unidades = items.reduce((total, item) => total + item.cantidad, 0);
  const primero = items[0] ? `${items[0].cantidad} × ${items[0].nombre}` : "";
  return items.length > 1 ? `${primero} y ${items.length - 1} más (${unidades} u.)` : primero;
}

// Cómo ordenar el listado, con el mismo desplegable que la categoría de la
// barra de filtros del dashboard.
function SelectorOrden({ valor, onCambiar }) {
  return (
    <div className="flex items-center gap-2">
      <span id="etiqueta-orden-pedidos" className="text-xs text-muted-foreground whitespace-nowrap">
        Ordenar por
      </span>
      <Select items={ITEMS_ORDEN} value={valor} onValueChange={onCambiar}>
        <SelectTrigger aria-labelledby="etiqueta-orden-pedidos" className="h-9 w-full sm:w-48 bg-card">
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          {ITEMS_ORDEN.map((item) => (
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
export default function PedidosVendedor({ estadoInicial = "todos", onCambio, onDetalle }) {
  const [estado, setEstado] = useState(estadoInicial in ESTADOS_PEDIDO ? estadoInicial : "todos");
  const [orden, setOrden] = useState(ORDEN_POR_DEFECTO);
  const [visibles, setVisibles] = useState(POR_PAGINA);
  const [version, setVersion] = useState(0);

  const consulta = useConsulta(
    () =>
      pedirVisibles(
        {
          estado: estado === "todos" ? undefined : estado,
          orden: orden === ORDEN_POR_DEFECTO ? undefined : orden,
        },
        visibles
      ),
    `${estado}|${orden}|${visibles}|${version}`
  );
  const cambio = useCambioDeEstado((pedido) => {
    setVersion((v) => v + 1);
    if (pedido) onCambio?.();
  });

  // Otro filtro u orden: se vuelve a la primera página.
  const elegir = (cambiar) => (valor) => {
    cambiar(valor);
    setVisibles(POR_PAGINA);
    cambio.limpiarError();
  };

  return (
    <EstadoConsulta consulta={consulta}>
      {({ pedidos, total, porEstado }) => {
        const todos = Object.values(porEstado).reduce((suma, n) => suma + n, 0);
        return (
          <div className="flex flex-col gap-4">
            <section
              aria-label="Filtros de pedidos"
              className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between"
            >
              <Opciones
                etiqueta="Estado del pedido"
                valor={estado}
                onCambiar={elegir(setEstado)}
                opciones={[
                  ["todos", `Todos (${formatearNumero(todos)})`],
                  ...Object.entries(ESTADOS_PEDIDO).map(([valor, { texto }]) => [
                    valor,
                    `${texto} (${formatearNumero(porEstado[valor] ?? 0)})`,
                  ]),
                ]}
              />
              <SelectorOrden valor={orden} onCambiar={elegir(setOrden)} />
            </section>

            {cambio.error && (
              <Alert variant="destructive">
                <CircleAlertIcon />
                <AlertDescription>{cambio.error}</AlertDescription>
              </Alert>
            )}

            {pedidos.length === 0 ? (
              <SinDatos>
                {estado === "todos" ? "Todavía no hay pedidos." : `No hay pedidos en «${ESTADOS_PEDIDO[estado].texto}».`}
              </SinDatos>
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
                          <span className="block text-xs text-muted-foreground">{formatearFechaPedido(pedido.fecha)}</span>
                        </TableCell>
                        <TableCell>
                          <span className="block">{pedido.cliente.nombre}</span>
                          <span className="block text-xs text-muted-foreground">{pedido.cliente.email}</span>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-muted-foreground max-w-[260px] truncate">
                          {textoProductos(pedido.items)}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{formatearPesos(pedido.total)}</TableCell>
                        <TableCell>
                          <InsigniaPago pedido={pedido} />
                        </TableCell>
                        <TableCell>
                          <InsigniaEstadoPedido estado={pedido.estado} />
                          {pedido.motivoCancelacion && (
                            <span className="block mt-1 text-xs text-muted-foreground max-w-[200px] truncate" title={pedido.motivoCancelacion}>
                              {pedido.motivoCancelacion}
                            </span>
                          )}
                        </TableCell>
                        {/* Los botones hacen lo suyo, sin abrir el detalle. */}
                        <TableCell className="pr-4 sm:pr-5 text-right" onClick={(event) => event.stopPropagation()}>
                          <AccionesPedido
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
                    Mostrando {formatearNumero(pedidos.length)} de {formatearNumero(total)} pedidos.
                  </p>
                  {total > pedidos.length && (
                    <Button variant="outline" size="sm" onClick={() => setVisibles((v) => v + POR_PAGINA)} className="text-xs">
                      Mostrar {formatearNumero(Math.min(POR_PAGINA, total - pedidos.length))} más
                    </Button>
                  )}
                </div>
              </section>
            )}

            <DialogoCancelarPedido pedido={cambio.aCancelar} onCerrar={cambio.cerrarCancelar} onCancelado={cambio.alCancelar} />
          </div>
        );
      }}
    </EstadoConsulta>
  );
}
