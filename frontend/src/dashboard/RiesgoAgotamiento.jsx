import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { obtenerRiesgoAgotamiento } from "./apiDashboard";
import { formatearDias, formatearMes, formatearNumero } from "./formato";
import { EstadoConsulta, InsigniaRiesgo, NombreRepuesto, SinDatos, TituloSeccion } from "./piezas";
import { useConsulta } from "./useConsulta";

const POR_PAGINA = 50;

// Riesgo de agotamiento (HU 5.6): días de cobertura = stock / demanda
// diaria proyectada. Viene ordenado del más urgente al menos urgente.
export default function RiesgoAgotamiento({ filtros, onDetalle }) {
  const [visibles, setVisibles] = useState(POR_PAGINA);
  const consulta = useConsulta(
    () => obtenerRiesgoAgotamiento(filtros),
    `${filtros.categoria}|${filtros.busqueda}`
  );

  return (
    <section>
      <TituloSeccion
        detalle={
          consulta.datos
            ? `Cuántos días alcanza el stock al ritmo proyectado para ${formatearMes(consulta.datos.mes, { largo: true })}. Alto: menos de ${consulta.datos.umbrales.alto} días; medio: de ${consulta.datos.umbrales.alto} a ${consulta.datos.umbrales.medio}; bajo: más de ${consulta.datos.umbrales.medio}.`
            : null
        }
      >
        Riesgo de agotamiento
      </TituloSeccion>

      <EstadoConsulta consulta={consulta}>
        {({ repuestos }) =>
          repuestos.length === 0 ? (
            <SinDatos>No hay repuestos con estos filtros.</SinDatos>
          ) : (
            <>
              <div className="border rounded-lg">
                <Table>
                  <TableHeader className="bg-muted">
                    <TableRow>
                      <TableHead>Repuesto</TableHead>
                      <TableHead>Riesgo</TableHead>
                      <TableHead className="text-right">Cobertura</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead className="text-right hidden md:table-cell">Demanda proyectada</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {repuestos.slice(0, visibles).map((repuesto) => (
                      <TableRow key={repuesto.id}>
                        <TableCell>
                          <NombreRepuesto repuesto={repuesto} onDetalle={onDetalle} conCodigo />
                        </TableCell>
                        <TableCell>
                          <InsigniaRiesgo riesgo={repuesto.riesgo} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatearDias(repuesto.diasCobertura)}</TableCell>
                        <TableCell className="text-right font-bold tabular-nums">{formatearNumero(repuesto.stock)}</TableCell>
                        <TableCell className="text-right tabular-nums hidden md:table-cell">
                          {formatearNumero(repuesto.demandaProyectada)} / mes
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {repuestos.length > visibles && (
                <Button variant="outline" size="sm" onClick={() => setVisibles((actual) => actual + POR_PAGINA)} className="mt-3 text-xs font-black">
                  Mostrar más
                </Button>
              )}
            </>
          )
        }
      </EstadoConsulta>
    </section>
  );
}
