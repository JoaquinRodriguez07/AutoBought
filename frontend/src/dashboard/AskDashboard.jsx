// Preguntas en lenguaje natural sobre ventas y stock.

import { useState } from "react";
import { ArrowUpIcon, CircleAlertIcon, SparklesIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { unpublishedFeature, askDashboard } from "./dashboardApi";
import { InDevelopment } from "./pieces";

export const SUGGESTED_QUESTIONS = [
  "¿Qué repuestos tengo que reponer esta semana?",
  "¿Cómo vienen las ventas de Frenos?",
  "¿Qué categoría vendió más en julio?",
];

// Preguntas en lenguaje natural sobre ventas y stock (HU 6.4). La respuesta
// trae los datos que se usaron, para que el vendedor pueda verificarlos.
// Con `disponible` en false (el backend todavía no tiene la ruta) se ve,
// pero dice que está en desarrollo y no deja preguntar.
export default function AskDashboard({ disponible = false }) {
  const [texto, setText] = useState("");
  const [estado, setStatus] = useState({ pregunta: "", result: null, loading: false, error: null });

  const ask = async (pregunta) => {
    const limpia = pregunta.trim();
    if (!limpia || estado.loading || !disponible) return;
    setText(limpia);
    setStatus({ pregunta: limpia, result: null, loading: true, error: null });
    try {
      const result = await askDashboard(limpia);
      setStatus({ pregunta: limpia, result, loading: false, error: null });
    } catch (error) {
      setStatus({ pregunta: limpia, result: null, loading: false, error });
    }
  };

  const send = (event) => {
    event.preventDefault();
    void ask(texto);
  };

  return (
    <section className="flex flex-col gap-5">
      <div className="rounded-xl border bg-card p-4 sm:p-5">
        {!disponible && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
            <InDevelopment />
            Estamos desarrollando esta función. Pronto vas a poder preguntarle al dashboard en tus palabras.
          </div>
        )}
        <form onSubmit={send} className="flex gap-2">
          <label htmlFor="pregunta-dashboard" className="sr-only">
            Tu pregunta
          </label>
          <Input
            id="pregunta-dashboard"
            value={texto}
            onChange={(event) => setText(event.target.value)}
            placeholder="Ej.: ¿qué repuestos se van a agotar este mes?"
            maxLength={300}
            disabled={!disponible}
            className="h-11 flex-1 min-w-0 bg-background"
          />
          <Button type="submit" disabled={!disponible || !texto.trim() || estado.loading} className="h-11 px-4">
            <ArrowUpIcon />
            Preguntar
          </Button>
        </form>

        <div className="mt-4">
          <p className="text-xs text-muted-foreground mb-2">Probá con:</p>
          <ul aria-label="Preguntas sugeridas" className="flex flex-wrap gap-2">
            {SUGGESTED_QUESTIONS.map((suggested) => (
              <li key={suggested}>
                <button
                  type="button"
                  onClick={() => ask(suggested)}
                  disabled={!disponible || estado.loading}
                  className="rounded-full border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-800 disabled:opacity-50 disabled:hover:border-border disabled:hover:bg-muted/40 disabled:hover:text-muted-foreground"
                >
                  {suggested}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {estado.pregunta && (
        <div className="rounded-xl border bg-card p-4 sm:p-5" aria-live="polite">
          <p className="text-xs text-muted-foreground">Preguntaste</p>
          <p className="font-semibold mt-0.5">{estado.pregunta}</p>

          <div className="mt-4 border-t pt-4">
            {estado.loading && (
              <div className="flex flex-col gap-2" aria-label="Pensando…">
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-3/5" />
              </div>
            )}

            {estado.error && (
              <Alert>
                <CircleAlertIcon />
                <AlertDescription>
                  {unpublishedFeature(estado.error)
                    ? "Esta función todavía está en desarrollo."
                    : "No pudimos responder ahora. El resto del dashboard funciona igual; probá de nuevo en un rato."}
                </AlertDescription>
              </Alert>
            )}

            {estado.result && (
              <div className="flex gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-orange-500 text-white">
                  <SparklesIcon className="size-3.5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-relaxed whitespace-pre-line">{estado.result.response}</p>

                  {estado.result.info && (
                    <details className="mt-4 text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground w-fit">
                        Ver los datos que se usaron
                      </summary>
                      <div className="mt-2 border rounded-lg overflow-x-auto">
                        <Table className="text-xs">
                          <TableHeader className="bg-muted">
                            <TableRow>
                              {estado.result.info.columnas.map((column) => (
                                <TableHead key={column}>{column}</TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {estado.result.info.rows.map((row, i) => (
                              <TableRow key={i}>
                                {row.map((rawValue, j) => (
                                  <TableCell key={j} className="tabular-nums">
                                    {rawValue}
                                  </TableCell>
                                ))}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </details>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
