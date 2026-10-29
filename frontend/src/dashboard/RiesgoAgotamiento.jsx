import { useState } from "react";
import { PackagePlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { obtenerRiesgoAgotamiento } from "./apiDashboard";
import { RIESGOS, formatearDias, formatearMes, formatearNumero } from "./formato";
import { EstadoConsulta, InsigniaRiesgo, NombreRepuesto, Opciones, Panel, SinDatos } from "./piezas";
import { useConsulta } from "./useConsulta";

const POR_PAGINA = 50;

// "Para reponer" (alto y medio) es lo mismo que cuenta el resumen, y es
// con lo que abre la sección.
const NIVELES = {
  reponer: { texto: "Para reponer", riesgos: ["high", "medium"] },
  high: { texto: RIESGOS.high.etiqueta, riesgos: ["high"] },
  medium: { texto: RIESGOS.medium.etiqueta, riesgos: ["medium"] },
  low: { texto: RIESGOS.low.etiqueta, riesgos: ["low"] },
  todos: { texto: "Todos", riesgos: ["high", "medium", "low"] },
};

// Riesgo de agotamiento (HU 5.6): días de cobertura = stock / demanda
// diaria proyectada. Viene ordenado del más urgente al menos urgente. Abre
// con los que hay que reponer (riesgo alto y medio), se puede filtrar por
// nivel y reponer desde cada fila (HU 5.10).
export default function RiesgoAgotamiento({ filtros, onDetalle, onReponer }) {
  const [visibles, setVisibles] = useState(POR_PAGINA);
  const [nivel, setNivel] = useState("reponer");
  const consulta = useConsulta(
    () => obtenerRiesgoAgotamiento(filtros),
    `${filtros.categoria}|${filtros.busqueda}`
  );

  return (
    <Panel
      titulo="Riesgo de agotamiento"
      id="titulo-riesgo"
      detalle={
        consulta.datos
          ? `Para cuántos días alcanza el stock al ritmo proyectado para ${formatearMes(consulta.datos.mes, { largo: true })}. Alto: menos de ${consulta.datos.umbrales.alto} días; medio: de ${consulta.datos.umbrales.alto} a ${consulta.datos.umbrales.medio}; bajo: más de ${consulta.datos.umbrales.medio}.`
          : null
      }
    >
      <EstadoConsulta consulta={consulta}>
        {({ repuestos }) => {
          if (repuestos.length === 0) return <SinDatos>No hay repuestos con estos filtros.</SinDatos>;
          const de = (valor) => repuestos.filter((r) => NIVELES[valor].riesgos.includes(r.riesgo));
          const filtrados = de(nivel);
          return (
            <>
              <div className="mb-4">
                <Opciones
                  etiqueta="Nivel de riesgo"
                  valor={nivel}
                  onCambiar={(valor) => {
                    setNivel(valor);
                    setVisibles(POR_PAGINA);
                  }}
                  opciones={Object.entries(NIVELES).map(([valor, { texto }]) => [
                    valor,
                    `${texto} (${formatearNumero(de(valor).length)})`,
                  ])}
                />
              </div>
              <div className="-mx-4 sm:-mx-5 border-t">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-4 sm:pl-5">Repuesto</TableHead>
                      <TableHead>Riesgo</TableHead>
                      <TableHead className="text-right">Alcanza para</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead className="text-right hidden md:table-cell">Demanda proyectada</TableHead>
                      {onReponer && <TableHead className="pr-4 sm:pr-5"><span className="sr-only">Acciones</span></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtrados.slice(0, visibles).map((repuesto) => (
                      <TableRow key={repuesto.id}>
                        <TableCell className="pl-4 sm:pl-5">
                          <NombreRepuesto repuesto={repuesto} onDetalle={onDetalle} conCodigo />
                        </TableCell>
                        <TableCell>
                          <InsigniaRiesgo riesgo={repuesto.riesgo} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatearDias(repuesto.diasCobertura)}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{formatearNumero(repuesto.stock)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground hidden md:table-cell">
                          {formatearNumero(repuesto.demandaProyectada)} / mes
                        </TableCell>
                        {onReponer && (
                          <TableCell className="pr-4 sm:pr-5 text-right">
                            <Button
                              variant={repuesto.riesgo === "low" ? "ghost" : "outline"}
                              size="sm"
                              onClick={() => onReponer(repuesto)}
                              aria-label={`Reponer ${repuesto.nombre} (${repuesto.codigo})`}
                              className="h-7 px-2.5 text-xs"
                            >
                              <PackagePlusIcon />
                              Reponer
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
                    Mostrar más
                  </Button>
                )}
              </div>
            </>
          );
        }}
      </EstadoConsulta>
    </Panel>
  );
}
