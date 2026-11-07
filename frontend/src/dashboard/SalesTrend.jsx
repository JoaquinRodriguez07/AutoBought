import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatMonth, formatNumber, formatPesos } from "./format";
import SalesChart from "./SalesChart";
import { QueryState, Options } from "./pieces";

// Un dato destacado arriba del gráfico.
function Figure({ title, rawValue, details, featured = false }) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5",
        featured ? "col-span-2 sm:col-span-1 border-orange-200 bg-orange-50" : "bg-muted/40"
      )}
    >
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className={cn("text-lg font-semibold tabular-nums", featured && "text-orange-600")}>{rawValue}</p>
      {details && <p className="text-xs text-muted-foreground first-letter:uppercase">{details}</p>}
    </div>
  );
}

// Evolución mensual de las ventas (HU 5.4), con la proyección del mes que
// viene en el mismo gráfico (HU 5.5). La proyección es en unidades. La
// consulta la hace el Dashboard (también arma los indicadores del resumen).
// `compacto`: sin la explicación de la proyección, para el resumen.
export default function SalesTrend({ filters, queryState, compacto = false }) {
  const [metrica, setMetrica] = useState("units");
  const alcance = [filters.categoria, filters.search && `«${filters.search}»`].filter(Boolean).join(" · ");

  return (
    <QueryState queryState={queryState}>
      {({ months, forecast }) => {
        const formatear = metrica === "revenue" ? formatPesos : formatNumber;
        const total = months.reduce((suma, month) => suma + month[metrica], 0);
        const mejor = months.reduce((max, month) => (month[metrica] > (max?.[metrica] ?? -1) ? month : max), null);
        return (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <p className="text-xs text-muted-foreground">
                {alcance || "Toda la tienda"}. No cuentan los pedidos cancelados.
              </p>
              <Options
                label="Qué mostrar"
                rawValue={metrica}
                onChange={setMetrica}
                opciones={[
                  ["units", "Unidades"],
                  ["revenue", "Facturación"],
                ]}
              />
            </div>

            {months.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">
                <Figure title="Total del período" rawValue={formatear(total)} details="Incluye el mes en curso hasta hoy" />
                <Figure title="Mejor mes" rawValue={formatear(mejor[metrica])} details={formatMonth(mejor.month, { long: true })} />
                {metrica === "units" && (
                  <Figure
                    title="Se espera el mes que viene"
                    rawValue={formatNumber(forecast.units)}
                    details="Unidades, según la proyección"
                    featured
                  />
                )}
              </div>
            )}

            <SalesChart
              months={months}
              forecast={forecast}
              metrica={metrica}
              title={`Evolución de ventas de los últimos ${filters.months} meses`}
            />

            {!compacto && (
              <p className="mt-3 text-xs text-muted-foreground">
                Demanda proyectada para {formatMonth(forecast.month, { long: true })}:{" "}
                <strong className="text-foreground">{formatNumber(forecast.units)} unidades</strong>. Es una
                regresión lineal sobre los últimos 12 meses, con el mes en curso llevado a mes completo.
              </p>
            )}
          </>
        );
      }}
    </QueryState>
  );
}
