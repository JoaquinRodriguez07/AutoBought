import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation, useParams } from "react-router-dom";

jest.mock("./apiDashboard");
jest.mock("react-hot-toast", () => ({ __esModule: true, default: { success: jest.fn(), error: jest.fn() } }));

import DetallePedidoVendedor from "./DetallePedidoVendedor";
import { cambiarEstadoPedido, obtenerPedido } from "./apiDashboard";

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
  sePuedeCancelar: true,
  motivoCancelacion: null,
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
