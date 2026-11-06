import { useState } from "react";
import { CircleAlertIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { obtenerPedidos } from "./apiDashboard";
import { formatearNumero, formatearPesos } from "./formato";
import { ESTADOS_PEDIDO, formatearFechaPedido, useCambioDeEstado } from "./pedidos";
import { EstadoConsulta, Opciones, Panel, SinDatos } from "./piezas";
import { AccionesPedido, DialogoCancelarPedido, InsigniaEstadoPedido, InsigniaPago } from "./piezasPedido";
import { useConsulta } from "./useConsulta";

const POR_PAGINA = 50;

function textoProductos(items) {
  const unidades = items.reduce((total, item) => total + item.cantidad, 0);
  const primero = items[0] ? `${items[0].cantidad} × ${items[0].nombre}` : "";
  return items.length > 1 ? `${primero} y ${items.length - 1} más (${unidades} u.)` : primero;
}

// Pedidos de todos los clientes (SCRUM-171): filtro por estado y botón
// para pasar cada uno al siguiente. Tocar el número abre el detalle
// (`onDetalle`). `onCambio` avisa al Dashboard (el número del menú).
// `estadoInicial` llega por la URL (?estado=).
export default function PedidosVendedor({ estadoInicial = "todos", onCambio, onDetalle }) {
  const [estado, setEstado] = useState(estadoInicial in ESTADOS_PEDIDO ? estadoInicial : "todos");
  const [visibles, setVisibles] = useState(POR_PAGINA);
  const [version, setVersion] = useState(0);

  const consulta = useConsulta(
    () => obtenerPedidos({ estado: estado === "todos" ? undefined : estado, limite: visibles }),
    `${estado}|${visibles}|${version}`
  );
  const cambio = useCambioDeEstado((pedido) => {
    setVersion((v) => v + 1);
    if (pedido) onCambio?.();
  });

  return (
    <EstadoConsulta consulta={consulta}>
      {({ pedidos, total, porEstado }) => {
        const todos = Object.values(porEstado).reduce((suma, n) => suma + n, 0);
        return (
          <Panel
            titulo="Pedidos"
            id="titulo-pedidos"
            detalle="Los que están en curso, del que lleva más esperando al más nuevo. Tocá el número para ver el detalle. Cada cambio le llega al cliente por mail."
            accion={
              <Opciones
                etiqueta="Estado del pedido"
                valor={estado}
                onCambiar={(valor) => {
                  setEstado(valor);
                  setVisibles(POR_PAGINA);
                  cambio.limpiarError();
                }}
                opciones={[
                  ["todos", `Todos (${formatearNumero(todos)})`],
                  ...Object.entries(ESTADOS_PEDIDO).map(([valor, { texto }]) => [
                    valor,
                    `${texto} (${formatearNumero(porEstado[valor] ?? 0)})`,
                  ]),
                ]}
              />
            }
          >
            {cambio.error && (
              <Alert variant="destructive" className="mb-4">
                <CircleAlertIcon />
                <AlertDescription>{cambio.error}</AlertDescription>
              </Alert>
            )}

            {pedidos.length === 0 ? (
              <SinDatos>
                {estado === "todos" ? "Todavía no hay pedidos." : `No hay pedidos en «${ESTADOS_PEDIDO[estado].texto}».`}
              </SinDatos>
            ) : (
              <>
                <div className="-mx-4 sm:-mx-5 border-t">
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
                        <TableRow
                          key={pedido.id}
                          onClick={() => onDetalle?.(pedido.id)}
                          className="cursor-pointer hover:bg-orange-50/60"
                        >
                          <TableCell className="pl-4 sm:pl-5">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                onDetalle?.(pedido.id);
                              }}
                              aria-label={`Ver el detalle del pedido #${pedido.id}`}
                              className="font-medium tabular-nums text-orange-600 hover:text-orange-700 hover:underline"
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
                            <InsigniaPago estadoPago={pedido.estadoPago} />
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
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    Mostrando {formatearNumero(pedidos.length)} de {formatearNumero(total)} pedidos.
                  </p>
                  {total > pedidos.length && (
                    <Button variant="outline" size="sm" onClick={() => setVisibles((v) => v + POR_PAGINA)} className="text-xs">
                      Mostrar {formatearNumero(Math.min(POR_PAGINA, total - pedidos.length))} más
                    </Button>
                  )}
                </div>
              </>
            )}

            <DialogoCancelarPedido pedido={cambio.aCancelar} onCerrar={cambio.cerrarCancelar} onCancelado={cambio.alCancelar} />
          </Panel>
        );
      }}
    </EstadoConsulta>
  );
}
