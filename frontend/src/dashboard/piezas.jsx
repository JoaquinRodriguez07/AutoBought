import { CircleAlertIcon, CircleCheckIcon, TriangleAlertIcon } from "lucide-react";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
    <Empty className="border border-dashed bg-muted py-6 md:py-6">
      <EmptyHeader>
        <EmptyDescription className="text-foreground">{children}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

// El nivel va escrito y con ícono: el color solo lo refuerza.
const ESTILO_RIESGO = {
  high: "border-red-200 bg-red-50 text-red-800",
  medium: "border-amber-200 bg-amber-50 text-amber-900",
  low: "border-border bg-muted text-muted-foreground",
};

export function InsigniaRiesgo({ riesgo }) {
  return (
    <Badge variant="outline" className={ESTILO_RIESGO[riesgo]}>
      {riesgo === "low" ? <CircleCheckIcon /> : <TriangleAlertIcon />}
      {RIESGOS[riesgo].etiqueta}
    </Badge>
  );
}

const ESTILO_STOCK = {
  "Sin stock": "border-red-200 bg-red-50 text-red-800",
  "Stock bajo": "border-amber-200 bg-amber-50 text-amber-900",
  Normal: "border-border bg-muted text-muted-foreground",
};

export function InsigniaStock({ stock, stockBajo }) {
  const estado = estadoStock(stock, stockBajo);
  return (
    <Badge variant="outline" className={ESTILO_STOCK[estado]}>
      {estado}
    </Badge>
  );
}

export function Indicador({ titulo, valor, detalle }) {
  return (
    <Card size="sm" className="gap-1">
      <CardContent>
        <p className="text-[10px] font-black tracking-[2px] text-muted-foreground uppercase">{titulo}</p>
        <p className="text-2xl font-black mt-1 tabular-nums">{valor}</p>
        {detalle && <div className="text-[11px] text-muted-foreground mt-1">{detalle}</div>}
      </CardContent>
    </Card>
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
        className="text-left font-semibold whitespace-normal hover:text-orange-600"
      >
        {repuesto.nombre}
      </button>
      {conCodigo && (
        <span className="block text-[11px] text-muted-foreground">
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
      className="flex-wrap bg-background"
    >
      {opciones.map(([opcion, texto]) => (
        <ToggleGroupItem
          key={opcion}
          value={opcion}
          className="px-3 text-xs font-bold aria-pressed:bg-gray-900 aria-pressed:text-white hover:aria-pressed:bg-gray-900"
        >
          {texto}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export function TituloSeccion({ children, detalle }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-black">{children}</h2>
      {detalle && <p className="text-xs text-muted-foreground mt-1">{detalle}</p>}
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
          <DialogTitle className="text-lg font-black">{titulo}</DialogTitle>
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
