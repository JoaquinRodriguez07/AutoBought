// Detalle de un pedido en el portal del vendedor.

import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeftIcon, CircleAlertIcon, MailIcon, PencilIcon, PhoneIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import SellerLayout from "./SellerLayout";
import { updateOrder, getOrder } from "./dashboardApi";
import { formatNumber, formatPesos } from "./format";
import { NOTE_MAX, formatOrderDate, streetText, useStatusChange } from "./orders";
import { QueryState, Panel } from "./pieces";
import {
  OrderActions,
  CancelOrderDialog,
  EditShippingDialog,
  StepBackOrderDialog,
  OrderStatusBadgeSeller,
  PaymentBadge,
} from "./orderPieces";
import { useQuery } from "./useQuery";

// Un dato de una tarjeta: "Teléfono  099 123 456".
function DataItem({ titulo, children }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{titulo}</dt>
      <dd className="text-sm mt-0.5 break-words">{children}</dd>
    </div>
  );
}

function Products({ pedido, onRepuesto }) {
  const unidades = pedido.items.reduce((total, item) => total + item.cantidad, 0);
  return (
    <Panel
      titulo="Productos"
      id="titulo-productos-pedido"
      detalle={`${formatNumber(unidades)} ${unidades === 1 ? "unidad" : "unidades"} para preparar. Precios del momento de la compra.`}
    >
      <div className="-mx-4 sm:-mx-5 border-t">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4 sm:pl-5">Código</TableHead>
              <TableHead>Repuesto</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead className="text-right hidden sm:table-cell">Precio</TableHead>
              <TableHead className="pr-4 sm:pr-5 text-right">Subtotal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pedido.items.map((item) => (
              <TableRow key={item.repuestoId}>
                <TableCell className="pl-4 sm:pl-5 text-xs text-muted-foreground tabular-nums">{item.codigo}</TableCell>
                <TableCell>
                  <button
                    type="button"
                    onClick={() => onRepuesto(item.repuestoId)}
                    className="text-left font-medium whitespace-normal hover:text-orange-600 hover:underline underline-offset-2"
                  >
                    {item.nombre}
                  </button>
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{formatNumber(item.cantidad)}</TableCell>
                <TableCell className="text-right tabular-nums hidden sm:table-cell">{formatPesos(item.precio)}</TableCell>
                <TableCell className="pr-4 sm:pr-5 text-right tabular-nums">{formatPesos(item.precio * item.cantidad)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="mt-4 flex justify-between border-t pt-4 text-sm font-semibold">
        <span>Total</span>
        <span className="tabular-nums">{formatPesos(pedido.total)}</span>
      </p>
    </Panel>
  );
}

// La dirección es la copia guardada al comprar: no cambia si el cliente
// después la edita o la borra de su perfil. El vendedor la corrige a pedido
// del cliente mientras el pedido no salió (`onEditar`).
function Shipping({ envio, cliente, onEditar }) {
  return (
    <Panel
      titulo="Envío"
      id="titulo-envio-pedido"
      detalle="A domicilio, a la dirección que eligió el cliente al comprar."
      accion={
        onEditar && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onEditar}
            aria-label="Editar la dirección de envío"
            className="text-xs text-orange-600 hover:text-orange-700"
          >
            <PencilIcon />
            Editar
          </Button>
        )
      }
    >
      <dl className="flex flex-col gap-3">
        <DataItem titulo="Recibe">{cliente.nombre}</DataItem>
        <DataItem titulo={`Dirección${envio.nombreDireccion ? ` («${envio.nombreDireccion}»)` : ""}`}>
          {streetText(envio)}
          <span className="block">
            {envio.ciudad}, {envio.departamento}
            {envio.codigoPostal ? ` · CP ${envio.codigoPostal}` : ""}
          </span>
        </DataItem>
      </dl>
    </Panel>
  );
}

function Customer({ cliente }) {
  return (
    <Panel titulo="Cliente" id="titulo-cliente-pedido">
      <dl className="flex flex-col gap-3">
        <DataItem titulo="Nombre">{cliente.nombre}</DataItem>
        <DataItem titulo="Correo">
          <a href={`mailto:${cliente.email}`} className="inline-flex items-center gap-1.5 hover:text-orange-600 hover:underline underline-offset-2">
            <MailIcon className="size-3.5" aria-hidden="true" />
            {cliente.email}
          </a>
        </DataItem>
        <DataItem titulo="Teléfono">
          {cliente.telefono ? (
            <a href={`tel:${cliente.telefono}`} className="inline-flex items-center gap-1.5 hover:text-orange-600 hover:underline underline-offset-2">
              <PhoneIcon className="size-3.5" aria-hidden="true" />
              {cliente.telefono}
            </a>
          ) : (
            <span className="text-muted-foreground">No lo cargó</span>
          )}
        </DataItem>
      </dl>
    </Panel>
  );
}

// Lo que la tienda anota sobre el pedido ("entregar de tarde"). El cliente
// no la ve. Se guarda con el botón; vacía, se borra.
function InternalNote({ pedido, onGuardada }) {
  const guardada = pedido.notaInterna ?? "";
  const [texto, setTexto] = useState(guardada);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const cambio = texto.trim() !== guardada;

  const guardar = async (event) => {
    event.preventDefault();
    setError("");
    setGuardando(true);
    try {
      const actualizado = await updateOrder(pedido.id, { notaInterna: texto });
      toast.success(actualizado.notaInterna ? "Nota guardada." : "Nota borrada.");
      onGuardada();
    } catch (falla) {
      setError(falla.message);
      setGuardando(false);
    }
  };

  return (
    <Panel titulo="Nota interna" id="titulo-nota-pedido" detalle="Solo la ve la tienda: no le llega al cliente.">
      <form onSubmit={guardar} className="flex flex-col gap-3">
        <label htmlFor="nota-interna" className="sr-only">
          Nota interna
        </label>
        <Textarea
          id="nota-interna"
          value={texto}
          maxLength={NOTE_MAX}
          onChange={(event) => setTexto(event.target.value)}
          placeholder="Ej.: el cliente pidió que se entregue de tarde."
          rows={2}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground tabular-nums">
            {texto.length} / {NOTE_MAX}
          </span>
          <Button type="submit" variant="outline" size="sm" disabled={!cambio || guardando} className="text-xs">
            {guardando ? "Guardando…" : "Guardar nota"}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function Payment({ pedido }) {
  return (
    <Panel titulo="Pago" id="titulo-pago-pedido">
      <dl className="flex flex-col gap-3">
        <DataItem titulo="Estado">
          <PaymentBadge pedido={pedido} />
        </DataItem>
        <DataItem titulo="Medio de pago">{pedido.metodoPago}</DataItem>
        {pedido.idPagoMP && <DataItem titulo="N.º de pago en Mercado Pago">{pedido.idPagoMP}</DataItem>}
        {pedido.devueltoEl && (
          <DataItem titulo="Devolución">
            Devuelto el {new Date(pedido.devueltoEl).toLocaleDateString("es-UY")}
          </DataItem>
        )}
        {pedido.faltaDevolver && (
          <DataItem titulo="Devolución">
            <span className="font-medium text-destructive">
              {pedido.idPagoMP
                ? "Falta devolver el pago: Mercado Pago no respondió. Se reintenta solo cada día."
                : "Este pago no pasó por Mercado Pago: devolvé el dinero a mano."}
            </span>
          </DataItem>
        )}
        <DataItem titulo="Total">{formatPesos(pedido.total)}</DataItem>
      </dl>
    </Panel>
  );
}

// Detalle de un pedido para el vendedor (SCRUM-171): qué productos son,
// a dónde se envía, quién lo pidió y cómo pagó. Desde acá también se
// avanza o se cancela, igual que en el listado, se vuelve un paso atrás si
// hubo un error, y se corrigen la dirección y la nota interna.
export default function SellerOrderDetail({ usuario, onHome, onCerrarSesion }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const consulta = useQuery(() => getOrder(id), id);
  const cambio = useStatusChange(() => consulta.recargar());
  const [editandoEnvio, setEditandoEnvio] = useState(false);

  // Vuelve a donde estaba (el resumen o el listado con su filtro); entrando
  // directo por la URL, al listado.
  const desde = location.state ? location.state.desde ?? "" : "?vista=pedidos";
  const volver = () => navigate(`/dashboard${desde}`);
  const irAlRepuesto = (repuestoId) =>
    navigate(`/dashboard/repuestos/${repuestoId}`, { state: { desde: "?vista=pedidos" } });

  const pedido = consulta.datos;

  return (
    <SellerLayout
      usuario={usuario}
      vista="pedidos"
      onVista={(valor) => navigate(valor === "resumen" ? "/dashboard" : `/dashboard?vista=${valor}`)}
      onTienda={onHome}
      onCerrarSesion={onCerrarSesion}
      antesDelTitulo={
        <Button variant="ghost" size="sm" onClick={volver} className="-ml-2 mb-3 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon />
          {desde.includes("vista=pedidos") ? "Volver a los pedidos" : "Volver al dashboard"}
        </Button>
      }
      titulo={`Pedido #${id}`}
      descripcion={
        pedido && (
          <span className="inline-flex flex-wrap items-center gap-2">
            Hecho el {formatOrderDate(pedido.fecha, { larga: true })}
            <OrderStatusBadgeSeller estado={pedido.estado} />
          </span>
        )
      }
      acciones={
        pedido && (
          <OrderActions
            pedido={pedido}
            grande
            ocupado={cambio.ocupado || consulta.cargando}
            onAvanzar={cambio.avanzar}
            onCancelar={cambio.pedirCancelar}
            onVolver={cambio.pedirVolver}
          />
        )
      }
    >
      {cambio.error && (
        <Alert variant="destructive" className="mb-6">
          <CircleAlertIcon />
          <AlertDescription>{cambio.error}</AlertDescription>
        </Alert>
      )}
      <QueryState consulta={consulta}>
        {(pedido) => (
          <div className="flex flex-col gap-6">
            {pedido.motivoCancelacion && (
              <Alert>
                <CircleAlertIcon />
                <AlertDescription>
                  <strong>Cancelado por la tienda.</strong> Motivo: {pedido.motivoCancelacion}
                </AlertDescription>
              </Alert>
            )}

            {/* Arriba, a quién y a dónde va y cómo pagó; abajo, qué preparar. */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Shipping
                envio={pedido.envio}
                cliente={pedido.cliente}
                onEditar={pedido.sePuedeEditarEnvio ? () => setEditandoEnvio(true) : null}
              />
              <Customer cliente={pedido.cliente} />
              <Payment pedido={pedido} />
            </div>
            {/* key: cuando el pedido se recarga con otra nota, el campo arranca de lo guardado. */}
            <InternalNote key={pedido.notaInterna ?? ""} pedido={pedido} onGuardada={consulta.recargar} />
            <Products pedido={pedido} onRepuesto={irAlRepuesto} />

            <CancelOrderDialog pedido={cambio.aCancelar} onCerrar={cambio.cerrarCancelar} onCancelado={cambio.alCancelar} />
            <StepBackOrderDialog
              pedido={cambio.aVolver}
              ocupado={cambio.ocupado}
              onCerrar={cambio.cerrarVolver}
              onConfirmar={cambio.volver}
            />
            {pedido.sePuedeEditarEnvio && (
              <EditShippingDialog
                pedido={pedido}
                abierto={editandoEnvio}
                onCambiar={setEditandoEnvio}
                onGuardado={() => {
                  setEditandoEnvio(false);
                  toast.success("Dirección de envío actualizada.");
                  consulta.recargar();
                }}
              />
            )}
          </div>
        )}
      </QueryState>
    </SellerLayout>
  );
}
