// Tests del listado de pedidos del vendedor.

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("./apiDashboard");
jest.mock("react-hot-toast", () => ({ __esModule: true, default: { success: jest.fn(), error: jest.fn() } }));

import toast from "react-hot-toast";
import PedidosVendedor from "./PedidosVendedor";
import { cambiarEstadoPedido, obtenerPedidos } from "./apiDashboard";

const pedido = (id, extra = {}) => ({
  id,
  fecha: "2026-11-05T14:30:00Z",
  estado: "confirmed",
  estadoPago: "approved",
  idPagoMP: `55${id}`,
  total: 3000,
  cliente: { nombre: `Cliente ${id}`, email: `cliente${id}@example.com` },
  items: [{ codigo: "FRE-001", nombre: "Pastillas Bosch", cantidad: 2 }],
  siguienteEstado: "packing",
  sePuedeCancelar: true,
  motivoCancelacion: null,
  ...extra,
});

const respuesta = (pedidos, extra = {}) => ({
  pedidos,
  total: pedidos.length,
  porEstado: { confirmed: 2, packing: 1, cancelled: 1 },
  paraPreparar: 1,
  ...extra,
});

const fila = (id) => screen.getByRole("button", { name: `Ver el detalle del pedido #${id}` }).closest("tr");
// Los botones de acción de una fila (sin el número, que abre el detalle).
const acciones = (id) =>
  within(fila(id))
    .queryAllByRole("button")
    .filter((boton) => !boton.getAttribute("aria-label")?.startsWith("Ver el detalle"));

beforeEach(() => {
  obtenerPedidos.mockResolvedValue(
    respuesta([
      pedido(1),
      pedido(2, { estadoPago: "pending", siguienteEstado: null, sePuedeCancelar: false }),
    ])
  );
});

afterEach(() => jest.clearAllMocks());

describe("listado de pedidos", () => {
  it("loads more pages of 50 without asking for everything at once", async () => {
    const user = userEvent.setup();
    obtenerPedidos.mockImplementation(async ({ desde = 0 }) =>
      respuesta([pedido(desde + 1), pedido(desde + 2)], { total: 300 })
    );
    render(<PedidosVendedor />);
    await screen.findByText("Cliente 1");

    for (let vez = 0; vez < 5; vez++) {
      await user.click(screen.getByRole("button", { name: /^Mostrar .* más$/ }));
    }

    // Antes la quinta vez pedía 300 juntos y el backend respondía 422.
    expect(await screen.findByText("Cliente 251")).toBeInTheDocument();
    expect(obtenerPedidos.mock.calls.every(([filtros]) => filtros.limite === 50)).toBe(true);
  });

  it("shows when a cancelled order was refunded or is still waiting for it", async () => {
    obtenerPedidos.mockResolvedValue(
      respuesta([
        pedido(1, { estado: "cancelled", devueltoEl: "2026-11-07T10:00:00Z" }),
        pedido(2, { estado: "cancelled", faltaDevolver: true }),
      ])
    );
    render(<PedidosVendedor />);

    expect((await screen.findByText("Cliente 1")).closest("tr")).toHaveTextContent("Devuelto");
    expect(screen.getByText("Cliente 2").closest("tr")).toHaveTextContent("Falta devolver");
  });

  it("shows each order with its client, payment and status", async () => {
    render(<PedidosVendedor />);

    const pagado = await screen.findByText("Cliente 1");
    const filaPagado = pagado.closest("tr");
    expect(filaPagado).toHaveTextContent("cliente1@example.com");
    expect(filaPagado).toHaveTextContent("$ 3.000");
    expect(filaPagado).toHaveTextContent("Pagado");
    expect(filaPagado).toHaveTextContent("Confirmado");
    expect(fila(2)).toHaveTextContent("Esperando pago");
    expect(screen.getByText("Mostrando 2 de 2 pedidos.")).toBeInTheDocument();
  });

  it("filters by status with the count of each one", async () => {
    const user = userEvent.setup();
    render(<PedidosVendedor />);
    await screen.findByText("Cliente 1");

    expect(obtenerPedidos).toHaveBeenLastCalledWith({ estado: undefined, limite: 50 });
    const filtro = screen.getByRole("group", { name: "Estado del pedido" });
    expect(within(filtro).getByRole("button", { name: "Todos (4)" })).toBeInTheDocument();
    await user.click(within(filtro).getByRole("button", { name: "Empaquetando (1)" }));

    expect(obtenerPedidos).toHaveBeenLastCalledWith({ estado: "packing", limite: 50 });
  });

  it("sorts by date, client or total, asking the backend from the first page", async () => {
    const user = userEvent.setup();
    obtenerPedidos.mockResolvedValue(respuesta([pedido(1), pedido(2)], { total: 120 }));
    render(<PedidosVendedor estadoInicial="confirmed" />);
    await screen.findByText("Cliente 1");
    await user.click(screen.getByRole("button", { name: "Mostrar 50 más" }));
    // La segunda página va de a 50 (desde el 50), no todo junto.
    await waitFor(() =>
      expect(obtenerPedidos).toHaveBeenLastCalledWith({ estado: "confirmed", limite: 50, desde: 50 })
    );

    const orden = screen.getByRole("combobox", { name: "Ordenar por" });
    expect(orden).toHaveTextContent("Recomendado");
    await user.click(orden);
    await user.click(await screen.findByRole("option", { name: "Cliente (A–Z)" }));

    await waitFor(() =>
      expect(obtenerPedidos).toHaveBeenLastCalledWith({ estado: "confirmed", limite: 50, orden: "client_asc" })
    );
    expect(screen.getByRole("combobox", { name: "Ordenar por" })).toHaveTextContent("Cliente (A–Z)");
  });

  it("starts on the status that comes in the URL", async () => {
    render(<PedidosVendedor estadoInicial="cancelled" />);
    await screen.findByText("Cliente 1");

    expect(obtenerPedidos).toHaveBeenLastCalledWith({ estado: "cancelled", limite: 50 });
  });

  it("opens the detail when the order number is clicked", async () => {
    const user = userEvent.setup();
    const onDetalle = jest.fn();
    render(<PedidosVendedor onDetalle={onDetalle} />);
    await screen.findByText("Cliente 1");

    await user.click(screen.getByRole("button", { name: "Ver el detalle del pedido #2" }));

    expect(onDetalle).toHaveBeenCalledWith(2);
  });

  it("opens the detail when anywhere on the row is clicked, but not from its buttons", async () => {
    const user = userEvent.setup();
    const onDetalle = jest.fn();
    cambiarEstadoPedido.mockResolvedValue(pedido(1, { estado: "packing", siguienteEstado: "shipped" }));
    render(<PedidosVendedor onDetalle={onDetalle} />);

    await user.click(await screen.findByText("Cliente 1"));
    expect(onDetalle).toHaveBeenCalledWith(1);

    onDetalle.mockClear();
    await user.click(screen.getByRole("button", { name: "Pasar el pedido #1 a Empaquetando" }));
    await user.click(screen.getByRole("button", { name: "Cancelar el pedido #1" }));
    expect(onDetalle).not.toHaveBeenCalled();
  });

  it("says when there are no orders in a status", async () => {
    obtenerPedidos.mockResolvedValue(respuesta([], { porEstado: {} }));
    render(<PedidosVendedor estadoInicial="shipped" />);

    expect(await screen.findByText("No hay pedidos en «Enviado».")).toBeInTheDocument();
  });

  it("shows the reason of a cancelled order", async () => {
    obtenerPedidos.mockResolvedValue(
      respuesta([pedido(3, { estado: "cancelled", siguienteEstado: null, sePuedeCancelar: false, motivoCancelacion: "Sin stock real" })])
    );
    render(<PedidosVendedor />);

    await screen.findByText("Cliente 3");
    expect(fila(3)).toHaveTextContent("Cancelado");
    expect(fila(3)).toHaveTextContent("Sin stock real");
    expect(acciones(3)).toHaveLength(0);
  });
});

describe("botón para pasar al siguiente estado", () => {
  it("moves a paid order to the next status and reloads the list", async () => {
    const user = userEvent.setup();
    const onCambio = jest.fn();
    cambiarEstadoPedido.mockResolvedValue(pedido(1, { estado: "packing", siguienteEstado: "shipped" }));
    render(<PedidosVendedor onCambio={onCambio} />);
    await screen.findByText("Cliente 1");
    const llamadasAntes = obtenerPedidos.mock.calls.length;

    await user.click(screen.getByRole("button", { name: "Pasar el pedido #1 a Empaquetando" }));

    expect(cambiarEstadoPedido).toHaveBeenCalledWith(1, "packing");
    await waitFor(() => expect(obtenerPedidos.mock.calls.length).toBeGreaterThan(llamadasAntes));
    expect(onCambio).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Pedido #1: Empaquetando. Le avisamos al cliente por mail.");
  });

  it("does not let an unpaid order move forward or be cancelled", async () => {
    render(<PedidosVendedor />);
    await screen.findByText("Cliente 2");

    expect(acciones(2)).toHaveLength(0);
    expect(fila(2)).toHaveTextContent("Se prepara cuando se pague");
  });

  it("shows the error when the backend rejects the change", async () => {
    const user = userEvent.setup();
    cambiarEstadoPedido.mockRejectedValue(
      Object.assign(new Error("Un pedido empaquetando solo puede pasar a enviado (o cancelarse)."), { status: 409 })
    );
    render(<PedidosVendedor />);
    await screen.findByText("Cliente 1");

    await user.click(screen.getByRole("button", { name: "Pasar el pedido #1 a Empaquetando" }));

    expect(await screen.findByText(/solo puede pasar a enviado/)).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe("cancelar un pedido", () => {
  it("asks for the reason before cancelling and warns that the payment is refunded", async () => {
    const user = userEvent.setup();
    cambiarEstadoPedido.mockResolvedValue(
      pedido(1, { estado: "cancelled", siguienteEstado: null, sePuedeCancelar: false, motivoCancelacion: "Llegó roto" })
    );
    render(<PedidosVendedor />);
    await screen.findByText("Cliente 1");

    await user.click(screen.getByRole("button", { name: "Cancelar el pedido #1" }));
    const dialogo = screen.getByRole("dialog");
    expect(dialogo).toHaveTextContent("Se le devuelve el pago completo ($ 3.000) en Mercado Pago");

    await user.click(within(dialogo).getByRole("button", { name: "Cancelar pedido y devolver el pago" }));
    expect(within(dialogo).getByText(/Contá por qué se cancela/)).toBeInTheDocument();
    expect(cambiarEstadoPedido).not.toHaveBeenCalled();

    await user.type(within(dialogo).getByLabelText("Motivo"), "  Llegó roto  ");
    await user.click(within(dialogo).getByRole("button", { name: "Cancelar pedido y devolver el pago" }));

    expect(cambiarEstadoPedido).toHaveBeenCalledWith(1, "cancelled", "Llegó roto");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(toast.success).toHaveBeenCalledWith("Pedido #1: Cancelado. Le avisamos al cliente por mail.");
  });

  it("keeps the dialog open with the error if Mercado Pago could not refund", async () => {
    const user = userEvent.setup();
    cambiarEstadoPedido.mockRejectedValue(new Error("No pudimos devolver el pago en Mercado Pago, así que el pedido no se canceló."));
    render(<PedidosVendedor />);
    await screen.findByText("Cliente 1");

    await user.click(screen.getByRole("button", { name: "Cancelar el pedido #1" }));
    const dialogo = screen.getByRole("dialog");
    await user.type(within(dialogo).getByLabelText("Motivo"), "Sin stock real");
    await user.click(within(dialogo).getByRole("button", { name: "Cancelar pedido y devolver el pago" }));

    expect(await within(dialogo).findByText(/No pudimos devolver el pago/)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
