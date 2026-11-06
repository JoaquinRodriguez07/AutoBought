import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeftIcon, CircleAlertIcon, MailIcon, MapPinIcon, PhoneIcon, ReceiptIcon, UserIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import LayoutVendedor from "./LayoutVendedor";
import { obtenerPedido } from "./apiDashboard";
import { formatearNumero, formatearPesos } from "./formato";
import { formatearFechaPedido, textoCalle, useCambioDeEstado } from "./pedidos";
import { EstadoConsulta, Panel } from "./piezas";
import { AccionesPedido, DialogoCancelarPedido, InsigniaEstadoPedido, InsigniaPago } from "./piezasPedido";
import { useConsulta } from "./useConsulta";

// Un dato de una tarjeta: "Teléfono  099 123 456".
function Dato({ titulo, children }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{titulo}</dt>
      <dd className="text-sm mt-0.5 break-words">{children}</dd>
    </div>
  );
}

function Productos({ pedido, onRepuesto }) {
  const unidades = pedido.items.reduce((total, item) => total + item.cantidad, 0);
  return (
    <Panel
      titulo="Productos"
      id="titulo-productos-pedido"
      detalle={`${formatearNumero(unidades)} ${unidades === 1 ? "unidad" : "unidades"} para preparar. Precios del momento de la compra.`}
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
                    className="text-left font-medium hover:text-orange-700 hover:underline"
                  >
                    {item.nombre}
                  </button>
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{formatearNumero(item.cantidad)}</TableCell>
                <TableCell className="text-right tabular-nums hidden sm:table-cell">{formatearPesos(item.precio)}</TableCell>
                <TableCell className="pr-4 sm:pr-5 text-right tabular-nums">{formatearPesos(item.precio * item.cantidad)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="mt-4 flex justify-between border-t pt-4 text-sm font-semibold">
        <span>Total</span>
        <span className="tabular-nums">{formatearPesos(pedido.total)}</span>
      </p>
    </Panel>
  );
}

// La dirección es la copia guardada al comprar: no cambia si el cliente
// después la edita o la borra de su perfil.
function Envio({ envio, cliente }) {
  return (
    <Panel
      titulo="Envío"
      id="titulo-envio-pedido"
      Icono={<MapPinIcon className="size-4 mt-0.5 text-orange-600" aria-hidden="true" />}
      detalle="A domicilio, a la dirección que eligió el cliente al comprar."
    >
      <dl className="flex flex-col gap-3">
        <Dato titulo="Recibe">{cliente.nombre}</Dato>
        <Dato titulo={`Dirección${envio.nombreDireccion ? ` («${envio.nombreDireccion}»)` : ""}`}>
          {textoCalle(envio)}
          <span className="block">
            {envio.ciudad}, {envio.departamento}
            {envio.codigoPostal ? ` · CP ${envio.codigoPostal}` : ""}
          </span>
        </Dato>
      </dl>
    </Panel>
  );
}

function Cliente({ cliente }) {
  return (
    <Panel titulo="Cliente" id="titulo-cliente-pedido" Icono={<UserIcon className="size-4 mt-0.5 text-orange-600" aria-hidden="true" />}>
      <dl className="flex flex-col gap-3">
        <Dato titulo="Nombre">{cliente.nombre}</Dato>
        <Dato titulo="Correo">
          <a href={`mailto:${cliente.email}`} className="inline-flex items-center gap-1.5 hover:text-orange-700 hover:underline">
            <MailIcon className="size-3.5" aria-hidden="true" />
            {cliente.email}
          </a>
        </Dato>
        <Dato titulo="Teléfono">
          {cliente.telefono ? (
            <a href={`tel:${cliente.telefono}`} className="inline-flex items-center gap-1.5 hover:text-orange-700 hover:underline">
              <PhoneIcon className="size-3.5" aria-hidden="true" />
              {cliente.telefono}
            </a>
          ) : (
            <span className="text-muted-foreground">No lo cargó</span>
          )}
        </Dato>
      </dl>
    </Panel>
  );
}

function Pago({ pedido }) {
  return (
    <Panel titulo="Pago" id="titulo-pago-pedido" Icono={<ReceiptIcon className="size-4 mt-0.5 text-orange-600" aria-hidden="true" />}>
      <dl className="flex flex-col gap-3">
        <Dato titulo="Estado">
          <InsigniaPago estadoPago={pedido.estadoPago} />
        </Dato>
        <Dato titulo="Medio de pago">{pedido.metodoPago}</Dato>
        {pedido.idPagoMP && <Dato titulo="N.º de pago en Mercado Pago">{pedido.idPagoMP}</Dato>}
        <Dato titulo="Total">{formatearPesos(pedido.total)}</Dato>
      </dl>
    </Panel>
  );
}

// Detalle de un pedido para el vendedor (SCRUM-171): qué productos son,
// a dónde se envía, quién lo pidió y cómo pagó. Desde acá también se
// avanza o se cancela, igual que en el listado.
export default function DetallePedidoVendedor({ usuario, onHome, onCerrarSesion }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const consulta = useConsulta(() => obtenerPedido(id), id);
  const cambio = useCambioDeEstado(() => consulta.recargar());

  // Vuelve a donde estaba (el resumen o el listado con su filtro); entrando
  // directo por la URL, al listado.
  const desde = location.state ? location.state.desde ?? "" : "?vista=pedidos";
  const volver = () => navigate(`/dashboard${desde}`);
  const irAlRepuesto = (repuestoId) =>
    navigate(`/dashboard/repuestos/${repuestoId}`, { state: { desde: "?vista=pedidos" } });

  const pedido = consulta.datos;

  return (
    <LayoutVendedor
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
      descripcion={pedido && `Hecho el ${formatearFechaPedido(pedido.fecha, { larga: true })}`}
      acciones={
        pedido && (
          <AccionesPedido
            pedido={pedido}
            grande
            ocupado={cambio.ocupado || consulta.cargando}
            onAvanzar={cambio.avanzar}
            onCancelar={cambio.pedirCancelar}
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
      <EstadoConsulta consulta={consulta}>
        {(pedido) => (
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Estado:</span>
              <InsigniaEstadoPedido estado={pedido.estado} />
            </div>

            {pedido.motivoCancelacion && (
              <Alert>
                <CircleAlertIcon />
                <AlertDescription>
                  <strong>Cancelado por la tienda.</strong> Motivo: {pedido.motivoCancelacion}
                </AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
              <Productos pedido={pedido} onRepuesto={irAlRepuesto} />
              <div className="flex flex-col gap-6">
                <Envio envio={pedido.envio} cliente={pedido.cliente} />
                <Cliente cliente={pedido.cliente} />
                <Pago pedido={pedido} />
              </div>
            </div>

            <DialogoCancelarPedido pedido={cambio.aCancelar} onCerrar={cambio.cerrarCancelar} onCancelado={cambio.alCancelar} />
          </div>
        )}
      </EstadoConsulta>
    </LayoutVendedor>
  );
}
