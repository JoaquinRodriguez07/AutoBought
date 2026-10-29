import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { estadoStock, formatearNumero } from "./formato";
import { EstadoConsulta, InsigniaStock, NombreRepuesto, Opciones, TituloSeccion } from "./piezas";

const POR_PAGINA = 50;

const FILTROS_ESTADO = {
  todos: { texto: "Todos", estados: ["Sin stock", "Stock bajo", "Normal"] },
  bajos: { texto: "Stock bajo y sin stock", estados: ["Sin stock", "Stock bajo"] },
  agotados: { texto: "Solo sin stock", estados: ["Sin stock"] },
};

// Stock actual de cada repuesto (HU 5.2), de menos a más stock. La
// consulta la hace el Dashboard, que también arma los indicadores.
export default function StockActual({ consulta, onDetalle }) {
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [visibles, setVisibles] = useState(POR_PAGINA);

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <TituloSeccion
          detalle={
            consulta.datos
              ? `Con ${consulta.datos.umbralStockBajo} unidades o menos, un repuesto figura con stock bajo.`
              : null
          }
        >
          Stock actual
        </TituloSeccion>

        <Opciones
          etiqueta="Estado del stock"
          valor={filtroEstado}
          onCambiar={(valor) => {
            setFiltroEstado(valor);
            setVisibles(POR_PAGINA);
          }}
          opciones={Object.entries(FILTROS_ESTADO).map(([valor, { texto }]) => [valor, texto])}
        />
      </div>

      <EstadoConsulta consulta={consulta}>
        {({ repuestos }) => {
          const filtrados = repuestos.filter((r) =>
            FILTROS_ESTADO[filtroEstado].estados.includes(estadoStock(r.stock, r.stockBajo))
          );
          return (
            <>
              <p className="text-[11px] text-muted-foreground mb-2">
                {formatearNumero(filtrados.length)} de {formatearNumero(repuestos.length)} repuestos.
              </p>
              <div className="border rounded-lg">
                <Table>
                  <TableHeader className="bg-muted">
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Repuesto</TableHead>
                      <TableHead className="hidden md:table-cell">Fabricante</TableHead>
                      <TableHead className="hidden md:table-cell">Categoría</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtrados.slice(0, visibles).map((repuesto) => (
                      <TableRow key={repuesto.id}>
                        <TableCell className="text-xs text-muted-foreground">{repuesto.codigo}</TableCell>
                        <TableCell>
                          <NombreRepuesto repuesto={repuesto} onDetalle={onDetalle} />
                        </TableCell>
                        <TableCell className="text-muted-foreground hidden md:table-cell">{repuesto.fabricante}</TableCell>
                        <TableCell className="text-muted-foreground hidden md:table-cell">{repuesto.categoria}</TableCell>
                        <TableCell className="text-right font-bold tabular-nums">{formatearNumero(repuesto.stock)}</TableCell>
                        <TableCell>
                          <InsigniaStock stock={repuesto.stock} stockBajo={repuesto.stockBajo} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {filtrados.length > visibles && (
                <Button variant="outline" size="sm" onClick={() => setVisibles((actual) => actual + POR_PAGINA)} className="mt-3 text-xs font-black">
                  Mostrar más
                </Button>
              )}
            </>
          );
        }}
      </EstadoConsulta>
    </section>
  );
}
