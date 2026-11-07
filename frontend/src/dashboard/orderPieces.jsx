// Piezas de los pedidos del vendedor: insignias, acciones y ventanas.

import { useState } from "react";
import { ArrowRightIcon, CircleAlertIcon, Undo2Icon, XCircleIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { DEPARTMENTS, clean, validateAddress } from "../validations";
import { changeOrderStatus, updateOrder } from "./dashboardApi";
import { formatPesos } from "./format";
import { ORDER_REFUNDS, ORDER_STATUSES, REASON_MAX, REASON_MIN, ORDER_PAYMENTS } from "./orders";
import { FormField, DashboardDialog } from "./pieces";

/* Piezas de los pedidos que usan el listado y el detalle (SCRUM-171). */

function Pill({ tono, children }) {
  return (
    <Badge variant="outline" className={cn("font-medium", tono)}>
      {children}
    </Badge>
  );
}

export function OrderStatusBadgeSeller({ estado }) {
  return <Pill tono={ORDER_STATUSES[estado].tono}>{ORDER_STATUSES[estado].texto}</Pill>;
}

// El estado del pago; en un cancelado ya pagado, si se devolvió o falta devolverlo.
export function PaymentBadge({ pedido }) {
  const { texto, tono } = pedido.refunded
    ? ORDER_REFUNDS.refunded
    : pedido.faltaDevolver
      ? ORDER_REFUNDS.falta
      : ORDER_PAYMENTS[pedido.paymentStatus];
  return <Pill tono={tono}>{texto}</Pill>;
}

// Qué se puede hacer con el pedido. La regla la decide el backend
// (siguienteEstado, anteriorEstado, sePuedeCancelar); acá solo se muestra.
// `onVolver`: solo en el detalle, para corregir un error.
export function OrderActions({ pedido, busy, onAvanzar, onCancel, onGoBack, large = false }) {
  if (pedido.estado === "confirmed" && !pedido.nextStatus) {
    return <span className="text-xs text-muted-foreground">Se prepara cuando se pague</span>;
  }
  return (
    // En el detalle (tres botones) pueden pasar a otra línea; en la tabla, no.
    <div className={cn("flex items-center justify-end gap-1", large && "flex-wrap")}>
      {onGoBack && pedido.previousStatus && (
        <Button
          variant="outline"
          onClick={() => onGoBack(pedido)}
          disabled={busy}
          aria-label={`Volver el pedido #${pedido.id} a ${ORDER_STATUSES[pedido.previousStatus].texto}`}
          className="h-9 px-4"
        >
          <Undo2Icon />
          Volver a {ORDER_STATUSES[pedido.previousStatus].texto}
        </Button>
      )}
      {pedido.canCancel && (
        <Button
          variant={large ? "outline" : "ghost"}
          size={large ? "default" : "sm"}
          onClick={() => onCancel(pedido)}
          disabled={busy}
          aria-label={`Cancelar el pedido #${pedido.id}`}
          className={large ? "h-9 px-4 hover:text-red-700" : "h-7 px-2 text-xs text-muted-foreground hover:text-red-700"}
        >
          <XCircleIcon />
          Cancelar
        </Button>
      )}
      {pedido.nextStatus && (
        // En la tabla, borde y letras naranjas: se ve que es la acción de la
        // fila sin llenar la lista de botones naranjas. En el detalle, lleno.
        <Button
          variant={large ? "default" : "outline"}
          size={large ? "default" : "sm"}
          onClick={() => onAvanzar(pedido)}
          disabled={busy}
          aria-label={`Pasar el pedido #${pedido.id} a ${ORDER_STATUSES[pedido.nextStatus].texto}`}
          className={
            large
              ? "h-9 px-4 hover:bg-orange-600"
              : "h-7 shrink-0 px-2.5 text-xs border-orange-300 text-orange-600 hover:border-orange-400 hover:bg-orange-50 hover:text-orange-700"
          }
        >
          {large ? `Pasar a ${ORDER_STATUSES[pedido.nextStatus].texto}` : ORDER_STATUSES[pedido.nextStatus].texto}
          <ArrowRightIcon />
        </Button>
      )}
    </div>
  );
}

// Pide el motivo (le llega al cliente) y avisa todo lo que pasa, porque no
// se puede deshacer. Sin número de pago de Mercado Pago (pedidos viejos) la
// plata no se devuelve sola: se avisa que va a mano.
function CancelContent({ pedido, onCancelled }) {
  const [motivo, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const cancel = async (event) => {
    event.preventDefault();
    if (motivo.trim().length < REASON_MIN) {
      setError("Contá por qué se cancela: el cliente lo lee en el mail.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      onCancelled(await changeOrderStatus(pedido.id, "cancelled", motivo.trim()));
    } catch (failure) {
      setError(failure.message);
      setSaving(false);
    }
  };

  return (
    <form onSubmit={cancel} noValidate className="flex flex-col gap-4">
      <Alert>
        <CircleAlertIcon />
        <AlertDescription className="text-xs leading-relaxed">
          {pedido.idPaymentMP
            ? `Se le devuelve el pago completo (${formatPesos(pedido.total)}) en Mercado Pago. `
            : `Este pago no pasó por Mercado Pago: los ${formatPesos(pedido.total)} los tenés que devolver a mano. `}
          El stock vuelve al catálogo y el cliente recibe un mail con el motivo que escribas. No se puede deshacer.
        </AlertDescription>
      </Alert>
      <FormField id="motivo-cancelacion" label="Motivo" error={error}>
        <Textarea
          id="motivo-cancelacion"
          value={motivo}
          maxLength={REASON_MAX}
          onChange={(event) => setReason(event.target.value)}
          aria-invalid={Boolean(error)}
          placeholder="Ej.: el repuesto llegó dañado del proveedor y no tenemos otro."
        />
      </FormField>
      <Button type="submit" variant="destructive" disabled={saving} className="h-10 px-6 self-end">
        {saving ? "Cancelando…" : pedido.idPaymentMP ? "Cancelar pedido y devolver el pago" : "Cancelar pedido"}
      </Button>
    </form>
  );
}

export function CancelOrderDialog({ pedido, onClose, onCancelled }) {
  return (
    <DashboardDialog
      isOpen={pedido !== null}
      onChange={(isOpen) => !isOpen && onClose()}
      title={pedido ? `Cancelar el pedido #${pedido.id}` : ""}
      description={pedido ? `${pedido.customer.displayName} · ${pedido.customer.email}` : null}
      ancho="sm:max-w-[480px]"
    >
      {pedido && <CancelContent pedido={pedido} onCancelled={onCancelled} />}
    </DashboardDialog>
  );
}

// Volver un paso atrás es corregir un error: se confirma, y se aclara que
// el cliente no recibe mail.
export function StepBackOrderDialog({ pedido, busy, onClose, onConfirm }) {
  const destination = pedido?.previousStatus ? ORDER_STATUSES[pedido.previousStatus].texto : "";
  return (
    <DashboardDialog
      isOpen={pedido !== null}
      onChange={(isOpen) => !isOpen && onClose()}
      title={pedido ? `¿Volver el pedido #${pedido.id} a ${destination}?` : ""}
      description="Para corregir un estado que se marcó por error."
      ancho="sm:max-w-[440px]"
    >
      {pedido && (
        <div className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed">
            El pedido pasa de <strong>{ORDER_STATUSES[pedido.estado].texto}</strong> a <strong>{destination}</strong>. Al
            cliente no le llega mail por este cambio; sí le llega cuando lo vuelvas a avanzar.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy} className="h-9 px-4">
              No, dejarlo así
            </Button>
            <Button onClick={onConfirm} disabled={busy} className="h-9 px-4 hover:bg-orange-600">
              {busy ? "Volviendo…" : `Volver a ${destination}`}
            </Button>
          </div>
        </div>
      )}
    </DashboardDialog>
  );
}

const SHIPPING_FIELDS = [
  ["displayName", "Nombre de la dirección", "addressName", "Ej.: Casa, Trabajo"],
  ["street", "Calle", "street", ""],
  ["number", "Número", "number", ""],
  ["apartamento", "Apto. (opcional)", "apartamento", ""],
  ["city", "Ciudad", "city", ""],
  ["codePostal", "Código postal (opcional)", "codePostal", ""],
];

// La dirección corregida a pedido del cliente. Las mismas reglas que cuando
// el cliente la carga en su perfil (validarDireccion); el backend vuelve a
// validar. No cambia la dirección guardada en el perfil del cliente.
function EditShippingContent({ pedido, onSaved }) {
  const [info, setData] = useState(() =>
    Object.fromEntries([
      ...SHIPPING_FIELDS.map(([key, , shippingField]) => [key, pedido.shipping[shippingField] ?? ""]),
      ["department", pedido.shipping.department],
    ])
  );
  const [errors, setErrors] = useState({});
  const [errorServer, setErrorServer] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async (event) => {
    event.preventDefault();
    const found = validateAddress(info);
    setErrors(found);
    if (Object.keys(found).length) return;
    setErrorServer("");
    setSaving(true);
    try {
      const shipping = {
        addressName: clean(info.displayName),
        street: clean(info.street),
        number: clean(info.number),
        apartamento: clean(info.apartamento) || null,
        city: clean(info.city),
        department: info.department,
        codePostal: clean(info.codePostal) || null,
      };
      onSaved(await updateOrder(pedido.id, { shipping }));
    } catch (failure) {
      setErrorServer(failure.message);
      setSaving(false);
    }
  };

  const field = ([key, label, , placeholder]) => (
    <FormField key={key} id={`envio-${key}`} label={label} error={errors[key]}>
      <Input
        id={`envio-${key}`}
        value={info[key]}
        onChange={(event) => setData((current) => ({ ...current, [key]: event.target.value }))}
        aria-invalid={Boolean(errors[key])}
        aria-describedby={errors[key] ? `envio-${key}-error` : undefined}
        placeholder={placeholder}
        className="h-10"
      />
    </FormField>
  );

  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-4">
      {errorServer && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertDescription>{errorServer}</AlertDescription>
        </Alert>
      )}
      {field(SHIPPING_FIELDS[0])}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_7rem_7rem] gap-3">{SHIPPING_FIELDS.slice(1, 4).map(field)}</div>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_9rem] gap-3">
        {field(SHIPPING_FIELDS[4])}
        <FormField id="envio-departamento" label="Departamento" error={errors.department}>
          <NativeSelect
            id="envio-departamento"
            value={info.department}
            onChange={(event) => setData((current) => ({ ...current, department: event.target.value }))}
            aria-invalid={Boolean(errors.department)}
            className="w-full *:h-10"
          >
            {DEPARTMENTS.map((department) => (
              <NativeSelectOption key={department} value={department}>
                {department}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
        {field(SHIPPING_FIELDS[5])}
      </div>
      <p className="text-xs text-muted-foreground">
        Cambia solo la dirección de este pedido, no la que el cliente tiene guardada en su perfil.
      </p>
      <Button type="submit" disabled={saving} className="h-10 px-6 self-end hover:bg-orange-600">
        {saving ? "Guardando…" : "Guardar dirección"}
      </Button>
    </form>
  );
}

export function EditShippingDialog({ pedido, isOpen, onChange, onSaved }) {
  return (
    <DashboardDialog
      isOpen={isOpen}
      onChange={onChange}
      title={`Dirección de envío del pedido #${pedido.id}`}
      description="Corregila si el cliente lo pidió. Se puede mientras el pedido no se envió."
      ancho="sm:max-w-[600px]"
    >
      <EditShippingContent pedido={pedido} onSaved={onSaved} />
    </DashboardDialog>
  );
}
