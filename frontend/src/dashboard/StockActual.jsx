import { useState } from "react";
import { PackagePlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { estadoStock, formatearNumero } from "./formato";
import { EstadoConsulta, InsigniaStock, NombreRepuesto, Opciones, Panel } from "./piezas";

const POR_PAGINA = 50;

const FILTROS_ESTADO = {
  todos: { texto: "Todos", estados: ["Sin stock", "Stock bajo", "Normal"] },
  bajos: { texto: "Stock bajo o sin stock", estados: ["Sin stock", "Stock bajo"] },
  agotados: { texto: "Sin stock", estados: ["Sin stock"] },
};

// Un número del resumen de arriba de la tabla.
function Dato({ titulo, children, tono }) {
  return (
    <div className="px-4 py-3">
      <dt className="text-xs text-muted-foreground">{titulo}</dt>
      <dd className={tono ?? "text-xl font-semibold tabular-nums mt-0.5"}>{children}</dd>
    </div>
  );
}

// Stock actual de cada repuesto (HU 5.2), de menos a más stock, con un
// resumen arriba y "Ajustar" en cada fila (HU 5.10). La consulta la hace
// el Dashboard. `estadoInicial` llega al tocar "Sin stock" en el resumen.
export default function StockActual({ consulta, onDetalle, onReponer, estadoInicial = "todos" }) {
  const [filtroEstado, setFiltroEstado] = useState(estadoInicial in FILTROS_ESTADO ? estadoInicial : "todos");
  const [visibles, setVisibles] = useState(POR_PAGINA);

  return (
    <EstadoConsulta consulta={consulta}>
      {({ repuestos, umbralStockBajo }) => {
        const cuantos = (clave) =>
          repuestos.filter((r) => FILTROS_ESTADO[clave].estados.includes(estadoStock(r.stock, r.stockBajo))).length;
        const filtrados = repuestos.filter((r) =>
          FILTROS_ESTADO[filtroEstado].estados.includes(estadoStock(r.stock, r.stockBajo))
        );
        const stockBajo = repuestos.filter((r) => r.stock > 0 && r.stockBajo).length;
        const sinStock = repuestos.filter((r) => r.stock <= 0).length;

        return (
          <div className="flex flex-col gap-6">
            <dl aria-label="Resumen del stock" className="grid grid-cols-2 lg:grid-cols-4 rounded-xl border bg-card divide-x divide-y lg:divide-y-0">
              <Dato titulo="Repuestos">{formatearNumero(repuestos.length)}</Dato>
              <Dato titulo="Unidades en stock">{formatearNumero(repuestos.reduce((total, r) => total + r.stock, 0))}</Dato>
              <Dato titulo="Con stock bajo" tono="text-xl font-semibold tabular-nums mt-0.5 text-amber-600">
                {formatearNumero(stockBajo)}
              </Dato>
              <Dato titulo="Sin stock" tono="text-xl font-semibold tabular-nums mt-0.5 text-red-600">
                {formatearNumero(sinStock)}
              </Dato>
            </dl>

            <Panel
              titulo="Stock por repuesto"
              id="titulo-stock"
              detalle={`De menos a más stock. Con ${umbralStockBajo} unidades o menos, un repuesto figura con stock bajo.`}
              accion={
                <Opciones
                  etiqueta="Estado del stock"
                  valor={filtroEstado}
                  onCambiar={(valor) => {
                    setFiltroEstado(valor);
                    setVisibles(POR_PAGINA);
                  }}
                  opciones={Object.entries(FILTROS_ESTADO).map(([valor, { texto }]) => [
                    valor,
                    `${texto} (${formatearNumero(cuantos(valor))})`,
                  ])}
                />
              }
            >
              <div className="-mx-4 sm:-mx-5 border-t">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-4 sm:pl-5">Código</TableHead>
                      <TableHead>Repuesto</TableHead>
                      <TableHead className="hidden md:table-cell">Fabricante</TableHead>
                      <TableHead className="hidden md:table-cell">Categoría</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead>Estado</TableHead>
                      {onReponer && <TableHead className="pr-4 sm:pr-5 text-right"><span className="sr-only">Acciones</span></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtrados.slice(0, visibles).map((repuesto) => (
                      <TableRow key={repuesto.id}>
                        <TableCell className="pl-4 sm:pl-5 text-xs text-muted-foreground tabular-nums">{repuesto.codigo}</TableCell>
                        <TableCell>
                          <NombreRepuesto repuesto={repuesto} onDetalle={onDetalle} />
                        </TableCell>
                        <TableCell className="text-muted-foreground hidden md:table-cell">{repuesto.fabricante}</TableCell>
                        <TableCell className="text-muted-foreground hidden md:table-cell">{repuesto.categoria}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{formatearNumero(repuesto.stock)}</TableCell>
                        <TableCell>
                          <InsigniaStock stock={repuesto.stock} stockBajo={repuesto.stockBajo} />
                        </TableCell>
                        {onReponer && (
                          <TableCell className="pr-4 sm:pr-5 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onReponer(repuesto)}
                              aria-label={`Ajustar stock de ${repuesto.nombre} (${repuesto.codigo})`}
                              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                            >
                              <PackagePlusIcon />
                              Ajustar
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  Mostrando {formatearNumero(Math.min(visibles, filtrados.length))} de {formatearNumero(filtrados.length)} repuestos.
                </p>
                {filtrados.length > visibles && (
                  <Button variant="outline" size="sm" onClick={() => setVisibles((actual) => actual + POR_PAGINA)} className="text-xs">
                    Mostrar {formatearNumero(Math.min(POR_PAGINA, filtrados.length - visibles))} más
                  </Button>
                )}
              </div>
            </Panel>
          </div>
        );
      }}
    </EstadoConsulta>
  );
}
