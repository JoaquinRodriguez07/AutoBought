// Proyección de la demanda del mes que viene.

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { getDemandForecast } from "./dashboardApi";
import { formatMonth, formatNumber } from "./format";
import { QueryState, PartName, Panel, NoData, TONES } from "./pieces";
import { useQuery } from "./useQuery";

// ¿El stock de hoy cubre lo que se espera vender el mes que viene?
function Coverage({ stock, demanda }) {
  const faltan = Math.ceil(demanda - stock);
  return faltan > 0 ? (
    <Badge variant="outline" className={cn("font-medium", TONES.rojo)}>
      Faltan {formatNumber(faltan)}
    </Badge>
  ) : (
    <Badge variant="outline" className={cn("font-medium", TONES.verde)}>
      Alcanza
    </Badge>
  );
}

// Demanda proyectada del mes que viene por repuesto (HU 5.5), de mayor a
// menor, y si el stock de hoy alcanza para cubrirla. Al abrir uno se ven
// sus ventas reales y la proyección juntas.
export default function DemandForecast({ filtros, onDetalle }) {
  const consulta = useQuery(
    () => getDemandForecast({ ...filtros, limite: 20 }),
    `${filtros.categoria}|${filtros.busqueda}`
  );

  return (
    <Panel
      titulo={consulta.datos ? `Demanda proyectada para ${formatMonth(consulta.datos.mes, { largo: true })}` : "Demanda proyectada"}
      id="titulo-proyeccion"
      detalle="Los 20 repuestos con más demanda esperada. Es una regresión lineal sobre las ventas de los últimos 12 meses; nunca es menor que cero."
    >
      <QueryState consulta={consulta}>
        {({ repuestos }) =>
          repuestos.length === 0 ? (
            <NoData>No hay repuestos con estos filtros.</NoData>
          ) : (
            <div className="-mx-4 sm:-mx-5 border-t">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4 sm:pl-5">Repuesto</TableHead>
                    <TableHead className="text-right">Vendidas en 12 meses</TableHead>
                    <TableHead className="text-right">Demanda proyectada</TableHead>
                    <TableHead className="text-right">Stock actual</TableHead>
                    <TableHead className="pr-4 sm:pr-5">¿Alcanza?</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {repuestos.map((repuesto) => (
                    <TableRow key={repuesto.id}>
                      <TableCell className="pl-4 sm:pl-5">
                        <PartName repuesto={repuesto} onDetalle={onDetalle} conCodigo />
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatNumber(repuesto.unidadesUltimoAnio)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{formatNumber(repuesto.demandaProyectada)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(repuesto.stock)}</TableCell>
                      <TableCell className="pr-4 sm:pr-5">
                        <Coverage stock={repuesto.stock} demanda={repuesto.demandaProyectada} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )
        }
      </QueryState>
    </Panel>
  );
}
