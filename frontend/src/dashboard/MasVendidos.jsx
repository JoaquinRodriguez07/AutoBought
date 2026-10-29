import { obtenerMasVendidos } from "./apiDashboard";
import { formatearNumero } from "./formato";
import { EstadoConsulta, SinDatos } from "./piezas";
import { useConsulta } from "./useConsulta";

// Ranking por unidades vendidas (HU 5.3). Barras horizontales de un solo
// color sobre un riel, con el número al final: los nombres son largos y hay
// una sola serie. Si uno de los que más se venden está sin stock, se marca:
// es lo primero que conviene reponer. El título lo pone quien lo usa.
export default function MasVendidos({ filtros, onDetalle, limite = 10 }) {
  const consulta = useConsulta(
    () => obtenerMasVendidos({ ...filtros, limite }),
    `${filtros.categoria}|${filtros.busqueda}|${filtros.meses}|${limite}`
  );

  return (
    <EstadoConsulta consulta={consulta}>
      {(repuestos) => {
        if (repuestos.length === 0) {
          return <SinDatos>No hay ventas registradas en este período.</SinDatos>;
        }
        const maximo = Math.max(...repuestos.map((r) => r.unidadesVendidas));
        return (
          <ol aria-label="Repuestos más vendidos" className="flex flex-col">
            {repuestos.map((repuesto, i) => (
              <li key={repuesto.id} className="grid grid-cols-[1.75rem_minmax(0,1fr)_4.5rem] sm:grid-cols-[1.75rem_minmax(0,16rem)_1fr_4.5rem] items-center gap-x-4 gap-y-1.5 py-2.5">
                <span className="grid size-7 place-items-center rounded-full bg-gray-100 text-xs font-semibold tabular-nums text-gray-700">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => onDetalle(repuesto.id)}
                    className="block max-w-full truncate text-left text-sm font-medium hover:text-orange-600 hover:underline underline-offset-2"
                  >
                    {repuesto.nombre}
                  </button>
                  <span className="block text-xs text-muted-foreground">
                    {repuesto.codigo} ·{" "}
                    {repuesto.stock > 0 ? (
                      `stock ${formatearNumero(repuesto.stock)}`
                    ) : (
                      <span className="font-medium text-red-600">sin stock</span>
                    )}
                  </span>
                </div>
                <div className="order-last col-span-3 col-start-2 sm:order-none sm:col-span-1 sm:col-start-auto h-2 min-w-0 rounded-full bg-gray-100" aria-hidden="true">
                  <div
                    className="h-full rounded-full bg-linear-to-r from-orange-400 to-orange-600"
                    style={{ width: `${Math.max((repuesto.unidadesVendidas / maximo) * 100, 2)}%` }}
                  />
                </div>
                <span className="text-right text-sm font-semibold tabular-nums whitespace-nowrap">
                  {formatearNumero(repuesto.unidadesVendidas)} u.
                </span>
              </li>
            ))}
          </ol>
        );
      }}
    </EstadoConsulta>
  );
}
