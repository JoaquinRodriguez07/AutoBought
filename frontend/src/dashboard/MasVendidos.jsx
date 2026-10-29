import { obtenerMasVendidos } from "./apiDashboard";
import { formatearNumero } from "./formato";
import { EstadoConsulta, TituloSeccion } from "./piezas";
import { useConsulta } from "./useConsulta";

// Ranking por unidades vendidas (HU 5.3). Barras horizontales de un solo
// color, con el número al final: los nombres son largos y hay una sola serie.
export default function MasVendidos({ filtros, onDetalle }) {
  const consulta = useConsulta(
    () => obtenerMasVendidos({ ...filtros, limite: 10 }),
    `${filtros.categoria}|${filtros.busqueda}|${filtros.meses}`
  );

  return (
    <section>
      <TituloSeccion detalle="Ordenados por unidades vendidas. No cuentan los pedidos cancelados; sí los repuestos que hoy están agotados.">
        Los más vendidos · últimos {filtros.meses} meses
      </TituloSeccion>

      <EstadoConsulta consulta={consulta}>
        {(repuestos) => {
          if (repuestos.length === 0) {
            return <p className="text-sm text-muted-foreground">No hay ventas registradas en este período.</p>;
          }
          const maximo = Math.max(...repuestos.map((r) => r.unidadesVendidas));
          return (
            <ol aria-label="Repuestos más vendidos" className="flex flex-col gap-2">
              {repuestos.map((repuesto, i) => (
                <li key={repuesto.id} className="grid grid-cols-[1.5rem_minmax(0,14rem)_1fr] sm:grid-cols-[1.5rem_minmax(0,20rem)_1fr] items-center gap-3">
                  <span className="text-xs font-black text-muted-foreground tabular-nums">{i + 1}</span>
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => onDetalle(repuesto.id)}
                      className="block max-w-full truncate text-left text-sm font-semibold hover:text-orange-600"
                    >
                      {repuesto.nombre}
                    </button>
                    <span className="block text-[11px] text-muted-foreground">
                      {repuesto.codigo} · {repuesto.stock > 0 ? `stock ${formatearNumero(repuesto.stock)}` : "sin stock"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="h-4 bg-chart-1 rounded-r-[4px]"
                      style={{ width: `${Math.max((repuesto.unidadesVendidas / maximo) * 85, 1)}%` }}
                      aria-hidden="true"
                    />
                    <span className="text-xs font-bold tabular-nums whitespace-nowrap">
                      {formatearNumero(repuesto.unidadesVendidas)} u.
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          );
        }}
      </EstadoConsulta>
    </section>
  );
}
