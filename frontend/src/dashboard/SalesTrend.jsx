import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatMonth, formatNumber, formatPesos } from "./format";
import SalesChart from "./SalesChart";
import { QueryState, Options } from "./pieces";

// Un dato destacado arriba del gráfico.
function Figure({ titulo, valor, detalle, destacada = false }) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5",
        destacada ? "col-span-2 sm:col-span-1 border-orange-200 bg-orange-50" : "bg-muted/40"
      )}
    >
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className={cn("text-lg font-semibold tabular-nums", destacada && "text-orange-600")}>{valor}</p>
      {detalle && <p className="text-xs text-muted-foreground first-letter:uppercase">{detalle}</p>}
    </div>
  );
}

// Evolución mensual de las ventas (HU 5.4), con la proyección del mes que
// viene en el mismo gráfico (HU 5.5). La proyección es en unidades. La
// consulta la hace el Dashboard (también arma los indicadores del resumen).
// `compacto`: sin la explicación de la proyección, para el resumen.
export default function SalesTrend({ filtros, consulta, compacto = false }) {
  const [metrica, setMetrica] = useState("unidades");
  const alcance = [filtros.categoria, filtros.busqueda && `«${filtros.busqueda}»`].filter(Boolean).join(" · ");

  return (
    <QueryState consulta={consulta}>
      {({ meses, proyeccion }) => {
        const formatear = metrica === "facturacion" ? formatPesos : formatNumber;
        const total = meses.reduce((suma, mes) => suma + mes[metrica], 0);
        const mejor = meses.reduce((max, mes) => (mes[metrica] > (max?.[metrica] ?? -1) ? mes : max), null);
        return (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <p className="text-xs text-muted-foreground">
                {alcance || "Toda la tienda"}. No cuentan los pedidos cancelados.
              </p>
              <Options
                etiqueta="Qué mostrar"
                valor={metrica}
                onCambiar={setMetrica}
                opciones={[
                  ["unidades", "Unidades"],
                  ["facturacion", "Facturación"],
                ]}
              />
            </div>

            {meses.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">
                <Figure titulo="Total del período" valor={formatear(total)} detalle="Incluye el mes en curso hasta hoy" />
                <Figure titulo="Mejor mes" valor={formatear(mejor[metrica])} detalle={formatMonth(mejor.mes, { largo: true })} />
                {metrica === "unidades" && (
                  <Figure
                    titulo="Se espera el mes que viene"
                    valor={formatNumber(proyeccion.unidades)}
                    detalle="Unidades, según la proyección"
                    destacada
                  />
                )}
              </div>
            )}

            <SalesChart
              meses={meses}
              proyeccion={proyeccion}
              metrica={metrica}
              titulo={`Evolución de ventas de los últimos ${filtros.meses} meses`}
            />

            {!compacto && (
              <p className="mt-3 text-xs text-muted-foreground">
                Demanda proyectada para {formatMonth(proyeccion.mes, { largo: true })}:{" "}
                <strong className="text-foreground">{formatNumber(proyeccion.unidades)} unidades</strong>. Es una
                regresión lineal sobre los últimos 12 meses, con el mes en curso llevado a mes completo.
              </p>
            )}
          </>
        );
      }}
    </QueryState>
  );
}
