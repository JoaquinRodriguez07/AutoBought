import { ChevronRightIcon, PackagePlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDays, formatNumber } from "./format";
import { QueryState, RiskBadge, Panel, NoData } from "./pieces";

// Barra de color a la izquierda: roja para riesgo alto, ámbar para medio.
// El nivel también va escrito en la insignia.
const BAR = {
  high: "bg-red-500",
  medium: "bg-amber-400",
};

function DataItem({ title, children }) {
  return (
    <div className="flex items-baseline gap-1 text-xs">
      <dt className="text-muted-foreground">{title}</dt>
      <dd className="font-medium tabular-nums">{children}</dd>
    </div>
  );
}

// Alertas de reposición (HU 5.7): los repuestos con riesgo alto o medio,
// del más urgente al menos urgente (así los manda el backend). Se muestran
// los primeros `limite`; el resto está en "Reposición". "Reponer" abre el
// ajuste de stock ahí mismo. La consulta la hace el Dashboard.
export default function RestockAlerts({ queryState, onDetail, onRestock, onSeeAll, limit = 5 }) {
  const total = queryState.info?.repuestos.length ?? 0;

  return (
    <Panel
      title="Para reponer"
      id="titulo-alertas"
      details={total > 0 ? `${formatNumber(total)} repuestos con riesgo alto o medio` : "Lo que se va a quedar sin stock primero"}
      action={
        total > limit && (
          <Button variant="ghost" size="sm" onClick={onSeeAll} className="text-xs text-orange-600 hover:text-orange-700">
            Ver todas
            <ChevronRightIcon />
          </Button>
        )
      }
    >
      <QueryState queryState={queryState}>
        {({ repuestos }) =>
          repuestos.length === 0 ? (
            <NoData>No hay repuestos que requieran reposición</NoData>
          ) : (
            <ul aria-label="Repuestos para reponer" className="-mx-1 flex flex-col divide-y">
              {repuestos.slice(0, limit).map((part) => (
                <li key={part.id} data-risk={part.risk} className="flex items-center gap-3 px-1 py-3">
                  <span className={cn("w-1 self-stretch rounded-full", BAR[part.risk])} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => onDetail(part.id)}
                          className="block max-w-full truncate text-left text-sm font-medium hover:text-orange-600 hover:underline underline-offset-2"
                        >
                          {part.displayName}
                        </button>
                        <p className="text-xs text-muted-foreground truncate">
                          {part.code} · {part.categoria}
                        </p>
                      </div>
                      <RiskBadge risk={part.risk} />
                    </div>
                    <div className="mt-2 flex items-end justify-between gap-2">
                      <dl className="flex flex-wrap gap-x-3 gap-y-0.5">
                        <DataItem title="Stock">{formatNumber(part.stock)}</DataItem>
                        <DataItem title="Demanda">{formatNumber(part.projectedDemand)} / mes</DataItem>
                        <DataItem title="Alcanza para">{formatDays(part.coverageDays)}</DataItem>
                      </dl>
                      {onRestock && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onRestock(part)}
                          aria-label={`Reponer ${part.displayName} (${part.code})`}
                          className="h-7 shrink-0 px-2.5 text-xs"
                        >
                          <PackagePlusIcon />
                          Reponer
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
    </Panel>
  );
}
