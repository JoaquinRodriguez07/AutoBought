import { ChevronRightIcon, PackagePlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatearDias, formatearNumero } from "./formato";
import { EstadoConsulta, InsigniaRiesgo, Panel, SinDatos } from "./piezas";

// Barra de color a la izquierda: roja para riesgo alto, ámbar para medio.
// El nivel también va escrito en la insignia.
const BARRA = {
  high: "bg-red-500",
  medium: "bg-amber-400",
};

function Dato({ titulo, children }) {
  return (
    <div className="flex items-baseline gap-1 text-xs">
      <dt className="text-muted-foreground">{titulo}</dt>
      <dd className="font-medium tabular-nums">{children}</dd>
    </div>
  );
}

// Alertas de reposición (HU 5.7): los repuestos con riesgo alto o medio,
// del más urgente al menos urgente (así los manda el backend). Se muestran
// los primeros `limite`; el resto está en "Reposición". "Reponer" abre el
// ajuste de stock ahí mismo. La consulta la hace el Dashboard.
export default function AlertasReposicion({ consulta, onDetalle, onReponer, onVerTodas, limite = 5 }) {
  const total = consulta.datos?.repuestos.length ?? 0;

  return (
    <Panel
      titulo="Para reponer"
      id="titulo-alertas"
      detalle={total > 0 ? `${formatearNumero(total)} repuestos con riesgo alto o medio` : "Lo que se va a quedar sin stock primero"}
      accion={
        total > limite && (
          <Button variant="ghost" size="sm" onClick={onVerTodas} className="text-xs text-orange-600 hover:text-orange-700">
            Ver todas
            <ChevronRightIcon />
          </Button>
        )
      }
    >
      <EstadoConsulta consulta={consulta}>
        {({ repuestos }) =>
          repuestos.length === 0 ? (
            <SinDatos>No hay repuestos que requieran reposición</SinDatos>
          ) : (
            <ul aria-label="Repuestos para reponer" className="-mx-1 flex flex-col divide-y">
              {repuestos.slice(0, limite).map((repuesto) => (
                <li key={repuesto.id} data-riesgo={repuesto.riesgo} className="flex items-center gap-3 px-1 py-3">
                  <span className={cn("w-1 self-stretch rounded-full", BARRA[repuesto.riesgo])} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => onDetalle(repuesto.id)}
                          className="block max-w-full truncate text-left text-sm font-medium hover:text-orange-600 hover:underline underline-offset-2"
                        >
                          {repuesto.nombre}
                        </button>
                        <p className="text-xs text-muted-foreground truncate">
                          {repuesto.codigo} · {repuesto.categoria}
                        </p>
                      </div>
                      <InsigniaRiesgo riesgo={repuesto.riesgo} />
                    </div>
                    <div className="mt-2 flex items-end justify-between gap-2">
                      <dl className="flex flex-wrap gap-x-3 gap-y-0.5">
                        <Dato titulo="Stock">{formatearNumero(repuesto.stock)}</Dato>
                        <Dato titulo="Demanda">{formatearNumero(repuesto.demandaProyectada)} / mes</Dato>
                        <Dato titulo="Alcanza para">{formatearDias(repuesto.diasCobertura)}</Dato>
                      </dl>
                      {onReponer && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onReponer(repuesto)}
                          aria-label={`Reponer ${repuesto.nombre} (${repuesto.codigo})`}
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
      </EstadoConsulta>
    </Panel>
  );
}
