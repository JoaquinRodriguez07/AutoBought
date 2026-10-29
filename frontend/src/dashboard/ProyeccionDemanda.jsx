import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { obtenerProyeccionDemanda } from "./apiDashboard";
import { formatearMes, formatearNumero } from "./formato";
import { EstadoConsulta, NombreRepuesto, Panel, SinDatos, TONOS } from "./piezas";
import { useConsulta } from "./useConsulta";

// ¿El stock de hoy cubre lo que se espera vender el mes que viene?
function Alcanza({ stock, demanda }) {
  const faltan = Math.ceil(demanda - stock);
  return faltan > 0 ? (
    <Badge variant="outline" className={cn("font-medium", TONOS.rojo)}>
      Faltan {formatearNumero(faltan)}
    </Badge>
  ) : (
    <Badge variant="outline" className={cn("font-medium", TONOS.verde)}>
      Alcanza
    </Badge>
  );
}

// Demanda proyectada del mes que viene por repuesto (HU 5.5), de mayor a
// menor, y si el stock de hoy alcanza para cubrirla. Al abrir uno se ven
// sus ventas reales y la proyección juntas.
export default function ProyeccionDemanda({ filtros, onDetalle }) {
  const consulta = useConsulta(
    () => obtenerProyeccionDemanda({ ...filtros, limite: 20 }),
    `${filtros.categoria}|${filtros.busqueda}`
  );

  return (
    <Panel
      titulo={consulta.datos ? `Demanda proyectada para ${formatearMes(consulta.datos.mes, { largo: true })}` : "Demanda proyectada"}
      id="titulo-proyeccion"
      detalle="Los 20 repuestos con más demanda esperada. Es una regresión lineal sobre las ventas de los últimos 12 meses; nunca es menor que cero."
    >
      <EstadoConsulta consulta={consulta}>
        {({ repuestos }) =>
          repuestos.length === 0 ? (
            <SinDatos>No hay repuestos con estos filtros.</SinDatos>
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
                        <NombreRepuesto repuesto={repuesto} onDetalle={onDetalle} conCodigo />
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatearNumero(repuesto.unidadesUltimoAnio)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{formatearNumero(repuesto.demandaProyectada)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatearNumero(repuesto.stock)}</TableCell>
                      <TableCell className="pr-4 sm:pr-5">
                        <Alcanza stock={repuesto.stock} demanda={repuesto.demandaProyectada} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )
        }
      </EstadoConsulta>
    </Panel>
  );
}
