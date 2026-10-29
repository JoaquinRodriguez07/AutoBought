import { useState } from "react";
import { TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { obtenerRiesgoAgotamiento } from "./apiDashboard";
import { formatearDias, formatearNumero } from "./formato";
import { EstadoConsulta, InsigniaRiesgo, SinDatos } from "./piezas";
import { useConsulta } from "./useConsulta";

const VISIBLES = 6;

// Riesgo alto destacado sobre el medio: borde y fondo más fuertes. El
// backend ya las manda de la más urgente a la menos urgente.
const ESTILO = {
  high: "bg-red-50/60 ring-red-300 border-l-4 border-l-red-600",
  medium: "ring-amber-200 border-l-4 border-l-amber-500",
};

function Dato({ titulo, children }) {
  return (
    <div>
      <dt className="text-muted-foreground">{titulo}</dt>
      <dd className="font-black tabular-nums">{children}</dd>
    </div>
  );
}

// Alertas de reposición (HU 5.7): los repuestos con riesgo alto o medio.
export default function AlertasReposicion({ filtros, onDetalle }) {
  const [verTodas, setVerTodas] = useState(false);
  const consulta = useConsulta(
    () => obtenerRiesgoAgotamiento({ ...filtros, soloEnRiesgo: true }),
    `${filtros.categoria}|${filtros.busqueda}`
  );

  return (
    <section aria-labelledby="titulo-alertas" className="mt-8">
      <div className="flex items-center gap-2 mb-3">
        <TriangleAlertIcon className="size-5 text-red-600" aria-hidden="true" />
        <h2 id="titulo-alertas" className="text-lg font-black">
          Alertas de reposición
        </h2>
        {consulta.datos?.repuestos.length > 0 && (
          <span className="text-xs font-bold text-muted-foreground">({consulta.datos.repuestos.length})</span>
        )}
      </div>

      <EstadoConsulta consulta={consulta}>
        {({ repuestos }) => {
          if (repuestos.length === 0) {
            return <SinDatos>No hay repuestos que requieran reposición</SinDatos>;
          }

          const visibles = verTodas ? repuestos : repuestos.slice(0, VISIBLES);
          return (
            <>
              <ul aria-label="Repuestos para reponer" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {visibles.map((repuesto) => (
                  <li key={repuesto.id} data-riesgo={repuesto.riesgo} className="min-w-0">
                    <Card size="sm" className={cn("h-full", ESTILO[repuesto.riesgo])}>
                      <CardHeader>
                        <CardTitle className="font-black truncate">{repuesto.nombre}</CardTitle>
                        <CardDescription className="text-[11px]">
                          {repuesto.codigo} · {repuesto.categoria}
                        </CardDescription>
                        <CardAction>
                          <InsigniaRiesgo riesgo={repuesto.riesgo} />
                        </CardAction>
                      </CardHeader>
                      <CardContent>
                        <dl className="grid grid-cols-3 gap-2 text-[11px]">
                          <Dato titulo="Stock actual">{formatearNumero(repuesto.stock)}</Dato>
                          <Dato titulo="Demanda proyectada">{formatearNumero(repuesto.demandaProyectada)} / mes</Dato>
                          <Dato titulo="Cobertura">{formatearDias(repuesto.diasCobertura)}</Dato>
                        </dl>
                      </CardContent>
                      <CardFooter className="border-t-0 bg-transparent pt-0">
                        <Button
                          variant="link"
                          size="sm"
                          onClick={() => onDetalle(repuesto.id)}
                          aria-label={`Ver detalle de ${repuesto.nombre} (${repuesto.codigo})`}
                          className="px-0 text-xs font-black text-orange-600"
                        >
                          Ver detalle →
                        </Button>
                      </CardFooter>
                    </Card>
                  </li>
                ))}
              </ul>

              {repuestos.length > VISIBLES && (
                <Button variant="ghost" size="sm" onClick={() => setVerTodas((actual) => !actual)} className="mt-3 text-xs font-black">
                  {verTodas ? "Ver menos" : `Ver todas (${repuestos.length})`}
                </Button>
              )}
            </>
          );
        }}
      </EstadoConsulta>
    </section>
  );
}
