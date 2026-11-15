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
function DataItem({ title, children }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{title}</dt>
      <dd className="text-sm mt-0.5 break-words">{children}</dd>
    </div>
  );
}

function Products({ pedido, onPart }) {
  const units = pedido.items.reduce((total, item) => total + item.quantity, 0);
  return (
    <Panel
      title="Productos"
      id="titulo-productos-pedido"
      details={`${formatNumber(units)} ${units === 1 ? "unidad" : "unidades"} para preparar. Precios del momento de la compra.`}
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
              <TableRow key={item.idPart}>
                <TableCell className="pl-4 sm:pl-5 text-xs text-muted-foreground tabular-nums">{item.code}</TableCell>
                <TableCell>
                  <button
                    type="button"
                    onClick={() => onPart(item.idPart)}
                    className="text-left font-medium whitespace-normal hover:text-orange-600 hover:underline underline-offset-2"
                  >
                    {item.displayName}
                  </button>
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{formatNumber(item.quantity)}</TableCell>
                <TableCell className="text-right tabular-nums hidden sm:table-cell">{formatPesos(item.price)}</TableCell>
                <TableCell className="pr-4 sm:pr-5 text-right tabular-nums">{formatPesos(item.price * item.quantity)}</TableCell>
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
function Shipping({ shipping, customer, onEdit }) {
  return (
    <Panel
      title="Envío"
      id="titulo-envio-pedido"
      details="A domicilio, a la dirección que eligió el cliente al comprar."
      action={
        onEdit && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
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
        <DataItem title="Recibe">{customer.displayName}</DataItem>
        <DataItem title={`Dirección${shipping.addressName ? ` («${shipping.addressName}»)` : ""}`}>
          {streetText(shipping)}
          <span className="block">
            {shipping.city}, {shipping.department}
            {shipping.codePostal ? ` · CP ${shipping.codePostal}` : ""}
          </span>
        </DataItem>
      </dl>
    </Panel>
  );
}

function Customer({ customer }) {
  return (
    <Panel title="Cliente" id="titulo-cliente-pedido">
      <dl className="flex flex-col gap-3">
        <DataItem title="Nombre">{customer.displayName}</DataItem>
        <DataItem title="Correo">
          <a href={`mailto:${customer.email}`} className="inline-flex items-center gap-1.5 hover:text-orange-600 hover:underline underline-offset-2">
            <MailIcon className="size-3.5" aria-hidden="true" />
            {customer.email}
          </a>
        </DataItem>
        <DataItem title="Teléfono">
          {customer.phone ? (
            <a href={`tel:${customer.phone}`} className="inline-flex items-center gap-1.5 hover:text-orange-600 hover:underline underline-offset-2">
              <PhoneIcon className="size-3.5" aria-hidden="true" />
              {customer.phone}
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
function InternalNote({ pedido, onSaved }) {
  const saved = pedido.internalNote ?? "";
  const [texto, setText] = useState(saved);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const cambio = texto.trim() !== saved;

  const save = async (event) => {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const updated = await updateOrder(pedido.id, { internalNote: texto });
      toast.success(updated.internalNote ? "Nota guardada." : "Nota borrada.");
      onSaved();
    } catch (failure) {
      setError(failure.message);
      setSaving(false);
    }
  };

  return (
    <Panel title="Nota interna" id="titulo-nota-pedido" details="Solo la ve la tienda: no le llega al cliente.">
      <form onSubmit={save} className="flex flex-col gap-3">
        <label htmlFor="nota-interna" className="sr-only">
          Nota interna
        </label>
        <Textarea
          id="nota-interna"
          value={texto}
          maxLength={NOTE_MAX}
          onChange={(event) => setText(event.target.value)}
          placeholder="Ej.: el cliente pidió que se entregue de tarde."
          rows={2}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground tabular-nums">
            {texto.length} / {NOTE_MAX}
          </span>
          <Button type="submit" variant="outline" size="sm" disabled={!cambio || saving} className="text-xs">
            {saving ? "Guardando…" : "Guardar nota"}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function Payment({ pedido }) {
  return (
    <Panel title="Pago" id="titulo-pago-pedido">
      <dl className="flex flex-col gap-3">
        <DataItem title="Estado">
          <PaymentBadge pedido={pedido} />
        </DataItem>
        <DataItem title="Medio de pago">{pedido.paymentMethod}</DataItem>
        {pedido.idPaymentMP && <DataItem title="N.º de pago en Mercado Pago">{pedido.idPaymentMP}</DataItem>}
        {pedido.refunded && (
          <DataItem title="Devolución">
            Devuelto el {new Date(pedido.refunded).toLocaleDateString("es-UY")}
          </DataItem>
        )}
        {pedido.faltaDevolver && (
          <DataItem title="Devolución">
            <span className="font-medium text-destructive">
              {pedido.idPaymentMP
                ? "Falta devolver el pago: Mercado Pago no respondió. Se reintenta solo cada día."
                : "Este pago no pasó por Mercado Pago: devolvé el dinero a mano."}
            </span>
          </DataItem>
        )}
        <DataItem title="Total">{formatPesos(pedido.total)}</DataItem>
      </dl>
    </Panel>
  );
}

// Detalle de un pedido para el vendedor (SCRUM-171): qué productos son,
// a dónde se envía, quién lo pidió y cómo pagó. Desde acá también se
// avanza o se cancela, igual que en el listado, se vuelve un paso atrás si
// hubo un error, y se corrigen la dirección y la nota interna.
export default function SellerOrderDetail({ sessionUser, onHome, onCloseSession }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryState = useQuery(() => getOrder(id), id);
  const cambio = useStatusChange(() => queryState.reload());
  const [editingShipping, setEditingShipping] = useState(false);

  // Vuelve a donde estaba (el resumen o el listado con su filtro); entrando
  // directo por la URL, al listado.
  const from = location.state ? location.state.from ?? "" : "?vista=orders";
  const goBack = () => navigate(`/dashboard${from}`);
  const goToPart = (idPart) =>
    navigate(`/dashboard/repuestos/${idPart}`, { state: { from: "?vista=orders" } });

  const pedido = queryState.info;

  return (
    <SellerLayout
      sessionUser={sessionUser}
      vista="orders"
      onView={(rawValue) => navigate(rawValue === "summary" ? "/dashboard" : `/dashboard?vista=${rawValue}`)}
      onStore={onHome}
      onCloseSession={onCloseSession}
      titleBefore={
        <Button variant="ghost" size="sm" onClick={goBack} className="-ml-2 mb-3 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon />
          {from.includes("vista=orders") ? "Volver a los pedidos" : "Volver al dashboard"}
        </Button>
      }
      title={`Pedido #${id}`}
      description={
        pedido && (
          <span className="inline-flex flex-wrap items-center gap-2">
            Hecho el {formatOrderDate(pedido.date, { larga: true })}
            <OrderStatusBadgeSeller estado={pedido.estado} />
          </span>
        )
      }
      actions={
        pedido && (
          <OrderActions
            pedido={pedido}
            large
            busy={cambio.busy || queryState.loading}
            onAvanzar={cambio.avanzar}
            onCancel={cambio.askCancel}
            onGoBack={cambio.askGoBack}
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
      <QueryState queryState={queryState}>
        {(pedido) => (
          <div className="flex flex-col gap-6">
            {pedido.reasonCancellation && (
              <Alert>
                <CircleAlertIcon />
                <AlertDescription>
                  <strong>Cancelado por la tienda.</strong> Motivo: {pedido.reasonCancellation}
                </AlertDescription>
              </Alert>
            )}

            {/* Arriba, a quién y a dónde va y cómo pagó; abajo, qué preparar. */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {pedido.deliveryMethod === "pickup" ? (
                <Panel title="Retiro en el local" details="El cliente pasa a buscar el pedido al comercio.">
                  <p>Sin dirección de envío.</p>
                </Panel>
              ) : <Shipping
                shipping={pedido.shipping}
                customer={pedido.customer}
                onEdit={pedido.canEditShipping ? () => setEditingShipping(true) : null}
              />}
              <Customer customer={pedido.customer} />
              <Payment pedido={pedido} />
            </div>
            {/* key: cuando el pedido se recarga con otra nota, el campo arranca de lo guardado. */}
            <InternalNote key={pedido.internalNote ?? ""} pedido={pedido} onSaved={queryState.reload} />
            <Products pedido={pedido} onPart={goToPart} />

            <CancelOrderDialog pedido={cambio.toCancel} onClose={cambio.closeCancel} onCancelled={cambio.onCancel} />
            <StepBackOrderDialog
              pedido={cambio.toGoBack}
              busy={cambio.busy}
              onClose={cambio.closeGoBack}
              onConfirm={cambio.goBack}
            />
            {pedido.canEditShipping && (
              <EditShippingDialog
                pedido={pedido}
                isOpen={editingShipping}
                onChange={setEditingShipping}
                onSaved={() => {
                  setEditingShipping(false);
                  toast.success("Dirección de envío actualizada.");
                  queryState.reload();
                }}
              />
            )}
          </div>
        )}
      </QueryState>
    </SellerLayout>
  );
}
