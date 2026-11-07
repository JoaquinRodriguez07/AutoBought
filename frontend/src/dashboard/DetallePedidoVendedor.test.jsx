// Tests del detalle de un pedido del vendedor.

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation, useParams } from "react-router-dom";

jest.mock("./apiDashboard");
jest.mock("react-hot-toast", () => ({ __esModule: true, default: { success: jest.fn(), error: jest.fn() } }));

import DetallePedidoVendedor from "./DetallePedidoVendedor";
import toast from "react-hot-toast";
import { cambiarEstadoPedido, editarPedido, obtenerPedido } from "./apiDashboard";

const pedido = (extra = {}) => ({
  id: 42,
  fecha: "2026-11-05T14:30:00Z",
  estado: "confirmed",
  estadoPago: "approved",
  total: 4300,
  metodoPago: "Mercado Pago",
  idPagoMP: "1234567890",
  cliente: { nombre: "Ana Pérez", email: "ana@example.com", telefono: "099123456" },
  envio: {
    nombreDireccion: "Casa",
    calle: "Av. Italia",
    numero: "1234",
    apartamento: "301",
    ciudad: "Montevideo",
    departamento: "Montevideo",
    codigoPostal: "11300",
  },
  items: [
    { repuestoId: 7, codigo: "FRE-001", nombre: "Pastillas Bosch", cantidad: 2, precio: 1500 },
    { repuestoId: 9, codigo: "FIL-002", nombre: "Filtro de aceite", cantidad: 1, precio: 1300 },
  ],
  siguienteEstado: "packing",
  anteriorEstado: null,
  sePuedeCancelar: true,
  sePuedeEditarEnvio: true,
  motivoCancelacion: null,
  notaInterna: null,
  ...extra,
});

function Lugar() {
  const location = useLocation();
  const { id } = useParams();
  return <p>Estoy en {id ? `repuesto ${id}` : `dashboard${location.search}`}</p>;
}

function renderDetalle(desde) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/dashboard/pedidos/42", state: desde !== undefined ? { desde } : undefined }]}>
      <Routes>
        <Route path="/dashboard/pedidos/:id" element={<DetallePedidoVendedor usuario={{ email: "vendedor@example.com" }} />} />
        <Route path="/dashboard" element={<Lugar />} />
        <Route path="/dashboard/repuestos/:id" element={<Lugar />} />
      </Routes>
    </MemoryRouter>
  );
}

const panel = (titulo) => screen.getByRole("heading", { name: titulo }).closest("section, div.rounded-xl");

beforeEach(() => obtenerPedido.mockResolvedValue(pedido()));
afterEach(() => jest.clearAllMocks());

it("shows the products with their prices and the total", async () => {
  renderDetalle();

  expect(screen.getByRole("heading", { level: 1, name: "Pedido #42" })).toBeInTheDocument();
  const tabla = await screen.findByRole("table");
  const filas = within(tabla).getAllByRole("row");
  expect(filas[1]).toHaveTextContent("FRE-001");
  expect(filas[1]).toHaveTextContent("Pastillas Bosch");
  expect(filas[1]).toHaveTextContent("$ 3.000");
  expect(filas[2]).toHaveTextContent("Filtro de aceite");
  expect(screen.getByText("3 unidades para preparar. Precios del momento de la compra.")).toBeInTheDocument();
  expect(obtenerPedido).toHaveBeenCalledWith("42");
});

it("shows where to ship it, who ordered it and how it was paid", async () => {
  renderDetalle();
  await screen.findByRole("table");

  const envio = panel("Envío");
  expect(envio).toHaveTextContent("RecibeAna Pérez");
  expect(envio).toHaveTextContent("Dirección («Casa»)");
  expect(envio).toHaveTextContent("Av. Italia 1234, apto. 301");
  expect(envio).toHaveTextContent("Montevideo, Montevideo · CP 11300");

  const cliente = panel("Cliente");
  expect(within(cliente).getByRole("link", { name: "ana@example.com" })).toHaveAttribute("href", "mailto:ana@example.com");
  expect(within(cliente).getByRole("link", { name: "099123456" })).toHaveAttribute("href", "tel:099123456");

  const pago = panel("Pago");
  expect(pago).toHaveTextContent("Pagado");
  expect(pago).toHaveTextContent("Mercado Pago");
  expect(pago).toHaveTextContent("1234567890");
});

it("says when the client has no phone", async () => {
  obtenerPedido.mockResolvedValue(pedido({ cliente: { nombre: "Ana", email: "ana@example.com", telefono: null } }));
  renderDetalle();

  expect(await screen.findByText("No lo cargó")).toBeInTheDocument();
});

it("moves the order to the next status from the detail and reloads it", async () => {
  const user = userEvent.setup();
  cambiarEstadoPedido.mockResolvedValue(pedido({ estado: "packing", siguienteEstado: "shipped" }));
  renderDetalle();
  await screen.findByRole("table");
  obtenerPedido.mockResolvedValue(pedido({ estado: "packing", siguienteEstado: "shipped" }));

  await user.click(screen.getByRole("button", { name: "Pasar el pedido #42 a Empaquetando" }));

  expect(cambiarEstadoPedido).toHaveBeenCalledWith(42, "packing");
  expect(await screen.findByRole("button", { name: "Pasar el pedido #42 a Enviado" })).toBeInTheDocument();
  expect(obtenerPedido).toHaveBeenCalledTimes(2);
});

it("cancels with a reason from the detail", async () => {
  const user = userEvent.setup();
  cambiarEstadoPedido.mockResolvedValue(pedido({ estado: "cancelled", siguienteEstado: null, sePuedeCancelar: false }));
  renderDetalle();
  await screen.findByRole("table");

  await user.click(screen.getByRole("button", { name: "Cancelar el pedido #42" }));
  const dialogo = screen.getByRole("dialog");
  await user.type(within(dialogo).getByLabelText("Motivo"), "Llegó roto del proveedor");
  await user.click(within(dialogo).getByRole("button", { name: "Cancelar pedido y devolver el pago" }));

  expect(cambiarEstadoPedido).toHaveBeenCalledWith(42, "cancelled", "Llegó roto del proveedor");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

it("shows why the store cancelled it and offers no actions", async () => {
  obtenerPedido.mockResolvedValue(
    pedido({ estado: "cancelled", siguienteEstado: null, sePuedeCancelar: false, motivoCancelacion: "Sin stock real" })
  );
  renderDetalle();

  expect(await screen.findByText(/Motivo: Sin stock real/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Pasar el pedido/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Cancelar el pedido/ })).not.toBeInTheDocument();
});

it("goes back to the list it came from, and to a part's detail", async () => {
  const user = userEvent.setup();
  renderDetalle("?vista=pedidos&estado=packing");
  await screen.findByRole("table");

  await user.click(screen.getByRole("button", { name: "Pastillas Bosch" }));
  expect(screen.getByText("Estoy en repuesto 7")).toBeInTheDocument();
});

it("goes back to the order list", async () => {
  const user = userEvent.setup();
  renderDetalle("?vista=pedidos&estado=packing");
  await screen.findByRole("table");

  await user.click(screen.getByRole("button", { name: "Volver a los pedidos" }));
  expect(screen.getByText("Estoy en dashboard?vista=pedidos&estado=packing")).toBeInTheDocument();
});

it("goes back to the dashboard summary when it came from there", async () => {
  const user = userEvent.setup();
  renderDetalle("");
  await screen.findByRole("table");

  await user.click(screen.getByRole("button", { name: "Volver al dashboard" }));
  expect(screen.getByText("Estoy en dashboard")).toBeInTheDocument();
});

it("shows the error if the order does not exist", async () => {
  obtenerPedido.mockRejectedValue(Object.assign(new Error("Pedido no encontrado."), { status: 404 }));
  renderDetalle();

  expect(await screen.findByText("Pedido no encontrado.")).toBeInTheDocument();
});

describe("volver un paso atrás", () => {
  it("asks before going back and says the client gets no mail", async () => {
    const user = userEvent.setup();
    obtenerPedido.mockResolvedValue(pedido({ estado: "shipped", siguienteEstado: "delivered", anteriorEstado: "packing" }));
    cambiarEstadoPedido.mockResolvedValue(pedido({ estado: "packing", siguienteEstado: "shipped", anteriorEstado: "confirmed" }));
    renderDetalle();
    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: "Volver el pedido #42 a Empaquetando" }));
    const dialogo = screen.getByRole("dialog", { name: "¿Volver el pedido #42 a Empaquetando?" });
    expect(dialogo).toHaveTextContent("Al cliente no le llega mail");

    // "No" no cambia nada.
    await user.click(within(dialogo).getByRole("button", { name: "No, dejarlo así" }));
    expect(cambiarEstadoPedido).not.toHaveBeenCalled();

    obtenerPedido.mockResolvedValue(pedido({ estado: "packing", siguienteEstado: "shipped", anteriorEstado: "confirmed" }));
    await user.click(screen.getByRole("button", { name: "Volver el pedido #42 a Empaquetando" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Volver a Empaquetando" }));

    expect(cambiarEstadoPedido).toHaveBeenCalledWith(42, "packing");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(toast.success).toHaveBeenCalledWith("Pedido #42: volvió a Empaquetando. Al cliente no le llega mail.");
    expect(await screen.findByRole("button", { name: "Volver el pedido #42 a Confirmado" })).toBeInTheDocument();
  });

  it("does not offer going back when there is nowhere to go", async () => {
    renderDetalle();
    await screen.findByRole("table");

    expect(screen.queryByRole("button", { name: /^Volver el pedido/ })).not.toBeInTheDocument();
  });
});

describe("editar la dirección de envío", () => {
  it("fixes the address with the same rules as the client's profile", async () => {
    const user = userEvent.setup();
    editarPedido.mockResolvedValue(pedido());
    renderDetalle();
    await screen.findByRole("table");

    await user.click(within(panel("Envío")).getByRole("button", { name: "Editar la dirección de envío" }));
    const dialogo = screen.getByRole("dialog", { name: "Dirección de envío del pedido #42" });
    expect(within(dialogo).getByLabelText("Calle")).toHaveValue("Av. Italia");

    await user.clear(within(dialogo).getByLabelText("Calle"));
    await user.click(within(dialogo).getByRole("button", { name: "Guardar dirección" }));
    expect(within(dialogo).getByText("La calle no puede estar vacía.")).toBeInTheDocument();
    expect(editarPedido).not.toHaveBeenCalled();

    await user.type(within(dialogo).getByLabelText("Calle"), "  Bv. Artigas ");
    await user.selectOptions(within(dialogo).getByLabelText("Departamento"), "Canelones");
    await user.clear(within(dialogo).getByLabelText("Ciudad"));
    await user.type(within(dialogo).getByLabelText("Ciudad"), "Pando");
    await user.clear(within(dialogo).getByLabelText("Apto. (opcional)"));
    await user.click(within(dialogo).getByRole("button", { name: "Guardar dirección" }));

    expect(editarPedido).toHaveBeenCalledWith(42, {
      envio: {
        nombreDireccion: "Casa",
        calle: "Bv. Artigas",
        numero: "1234",
        apartamento: null,
        ciudad: "Pando",
        departamento: "Canelones",
        codigoPostal: "11300",
      },
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(toast.success).toHaveBeenCalledWith("Dirección de envío actualizada.");
    expect(obtenerPedido).toHaveBeenCalledTimes(2);
  });

  it("does not let the address change once the order was shipped", async () => {
    obtenerPedido.mockResolvedValue(pedido({ estado: "shipped", sePuedeEditarEnvio: false }));
    renderDetalle();
    await screen.findByRole("table");

    expect(within(panel("Envío")).queryByRole("button", { name: /Editar/ })).not.toBeInTheDocument();
  });
});

describe("nota interna", () => {
  it("saves a note that only the store sees", async () => {
    const user = userEvent.setup();
    editarPedido.mockResolvedValue(pedido({ notaInterna: "Entregar de tarde." }));
    renderDetalle();
    await screen.findByRole("table");

    const nota = within(panel("Nota interna"));
    expect(panel("Nota interna")).toHaveTextContent("Solo la ve la tienda");
    const guardar = nota.getByRole("button", { name: "Guardar nota" });
    expect(guardar).toBeDisabled();

    obtenerPedido.mockResolvedValue(pedido({ notaInterna: "Entregar de tarde." }));
    await user.type(nota.getByRole("textbox", { name: "Nota interna" }), "Entregar de tarde.");
    await user.click(guardar);

    expect(editarPedido).toHaveBeenCalledWith(42, { notaInterna: "Entregar de tarde." });
    expect(toast.success).toHaveBeenCalledWith("Nota guardada.");
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Nota interna" })).toHaveValue("Entregar de tarde."));
    expect(within(panel("Nota interna")).getByRole("button", { name: "Guardar nota" })).toBeDisabled();
  });

  it("shows the saved note, clears it, and shows the error if it could not be saved", async () => {
    const user = userEvent.setup();
    obtenerPedido.mockResolvedValue(pedido({ notaInterna: "Llamar antes." }));
    editarPedido.mockRejectedValue(new Error("No pudimos guardar los cambios del pedido."));
    renderDetalle();

    expect(await screen.findByRole("textbox", { name: "Nota interna" })).toHaveValue("Llamar antes.");
    await user.clear(screen.getByRole("textbox", { name: "Nota interna" }));
    await user.click(screen.getByRole("button", { name: "Guardar nota" }));

    expect(editarPedido).toHaveBeenCalledWith(42, { notaInterna: "" });
    expect(await screen.findByText("No pudimos guardar los cambios del pedido.")).toBeInTheDocument();
  });
});

it("says when the payment was refunded, and warns when it is still pending", async () => {
  obtenerPedido.mockResolvedValue(pedido({ estado: "cancelled", devueltoEl: "2026-11-07T10:00:00Z" }));
  const { unmount } = renderDetalle();
  expect(await screen.findByText(/^Devuelto el /)).toBeInTheDocument();
  unmount();

  obtenerPedido.mockResolvedValue(pedido({ estado: "cancelled", faltaDevolver: true }));
  renderDetalle();
  expect(await screen.findByText(/Falta devolver el pago/)).toBeInTheDocument();
});

it("says to refund by hand when the payment did not go through Mercado Pago", async () => {
  obtenerPedido.mockResolvedValue(pedido({ estado: "cancelled", idPagoMP: null, faltaDevolver: true }));
  renderDetalle();

  expect(await screen.findByText("Este pago no pasó por Mercado Pago: devolvé el dinero a mano.")).toBeInTheDocument();
});
