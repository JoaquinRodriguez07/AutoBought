import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { obtenerProyeccionDemanda } from "./apiDashboard";
import { formatearMes, formatearNumero } from "./formato";
import { EstadoConsulta, NombreRepuesto, SinDatos, TituloSeccion } from "./piezas";
import { useConsulta } from "./useConsulta";

// Demanda proyectada del mes que viene por repuesto (HU 5.5), de mayor a
// menor. Al abrir uno se ven sus ventas reales y la proyección juntas.
export default function ProyeccionDemanda({ filtros, onDetalle }) {
  const consulta = useConsulta(
    () => obtenerProyeccionDemanda({ ...filtros, limite: 20 }),
    `${filtros.categoria}|${filtros.busqueda}`
  );

  return (
    <section>
      <TituloSeccion
        detalle={
          consulta.datos
            ? `Para ${formatearMes(consulta.datos.mes, { largo: true })}: regresión lineal sobre las ventas de los últimos 12 meses. Nunca es menor que cero y no cambia las ventas ni el stock.`
            : null
        }
      >
        Proyección de demanda
      </TituloSeccion>

      <EstadoConsulta consulta={consulta}>
        {({ repuestos }) =>
          repuestos.length === 0 ? (
            <SinDatos>No hay repuestos con estos filtros.</SinDatos>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead>Repuesto</TableHead>
                    <TableHead className="text-right">Vendidas en 12 meses</TableHead>
                    <TableHead className="text-right">Demanda proyectada</TableHead>
                    <TableHead className="text-right">Stock actual</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {repuestos.map((repuesto) => (
                    <TableRow key={repuesto.id}>
                      <TableCell>
                        <NombreRepuesto repuesto={repuesto} onDetalle={onDetalle} conCodigo />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatearNumero(repuesto.unidadesUltimoAnio)}</TableCell>
                      <TableCell className="text-right font-bold tabular-nums">{formatearNumero(repuesto.demandaProyectada)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatearNumero(repuesto.stock)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )
        }
      </EstadoConsulta>
    </section>
  );
}
