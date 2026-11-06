import { useState } from "react";
import { ArrowRightIcon, CircleAlertIcon, XCircleIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { cambiarEstadoPedido } from "./apiDashboard";
import { formatearPesos } from "./formato";
import { ESTADOS_PEDIDO, MOTIVO_MAX, MOTIVO_MIN, PAGOS_PEDIDO } from "./pedidos";
import { Campo, Dialogo } from "./piezas";

/* Piezas de los pedidos que usan el listado y el detalle (SCRUM-171). */

function Insignia({ tono, children }) {
  return (
    <Badge variant="outline" className={cn("font-medium", tono)}>
      {children}
    </Badge>
  );
}

export function InsigniaEstadoPedido({ estado }) {
  return <Insignia tono={ESTADOS_PEDIDO[estado].tono}>{ESTADOS_PEDIDO[estado].texto}</Insignia>;
}

export function InsigniaPago({ estadoPago }) {
  return <Insignia tono={PAGOS_PEDIDO[estadoPago].tono}>{PAGOS_PEDIDO[estadoPago].texto}</Insignia>;
}

// Qué se puede hacer con el pedido. La regla la decide el backend
// (siguienteEstado, sePuedeCancelar); acá solo se muestra.
export function AccionesPedido({ pedido, ocupado, onAvanzar, onCancelar, grande = false }) {
  if (pedido.estado === "confirmed" && !pedido.siguienteEstado) {
    return <span className="text-xs text-muted-foreground">Se prepara cuando se pague</span>;
  }
  return (
    <div className="flex items-center justify-end gap-1">
      {pedido.sePuedeCancelar && (
        <Button
          variant={grande ? "outline" : "ghost"}
          size={grande ? "default" : "sm"}
          onClick={() => onCancelar(pedido)}
          disabled={ocupado}
          aria-label={`Cancelar el pedido #${pedido.id}`}
          className={grande ? "h-9 px-4 hover:text-red-700" : "h-7 px-2 text-xs text-muted-foreground hover:text-red-700"}
        >
          <XCircleIcon />
          Cancelar
        </Button>
      )}
      {pedido.siguienteEstado && (
        <Button
          size={grande ? "default" : "sm"}
          onClick={() => onAvanzar(pedido)}
          disabled={ocupado}
          aria-label={`Pasar el pedido #${pedido.id} a ${ESTADOS_PEDIDO[pedido.siguienteEstado].texto}`}
          className={grande ? "h-9 px-4 hover:bg-orange-600" : "h-7 px-2.5 text-xs hover:bg-orange-600"}
        >
          {grande ? `Pasar a ${ESTADOS_PEDIDO[pedido.siguienteEstado].texto}` : ESTADOS_PEDIDO[pedido.siguienteEstado].texto}
          <ArrowRightIcon />
        </Button>
      )}
    </div>
  );
}

// Cancelar es excepcional: pide el motivo (le llega al cliente) y avisa
// todo lo que pasa, porque no se puede deshacer.
function ContenidoCancelar({ pedido, onCancelado }) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cancelar = async (event) => {
    event.preventDefault();
    if (motivo.trim().length < MOTIVO_MIN) {
      setError("Contá por qué se cancela: el cliente lo lee en el mail.");
      return;
    }
    setError("");
    setGuardando(true);
    try {
      onCancelado(await cambiarEstadoPedido(pedido.id, "cancelled", motivo.trim()));
    } catch (falla) {
      setError(falla.message);
      setGuardando(false);
    }
  };

  return (
    <form onSubmit={cancelar} noValidate className="flex flex-col gap-4">
      <Alert>
        <CircleAlertIcon />
        <AlertDescription className="text-xs leading-relaxed">
          Usalo solo en casos excepcionales (no hay stock real, el cliente se arrepintió…). Se le devuelve el pago
          completo ({formatearPesos(pedido.total)}) en Mercado Pago, el stock vuelve al catálogo y el cliente recibe un
          mail con el motivo. No se puede deshacer.
        </AlertDescription>
      </Alert>
      <Campo id="motivo-cancelacion" etiqueta="Motivo" error={error}>
        <Textarea
          id="motivo-cancelacion"
          value={motivo}
          maxLength={MOTIVO_MAX}
          onChange={(event) => setMotivo(event.target.value)}
          aria-invalid={Boolean(error)}
          placeholder="Ej.: el repuesto llegó dañado del proveedor y no tenemos otro."
        />
      </Campo>
      <Button type="submit" variant="destructive" disabled={guardando} className="h-10 px-6 self-end">
        {guardando ? "Cancelando…" : "Cancelar pedido y devolver el pago"}
      </Button>
    </form>
  );
}

export function DialogoCancelarPedido({ pedido, onCerrar, onCancelado }) {
  return (
    <Dialogo
      abierto={pedido !== null}
      onCambiar={(abierto) => !abierto && onCerrar()}
      titulo={pedido ? `Cancelar el pedido #${pedido.id}` : ""}
      descripcion={pedido ? `${pedido.cliente.nombre} · ${pedido.cliente.email}` : null}
      ancho="sm:max-w-[480px]"
    >
      {pedido && <ContenidoCancelar pedido={pedido} onCancelado={onCancelado} />}
    </Dialogo>
  );
}
