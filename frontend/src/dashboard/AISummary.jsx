// Resumen del dashboard hecho con IA.

import { useEffect, useState } from "react";
import { RefreshCwIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { InDevelopment } from "./pieces";
import { refreshAISummary, unpublishedFeature, getAISummary } from "./dashboardApi";

const dateTime = new Intl.DateTimeFormat("es-UY", { dateStyle: "long", timeStyle: "short" });

// Resumen escrito del dashboard hecho con IA (HU 6.3): de 3 a 5 puntos, con
// la fecha en que se generó y "Actualizar". Mientras el backend no tenga la
// ruta, el panel dice que está en desarrollo; si la IA no responde, avisa y
// el resto del dashboard sigue igual.
export default function AISummary() {
  const [estado, setStatus] = useState({ summary: null, loading: true, error: null });
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    let vigente = true;
    getAISummary()
      .then((summary) => vigente && setStatus({ summary, loading: false, error: null }))
      .catch((error) => vigente && setStatus({ summary: null, loading: false, error }));
    return () => {
      vigente = false;
    };
  }, []);

  const update = async () => {
    setUpdating(true);
    try {
      const summary = await refreshAISummary();
      setStatus({ summary, loading: false, error: null });
    } catch (error) {
      setStatus((previous) => ({ ...previous, error }));
    } finally {
      setUpdating(false);
    }
  };

  const inDesarrollo = unpublishedFeature(estado.error);

  return (
    <section
      aria-labelledby="titulo-resumen-ia"
      className="rounded-xl border border-orange-200 bg-linear-to-br from-orange-50 via-white to-white p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-orange-500 text-white">
            <SparklesIcon className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h2 id="titulo-resumen-ia" className="text-[15px] font-semibold flex flex-wrap items-center gap-2">
              Resumen del día
              {inDesarrollo && <InDevelopment />}
            </h2>
            {estado.summary && (
              <p className="text-xs text-muted-foreground">Generado el {dateTime.format(new Date(estado.summary.generated))}</p>
            )}
          </div>
        </div>
        {!estado.loading && !inDesarrollo && (
          <Button variant="outline" size="sm" onClick={update} disabled={updating}>
            <RefreshCwIcon className={updating ? "animate-spin" : undefined} />
            Actualizar
          </Button>
        )}
      </div>

      {estado.loading && (
        <div className="mt-4 flex flex-col gap-2" aria-label="Cargando…">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      )}

      {inDesarrollo && (
        <p className="mt-3 text-sm text-muted-foreground">
          Estamos desarrollando un resumen escrito con IA de cómo vienen las ventas y qué conviene reponer. Va a
          aparecer acá.
        </p>
      )}

      {estado.error && !inDesarrollo && (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          El resumen no está disponible en este momento. El resto del dashboard funciona igual.
        </p>
      )}

      {estado.summary && !estado.error && (
        <ul className="mt-4 flex flex-col gap-2 text-sm leading-relaxed">
          {estado.summary.puntos.map((punto) => (
            <li key={punto} className="flex gap-2.5">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-orange-500" aria-hidden="true" />
              {punto}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
