import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  MinusIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { RIESGOS, estadoStock } from "./formato";

// Cargando / error con Reintentar / contenido, igual en todas las secciones.
export function EstadoConsulta({ consulta, children }) {
  if (consulta.error) {
    return (
      <Alert variant="destructive">
        <CircleAlertIcon />
        <AlertDescription>{consulta.error}</AlertDescription>
        <AlertAction>
          <Button variant="outline" size="sm" onClick={consulta.recargar}>
            Reintentar
          </Button>
        </AlertAction>
      </Alert>
    );
  }
  if (consulta.cargando && !consulta.datos) {
    return (
      <div className="flex flex-col gap-2 py-2" aria-label="Cargando…">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  return children(consulta.datos);
}

// Estado vacío de una sección ("No hay repuestos que requieran reposición").
export function SinDatos({ children }) {
  return (
    <Empty className="border border-dashed bg-muted/40 py-8 md:py-8">
      <EmptyHeader>
        <EmptyDescription className="text-muted-foreground">{children}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

// Colores de estado sobre fondo oscuro: rojo = urgente, ámbar = atención,
// verde = bien. El estado siempre va escrito; el color solo lo refuerza.
export const TONOS = {
  rojo: "border-red-200 bg-red-50 text-red-700",
  ambar: "border-amber-200 bg-amber-50 text-amber-800",
  verde: "border-emerald-200 bg-emerald-50 text-emerald-700",
  neutro: "border-border bg-muted text-muted-foreground",
};

const TONO_RIESGO = { high: TONOS.rojo, medium: TONOS.ambar, low: TONOS.neutro };

export function InsigniaRiesgo({ riesgo }) {
  return (
    <Badge variant="outline" className={cn("font-medium", TONO_RIESGO[riesgo])}>
      {riesgo === "low" ? <CircleCheckIcon /> : <TriangleAlertIcon />}
      {RIESGOS[riesgo].etiqueta}
    </Badge>
  );
}

const TONO_STOCK = { "Sin stock": TONOS.rojo, "Stock bajo": TONOS.ambar, Normal: TONOS.neutro };

export function InsigniaStock({ stock, stockBajo }) {
  const estado = estadoStock(stock, stockBajo);
  return (
    <Badge variant="outline" className={cn("font-medium", TONO_STOCK[estado])}>
      {estado}
    </Badge>
  );
}

// Para lo que todavía no está hecho en el backend (HU 6.3 y 6.4).
export function EnDesarrollo() {
  return (
    <Badge variant="outline" className={cn("font-medium", TONOS.ambar)}>
      En desarrollo
    </Badge>
  );
}

// Subió o bajó contra el período anterior. `mejor`: si subir es bueno
// (ventas) o malo; define el verde o el rojo.
export function Cambio({ porcentaje, texto, mejor = "subir" }) {
  if (porcentaje === null || porcentaje === undefined) return null;
  const sube = porcentaje > 0;
  const igual = porcentaje === 0;
  const bueno = igual ? null : sube === (mejor === "subir");
  const Flecha = igual ? MinusIcon : sube ? ArrowUpRightIcon : ArrowDownRightIcon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums",
        bueno === null ? "bg-muted text-muted-foreground" : bueno ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
      )}
    >
      <Flecha className="size-3.5" aria-hidden="true" />
      {sube ? "+" : igual ? "" : "−"}
      {Math.abs(porcentaje)} %
      {texto && <span className="font-normal text-muted-foreground"> {texto}</span>}
    </span>
  );
}


// Un número clave. `cambio` va debajo del número (por ejemplo, <Cambio />).
// Con `onClick`, toda la tarjeta es un botón (por ejemplo, para ver la
// lista de lo que cuenta) y lo dice con `accion`.
export function Indicador({ titulo, valor, detalle, cambio, Icono, onClick, accion }) {
  const contenido = (
    <div
      className={cn(
        "flex h-full flex-col rounded-xl border bg-card p-4 sm:p-5 shadow-xs transition",
        onClick && "group-hover:border-gray-300 group-hover:shadow-md"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">{titulo}</p>
        {Icono && (
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-gray-100 text-gray-600">
            <Icono className="size-4" aria-hidden="true" />
          </span>
        )}
      </div>
      <p className="text-[28px] leading-tight font-semibold tabular-nums tracking-tight mt-1">{valor}</p>
      {(cambio || detalle) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {cambio}
          {detalle && <span>{detalle}</span>}
        </div>
      )}
      {onClick && accion && (
        <span className="mt-auto pt-3 inline-flex items-center gap-1 text-xs font-medium text-orange-600 group-hover:text-orange-700">
          {accion}
          <ChevronRightIcon className="size-3.5 transition group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      )}
    </div>
  );

  if (!onClick) return contenido;
  return (
    <button type="button" onClick={onClick} className="group block h-full w-full text-left rounded-xl focus-visible:outline-2 focus-visible:outline-orange-500">
      {contenido}
    </button>
  );
}

// Tarjeta con título de cada bloque del dashboard. `accion` va a la
// derecha del título (por ejemplo, "Ver todas").
export function Panel({ titulo, id, detalle, accion, Icono, className, children }) {
  return (
    <section aria-labelledby={id} className={cn("rounded-xl border bg-card p-4 sm:p-5 shadow-xs", className)}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3 min-w-0">
          {Icono}
          <div className="min-w-0">
            <h2 id={id} className="text-[15px] font-semibold">
              {titulo}
            </h2>
            {detalle && <p className="text-xs text-muted-foreground mt-0.5">{detalle}</p>}
          </div>
        </div>
        {accion && <div className="shrink-0">{accion}</div>}
      </div>
      {children}
    </section>
  );
}

// Nombre de un repuesto en una tabla: abre su detalle. Con `conCodigo`, el
// código y la categoría van debajo.
export function NombreRepuesto({ repuesto, onDetalle, conCodigo = false }) {
  return (
    <>
      <button
        type="button"
        onClick={() => onDetalle(repuesto.id)}
        className="text-left font-medium whitespace-normal hover:text-orange-600 hover:underline underline-offset-2"
      >
        {repuesto.nombre}
      </button>
      {conCodigo && (
        <span className="block text-xs text-muted-foreground">
          {repuesto.codigo} · {repuesto.categoria}
        </span>
      )}
    </>
  );
}

// Un grupo de botones donde siempre hay uno elegido (qué mostrar, estado
// del stock). `opciones`: [[valor, texto], ...].
export function Opciones({ etiqueta, valor, onCambiar, opciones }) {
  return (
    <ToggleGroup
      aria-label={etiqueta}
      variant="outline"
      spacing={0}
      value={[valor]}
      onValueChange={(elegidos) => elegidos.length && onCambiar(elegidos[0])}
      className="flex-wrap rounded-lg bg-white"
    >
      {opciones.map(([opcion, texto]) => (
        <ToggleGroupItem
          key={opcion}
          value={opcion}
          className="px-3 text-xs font-medium text-muted-foreground aria-pressed:bg-gray-900 aria-pressed:text-white hover:aria-pressed:bg-gray-900"
        >
          {texto}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export function TituloSeccion({ children, detalle }) {
  return (
    <div className="mb-4 max-w-2xl">
      <h2 className="text-[15px] font-semibold">{children}</h2>
      {detalle && <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{detalle}</p>}
    </div>
  );
}

// Ventana modal del dashboard. El contenido se monta al abrirla, así cada
// vez arranca con el formulario limpio.
export function Dialogo({ abierto, onCambiar, titulo, descripcion, ancho = "sm:max-w-[640px]", children }) {
  return (
    <Dialog open={abierto} onOpenChange={onCambiar}>
      <DialogContent className={cn("max-h-[90vh] overflow-y-auto p-6", ancho)}>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{titulo}</DialogTitle>
          {descripcion && <DialogDescription className="text-xs">{descripcion}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function Campo({ id, etiqueta, error, children }) {
  return (
    <Field data-invalid={Boolean(error)} className="gap-1.5">
      <FieldLabel htmlFor={id} className="text-xs font-bold">
        {etiqueta}
      </FieldLabel>
      {children}
      {error && (
        <FieldError id={`${id}-error`} className="text-xs">
          {error}
        </FieldError>
      )}
    </Field>
  );
}
