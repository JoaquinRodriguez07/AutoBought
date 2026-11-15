// Proyección de la demanda del mes que viene.

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { getDemandForecast } from "./dashboardApi";
import { formatMonth, formatNumber } from "./format";
import { QueryState, PartName, Panel, NoData, TONES } from "./pieces";
import { useQuery } from "./useQuery";

// ¿El stock de hoy cubre lo que se espera vender el mes que viene?
function Coverage({ stock, demand }) {
  const faltan = Math.ceil(demand - stock);
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
export default function DemandForecast({ filters, onDetail }) {
  const queryState = useQuery(
    () => getDemandForecast({ ...filters, limit: 20 }),
    `${filters.categoria}|${filters.search}`
  );

  return (
    <Panel
      title={queryState.info ? `Demanda proyectada para ${formatMonth(queryState.info.month, { long: true })}` : "Demanda proyectada"}
      id="titulo-proyeccion"
      details="Los 20 repuestos con más demanda esperada. Es una regresión lineal sobre las ventas de los últimos 12 meses; nunca es menor que cero."
    >
      <QueryState queryState={queryState}>
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
                  {repuestos.map((part) => (
                    <TableRow key={part.id}>
                      <TableCell className="pl-4 sm:pl-5">
                        <PartName part={part} onDetail={onDetail} withCode />
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatNumber(part.unitsLastYear)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{formatNumber(part.projectedDemand)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(part.stock)}</TableCell>
                      <TableCell className="pr-4 sm:pr-5">
                        <Coverage stock={part.stock} demand={part.projectedDemand} />
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
