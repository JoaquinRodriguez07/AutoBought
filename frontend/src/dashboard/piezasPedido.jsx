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
import { DEPARTAMENTOS, limpiar, validarDireccion } from "../validaciones";
import { cambiarEstadoPedido, editarPedido } from "./apiDashboard";
import { formatearPesos } from "./formato";
import { DEVOLUCION_PEDIDO, ESTADOS_PEDIDO, MOTIVO_MAX, MOTIVO_MIN, PAGOS_PEDIDO } from "./pedidos";
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

// El estado del pago; en un cancelado ya pagado, si se devolvió o falta devolverlo.
export function InsigniaPago({ pedido }) {
  const { texto, tono } = pedido.devueltoEl
    ? DEVOLUCION_PEDIDO.devuelto
    : pedido.faltaDevolver
      ? DEVOLUCION_PEDIDO.falta
      : PAGOS_PEDIDO[pedido.estadoPago];
  return <Insignia tono={tono}>{texto}</Insignia>;
}

// Qué se puede hacer con el pedido. La regla la decide el backend
// (siguienteEstado, anteriorEstado, sePuedeCancelar); acá solo se muestra.
// `onVolver`: solo en el detalle, para corregir un error.
export function AccionesPedido({ pedido, ocupado, onAvanzar, onCancelar, onVolver, grande = false }) {
  if (pedido.estado === "confirmed" && !pedido.siguienteEstado) {
    return <span className="text-xs text-muted-foreground">Se prepara cuando se pague</span>;
  }
  return (
    // En el detalle (tres botones) pueden pasar a otra línea; en la tabla, no.
    <div className={cn("flex items-center justify-end gap-1", grande && "flex-wrap")}>
      {onVolver && pedido.anteriorEstado && (
        <Button
          variant="outline"
          onClick={() => onVolver(pedido)}
          disabled={ocupado}
          aria-label={`Volver el pedido #${pedido.id} a ${ESTADOS_PEDIDO[pedido.anteriorEstado].texto}`}
          className="h-9 px-4"
        >
          <Undo2Icon />
          Volver a {ESTADOS_PEDIDO[pedido.anteriorEstado].texto}
        </Button>
      )}
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
        // En la tabla, borde y letras naranjas: se ve que es la acción de la
        // fila sin llenar la lista de botones naranjas. En el detalle, lleno.
        <Button
          variant={grande ? "default" : "outline"}
          size={grande ? "default" : "sm"}
          onClick={() => onAvanzar(pedido)}
          disabled={ocupado}
          aria-label={`Pasar el pedido #${pedido.id} a ${ESTADOS_PEDIDO[pedido.siguienteEstado].texto}`}
          className={
            grande
              ? "h-9 px-4 hover:bg-orange-600"
              : "h-7 shrink-0 px-2.5 text-xs border-orange-300 text-orange-600 hover:border-orange-400 hover:bg-orange-50 hover:text-orange-700"
          }
        >
          {grande ? `Pasar a ${ESTADOS_PEDIDO[pedido.siguienteEstado].texto}` : ESTADOS_PEDIDO[pedido.siguienteEstado].texto}
          <ArrowRightIcon />
        </Button>
      )}
    </div>
  );
}

// Pide el motivo (le llega al cliente) y avisa todo lo que pasa, porque no
// se puede deshacer. Sin número de pago de Mercado Pago (pedidos viejos) la
// plata no se devuelve sola: se avisa que va a mano.
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
          {pedido.idPagoMP
            ? `Se le devuelve el pago completo (${formatearPesos(pedido.total)}) en Mercado Pago. `
            : `Este pago no pasó por Mercado Pago: los ${formatearPesos(pedido.total)} los tenés que devolver a mano. `}
          El stock vuelve al catálogo y el cliente recibe un mail con el motivo que escribas. No se puede deshacer.
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
        {guardando ? "Cancelando…" : pedido.idPagoMP ? "Cancelar pedido y devolver el pago" : "Cancelar pedido"}
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

// Volver un paso atrás es corregir un error: se confirma, y se aclara que
// el cliente no recibe mail.
export function DialogoVolverPedido({ pedido, ocupado, onCerrar, onConfirmar }) {
  const destino = pedido?.anteriorEstado ? ESTADOS_PEDIDO[pedido.anteriorEstado].texto : "";
  return (
    <Dialogo
      abierto={pedido !== null}
      onCambiar={(abierto) => !abierto && onCerrar()}
      titulo={pedido ? `¿Volver el pedido #${pedido.id} a ${destino}?` : ""}
      descripcion="Para corregir un estado que se marcó por error."
      ancho="sm:max-w-[440px]"
    >
      {pedido && (
        <div className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed">
            El pedido pasa de <strong>{ESTADOS_PEDIDO[pedido.estado].texto}</strong> a <strong>{destino}</strong>. Al
            cliente no le llega mail por este cambio; sí le llega cuando lo vuelvas a avanzar.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onCerrar} disabled={ocupado} className="h-9 px-4">
              No, dejarlo así
            </Button>
            <Button onClick={onConfirmar} disabled={ocupado} className="h-9 px-4 hover:bg-orange-600">
              {ocupado ? "Volviendo…" : `Volver a ${destino}`}
            </Button>
          </div>
        </div>
      )}
    </Dialogo>
  );
}

const CAMPOS_ENVIO = [
  ["nombre", "Nombre de la dirección", "nombreDireccion", "Ej.: Casa, Trabajo"],
  ["calle", "Calle", "calle", ""],
  ["numero", "Número", "numero", ""],
  ["apartamento", "Apto. (opcional)", "apartamento", ""],
  ["ciudad", "Ciudad", "ciudad", ""],
  ["codigoPostal", "Código postal (opcional)", "codigoPostal", ""],
];

// La dirección corregida a pedido del cliente. Las mismas reglas que cuando
// el cliente la carga en su perfil (validarDireccion); el backend vuelve a
// validar. No cambia la dirección guardada en el perfil del cliente.
function ContenidoEditarEnvio({ pedido, onGuardado }) {
  const [datos, setDatos] = useState(() =>
    Object.fromEntries([
      ...CAMPOS_ENVIO.map(([clave, , campoEnvio]) => [clave, pedido.envio[campoEnvio] ?? ""]),
      ["departamento", pedido.envio.departamento],
    ])
  );
  const [errores, setErrores] = useState({});
  const [errorServidor, setErrorServidor] = useState("");
  const [guardando, setGuardando] = useState(false);

  const guardar = async (event) => {
    event.preventDefault();
    const encontrados = validarDireccion(datos);
    setErrores(encontrados);
    if (Object.keys(encontrados).length) return;
    setErrorServidor("");
    setGuardando(true);
    try {
      const envio = {
        nombreDireccion: limpiar(datos.nombre),
        calle: limpiar(datos.calle),
        numero: limpiar(datos.numero),
        apartamento: limpiar(datos.apartamento) || null,
        ciudad: limpiar(datos.ciudad),
        departamento: datos.departamento,
        codigoPostal: limpiar(datos.codigoPostal) || null,
      };
      onGuardado(await editarPedido(pedido.id, { envio }));
    } catch (falla) {
      setErrorServidor(falla.message);
      setGuardando(false);
    }
  };

  const campo = ([clave, etiqueta, , placeholder]) => (
    <Campo key={clave} id={`envio-${clave}`} etiqueta={etiqueta} error={errores[clave]}>
      <Input
        id={`envio-${clave}`}
        value={datos[clave]}
        onChange={(event) => setDatos((actual) => ({ ...actual, [clave]: event.target.value }))}
        aria-invalid={Boolean(errores[clave])}
        aria-describedby={errores[clave] ? `envio-${clave}-error` : undefined}
        placeholder={placeholder}
        className="h-10"
      />
    </Campo>
  );

  return (
    <form onSubmit={guardar} noValidate className="flex flex-col gap-4">
      {errorServidor && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertDescription>{errorServidor}</AlertDescription>
        </Alert>
      )}
      {campo(CAMPOS_ENVIO[0])}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_7rem_7rem] gap-3">{CAMPOS_ENVIO.slice(1, 4).map(campo)}</div>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_9rem] gap-3">
        {campo(CAMPOS_ENVIO[4])}
        <Campo id="envio-departamento" etiqueta="Departamento" error={errores.departamento}>
          <NativeSelect
            id="envio-departamento"
            value={datos.departamento}
            onChange={(event) => setDatos((actual) => ({ ...actual, departamento: event.target.value }))}
            aria-invalid={Boolean(errores.departamento)}
            className="w-full *:h-10"
          >
            {DEPARTAMENTOS.map((departamento) => (
              <NativeSelectOption key={departamento} value={departamento}>
                {departamento}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Campo>
        {campo(CAMPOS_ENVIO[5])}
      </div>
      <p className="text-xs text-muted-foreground">
        Cambia solo la dirección de este pedido, no la que el cliente tiene guardada en su perfil.
      </p>
      <Button type="submit" disabled={guardando} className="h-10 px-6 self-end hover:bg-orange-600">
        {guardando ? "Guardando…" : "Guardar dirección"}
      </Button>
    </form>
  );
}

export function DialogoEditarEnvio({ pedido, abierto, onCambiar, onGuardado }) {
  return (
    <Dialogo
      abierto={abierto}
      onCambiar={onCambiar}
      titulo={`Dirección de envío del pedido #${pedido.id}`}
      descripcion="Corregila si el cliente lo pidió. Se puede mientras el pedido no se envió."
      ancho="sm:max-w-[600px]"
    >
      <ContenidoEditarEnvio pedido={pedido} onGuardado={onGuardado} />
    </Dialogo>
  );
}
