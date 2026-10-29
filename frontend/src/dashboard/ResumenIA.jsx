import { useEffect, useState } from "react";
import { RefreshCwIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EnDesarrollo } from "./piezas";
import { actualizarResumenIA, funcionSinPublicar, obtenerResumenIA } from "./apiDashboard";

const fechaHora = new Intl.DateTimeFormat("es-UY", { dateStyle: "long", timeStyle: "short" });

// Resumen escrito del dashboard hecho con IA (HU 6.3): de 3 a 5 puntos, con
// la fecha en que se generó y "Actualizar". Mientras el backend no tenga la
// ruta, el panel dice que está en desarrollo; si la IA no responde, avisa y
// el resto del dashboard sigue igual.
export default function ResumenIA() {
  const [estado, setEstado] = useState({ resumen: null, cargando: true, error: null });
  const [actualizando, setActualizando] = useState(false);

  useEffect(() => {
    let vigente = true;
    obtenerResumenIA()
      .then((resumen) => vigente && setEstado({ resumen, cargando: false, error: null }))
      .catch((error) => vigente && setEstado({ resumen: null, cargando: false, error }));
    return () => {
      vigente = false;
    };
  }, []);

  const actualizar = async () => {
    setActualizando(true);
    try {
      const resumen = await actualizarResumenIA();
      setEstado({ resumen, cargando: false, error: null });
    } catch (error) {
      setEstado((anterior) => ({ ...anterior, error }));
    } finally {
      setActualizando(false);
    }
  };

  const enDesarrollo = funcionSinPublicar(estado.error);

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
              {enDesarrollo && <EnDesarrollo />}
            </h2>
            {estado.resumen && (
              <p className="text-xs text-muted-foreground">Generado el {fechaHora.format(new Date(estado.resumen.generado))}</p>
            )}
          </div>
        </div>
        {!estado.cargando && !enDesarrollo && (
          <Button variant="outline" size="sm" onClick={actualizar} disabled={actualizando}>
            <RefreshCwIcon className={actualizando ? "animate-spin" : undefined} />
            Actualizar
          </Button>
        )}
      </div>

      {estado.cargando && (
        <div className="mt-4 flex flex-col gap-2" aria-label="Cargando…">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      )}

      {enDesarrollo && (
        <p className="mt-3 text-sm text-muted-foreground">
          Estamos desarrollando un resumen escrito con IA de cómo vienen las ventas y qué conviene reponer. Va a
          aparecer acá.
        </p>
      )}

      {estado.error && !enDesarrollo && (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          El resumen no está disponible en este momento. El resto del dashboard funciona igual.
        </p>
      )}

      {estado.resumen && !estado.error && (
        <ul className="mt-4 flex flex-col gap-2 text-sm leading-relaxed">
          {estado.resumen.puntos.map((punto) => (
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
