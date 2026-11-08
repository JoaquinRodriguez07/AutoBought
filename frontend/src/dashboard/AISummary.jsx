// Resumen del dashboard hecho con IA, con el historial de los anteriores.

import { useEffect, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon, RefreshCwIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getAISummary, getAISummaryHistory, refreshAISummary } from "./dashboardApi";

const dateTime = new Intl.DateTimeFormat("es-UY", { dateStyle: "long", timeStyle: "short" });

function Points({ puntos }) {
  return (
    <ul className="flex flex-col gap-2 text-sm leading-relaxed">
      {puntos.map((punto) => (
        <li key={punto} className="flex gap-2.5">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-orange-500" aria-hidden="true" />
          {punto}
        </li>
      ))}
    </ul>
  );
}

// Los resúmenes de los últimos días. Se piden recién al abrir la sección y
// no repiten el que ya se muestra arriba.
function SummaryHistory({ current }) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState({ data: null, loading: false, error: null });

  const toggle = async () => {
    const opening = !open;
    setOpen(opening);
    if (!opening || history.data) return;
    setHistory({ data: null, loading: true, error: null });
    try {
      setHistory({ data: await getAISummaryHistory(), loading: false, error: null });
    } catch (error) {
      setHistory({ data: null, loading: false, error });
    }
  };

  const previous = history.data?.summaries.filter((summary) => summary.generated !== current?.generated) ?? [];

  return (
    <div className="mt-4 border-t border-orange-100 pt-3">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 text-muted-foreground"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="resumenes-anteriores"
      >
        {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
        {open ? "Ocultar resúmenes anteriores" : "Ver resúmenes anteriores"}
      </Button>

      {open && (
        <div id="resumenes-anteriores" className="mt-2">
          {history.loading && <Skeleton className="h-4 w-2/3" aria-label="Cargando…" />}
          {history.error && (
            <p role="status" className="text-sm text-muted-foreground">
              No pudimos cargar los resúmenes anteriores.
            </p>
          )}
          {history.data && (
            <>
              <p className="text-xs text-muted-foreground">Últimos {history.data.days} días</p>
              {previous.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Todavía no hay resúmenes anteriores en los últimos {history.data.days} días.
                </p>
              ) : (
                <ol aria-label="Resúmenes anteriores" className="mt-2 flex flex-col gap-4">
                  {previous.map((summary) => (
                    <li key={summary.generated}>
                      <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                        {dateTime.format(new Date(summary.generated))}
                      </p>
                      <Points puntos={summary.puntos} />
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Resumen escrito del dashboard hecho con IA (HU 6.3): de 3 a 5 puntos, con
// la fecha en que se generó y "Actualizar". Si no se puede generar, dice que
// no está disponible y el resto del dashboard sigue igual; los anteriores se
// pueden ver igual, porque el historial no depende de la IA.
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

  const shown = estado.error ? null : estado.summary;

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
            <h2 id="titulo-resumen-ia" className="text-[15px] font-semibold">
              Resumen del día
            </h2>
            {shown && (
              <p className="text-xs text-muted-foreground">Generado el {dateTime.format(new Date(shown.generated))}</p>
            )}
          </div>
        </div>
        {!estado.loading && (
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

      {estado.error && (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          Resumen no disponible. El resto del dashboard funciona igual.
        </p>
      )}

      {shown && (
        <div className="mt-4">
          <Points puntos={shown.puntos} />
        </div>
      )}

      {!estado.loading && <SummaryHistory current={shown} />}
    </section>
  );
}
