// Tests del listado de pedidos del vendedor.

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("./dashboardApi");
jest.mock("react-hot-toast", () => ({ __esModule: true, default: { success: jest.fn(), error: jest.fn() } }));

import toast from "react-hot-toast";
import SellerOrders from "./SellerOrders";
import { changeOrderStatus, getOrders } from "./dashboardApi";

const pedido = (id, extra = {}) => ({
  id,
  date: "2026-11-05T14:30:00Z",
  estado: "confirmed",
  paymentStatus: "approved",
  idPaymentMP: `55${id}`,
  total: 3000,
  customer: { displayName: `Cliente ${id}`, email: `cliente${id}@example.com` },
  items: [{ code: "FRE-001", displayName: "Pastillas Bosch", quantity: 2 }],
  nextStatus: "packing",
  canCancel: true,
  reasonCancellation: null,
  ...extra,
});

const response = (orders, extra = {}) => ({
  orders,
  total: orders.length,
  byStatus: { confirmed: 2, packing: 1, cancelled: 1 },
  forPrepare: 1,
  ...extra,
});

const row = (id) => screen.getByRole("button", { name: `Ver el detalle del pedido #${id}` }).closest("tr");
// Los botones de acción de una fila (sin el número, que abre el detalle).
const actions = (id) =>
  within(row(id))
    .queryAllByRole("button")
    .filter((button) => !button.getAttribute("aria-label")?.startsWith("Ver el detalle"));

beforeEach(() => {
  getOrders.mockResolvedValue(
    response([
      pedido(1),
      pedido(2, { paymentStatus: "pending", nextStatus: null, canCancel: false }),
    ])
  );
});

afterEach(() => jest.clearAllMocks());

describe("listado de pedidos", () => {
  it("loads more pages of 50 without asking for everything at once", async () => {
    const user = userEvent.setup();
    getOrders.mockImplementation(async ({ from = 0 }) =>
      response([pedido(from + 1), pedido(from + 2)], { total: 300 })
    );
    render(<SellerOrders />);
    await screen.findByText("Cliente 1");

    for (let vez = 0; vez < 5; vez++) {
      await user.click(screen.getByRole("button", { name: /^Mostrar .* más$/ }));
    }

    // Antes la quinta vez pedía 300 juntos y el backend respondía 422.
    expect(await screen.findByText("Cliente 251")).toBeInTheDocument();
    expect(getOrders.mock.calls.every(([filters]) => filters.limit === 50)).toBe(true);
  });

  it("shows when a cancelled order was refunded or is still waiting for it", async () => {
    getOrders.mockResolvedValue(
      response([
        pedido(1, { estado: "cancelled", refunded: "2026-11-07T10:00:00Z" }),
        pedido(2, { estado: "cancelled", faltaDevolver: true }),
      ])
    );
    render(<SellerOrders />);

    expect((await screen.findByText("Cliente 1")).closest("tr")).toHaveTextContent("Devuelto");
    expect(screen.getByText("Cliente 2").closest("tr")).toHaveTextContent("Falta devolver");
  });

  it("shows each order with its client, payment and status", async () => {
    render(<SellerOrders />);

    const paid = await screen.findByText("Cliente 1");
    const paidRow = paid.closest("tr");
    expect(paidRow).toHaveTextContent("cliente1@example.com");
    expect(paidRow).toHaveTextContent("$ 3.000");
    expect(paidRow).toHaveTextContent("Pagado");
    expect(paidRow).toHaveTextContent("Confirmado");
    expect(row(2)).toHaveTextContent("Esperando pago");
    expect(screen.getByText("Mostrando 2 de 2 pedidos.")).toBeInTheDocument();
  });

  it("filters by status with the count of each one", async () => {
    const user = userEvent.setup();
    render(<SellerOrders />);
    await screen.findByText("Cliente 1");

    expect(getOrders).toHaveBeenLastCalledWith({ estado: undefined, limit: 50 });
    const filter = screen.getByRole("group", { name: "Estado del pedido" });
    expect(within(filter).getByRole("button", { name: "Todos (4)" })).toBeInTheDocument();
    await user.click(within(filter).getByRole("button", { name: "Empaquetando (1)" }));

    expect(getOrders).toHaveBeenLastCalledWith({ estado: "packing", limit: 50 });
  });

  it("sorts by date, client or total, asking the backend from the first page", async () => {
    const user = userEvent.setup();
    getOrders.mockResolvedValue(response([pedido(1), pedido(2)], { total: 120 }));
    render(<SellerOrders initialStatus="confirmed" />);
    await screen.findByText("Cliente 1");
    await user.click(screen.getByRole("button", { name: "Mostrar 50 más" }));
    // La segunda página va de a 50 (desde el 50), no todo junto.
    await waitFor(() =>
      expect(getOrders).toHaveBeenLastCalledWith({ estado: "confirmed", limit: 50, from: 50 })
    );

    const sort = screen.getByRole("combobox", { name: "Ordenar por" });
    expect(sort).toHaveTextContent("Recomendado");
    await user.click(sort);
    await user.click(await screen.findByRole("option", { name: "Cliente (A–Z)" }));

    await waitFor(() =>
      expect(getOrders).toHaveBeenLastCalledWith({ estado: "confirmed", limit: 50, sort: "client_asc" })
    );
    expect(screen.getByRole("combobox", { name: "Ordenar por" })).toHaveTextContent("Cliente (A–Z)");
  });

  it("starts on the status that comes in the URL", async () => {
    render(<SellerOrders initialStatus="cancelled" />);
    await screen.findByText("Cliente 1");

    expect(getOrders).toHaveBeenLastCalledWith({ estado: "cancelled", limit: 50 });
  });

  it("opens the detail when the order number is clicked", async () => {
    const user = userEvent.setup();
    const onDetail = jest.fn();
    render(<SellerOrders onDetail={onDetail} />);
    await screen.findByText("Cliente 1");

    await user.click(screen.getByRole("button", { name: "Ver el detalle del pedido #2" }));

    expect(onDetail).toHaveBeenCalledWith(2);
  });

  it("opens the detail when anywhere on the row is clicked, but not from its buttons", async () => {
    const user = userEvent.setup();
    const onDetail = jest.fn();
    changeOrderStatus.mockResolvedValue(pedido(1, { estado: "packing", nextStatus: "shipped" }));
    render(<SellerOrders onDetail={onDetail} />);

    await user.click(await screen.findByText("Cliente 1"));
    expect(onDetail).toHaveBeenCalledWith(1);

    onDetail.mockClear();
    await user.click(screen.getByRole("button", { name: "Pasar el pedido #1 a Empaquetando" }));
    await user.click(screen.getByRole("button", { name: "Cancelar el pedido #1" }));
    expect(onDetail).not.toHaveBeenCalled();
  });

  it("says when there are no orders in a status", async () => {
    getOrders.mockResolvedValue(response([], { byStatus: {} }));
    render(<SellerOrders initialStatus="shipped" />);

    expect(await screen.findByText("No hay pedidos en «Enviado».")).toBeInTheDocument();
  });

  it("shows the reason of a cancelled order", async () => {
    getOrders.mockResolvedValue(
      response([pedido(3, { estado: "cancelled", nextStatus: null, canCancel: false, reasonCancellation: "Sin stock real" })])
    );
    render(<SellerOrders />);

    await screen.findByText("Cliente 3");
    expect(row(3)).toHaveTextContent("Cancelado");
    expect(row(3)).toHaveTextContent("Sin stock real");
    expect(actions(3)).toHaveLength(0);
  });
});

describe("botón para pasar al siguiente estado", () => {
  it("moves a paid order to the next status and reloads the list", async () => {
    const user = userEvent.setup();
    const onCambio = jest.fn();
    changeOrderStatus.mockResolvedValue(pedido(1, { estado: "packing", nextStatus: "shipped" }));
    render(<SellerOrders onCambio={onCambio} />);
    await screen.findByText("Cliente 1");
    const callsBefore = getOrders.mock.calls.length;

    await user.click(screen.getByRole("button", { name: "Pasar el pedido #1 a Empaquetando" }));

    expect(changeOrderStatus).toHaveBeenCalledWith(1, "packing");
    await waitFor(() => expect(getOrders.mock.calls.length).toBeGreaterThan(callsBefore));
    expect(onCambio).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Pedido #1: Empaquetando. Le avisamos al cliente por mail.");
  });

  it("does not let an unpaid order move forward or be cancelled", async () => {
    render(<SellerOrders />);
    await screen.findByText("Cliente 2");

    expect(actions(2)).toHaveLength(0);
    expect(row(2)).toHaveTextContent("Se prepara cuando se pague");
  });

  it("shows the error when the backend rejects the change", async () => {
    const user = userEvent.setup();
    changeOrderStatus.mockRejectedValue(
      Object.assign(new Error("Un pedido empaquetando solo puede pasar a enviado (o cancelarse)."), { status: 409 })
    );
    render(<SellerOrders />);
    await screen.findByText("Cliente 1");

    await user.click(screen.getByRole("button", { name: "Pasar el pedido #1 a Empaquetando" }));

    expect(await screen.findByText(/solo puede pasar a enviado/)).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe("cancelar un pedido", () => {
  it("asks for the reason before cancelling and warns that the payment is refunded", async () => {
    const user = userEvent.setup();
    changeOrderStatus.mockResolvedValue(
      pedido(1, { estado: "cancelled", nextStatus: null, canCancel: false, reasonCancellation: "Llegó roto" })
    );
    render(<SellerOrders />);
    await screen.findByText("Cliente 1");

    await user.click(screen.getByRole("button", { name: "Cancelar el pedido #1" }));
    const dialogo = screen.getByRole("dialog");
    expect(dialogo).toHaveTextContent("Se le devuelve el pago completo ($ 3.000) en Mercado Pago");

    await user.click(within(dialogo).getByRole("button", { name: "Cancelar pedido y devolver el pago" }));
    expect(within(dialogo).getByText(/Contá por qué se cancela/)).toBeInTheDocument();
    expect(changeOrderStatus).not.toHaveBeenCalled();

    await user.type(within(dialogo).getByLabelText("Motivo"), "  Llegó roto  ");
    await user.click(within(dialogo).getByRole("button", { name: "Cancelar pedido y devolver el pago" }));

    expect(changeOrderStatus).toHaveBeenCalledWith(1, "cancelled", "Llegó roto");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(toast.success).toHaveBeenCalledWith("Pedido #1: Cancelado. Le avisamos al cliente por mail.");
  });

  it("keeps the dialog open with the error if Mercado Pago could not refund", async () => {
    const user = userEvent.setup();
    changeOrderStatus.mockRejectedValue(new Error("No pudimos devolver el pago en Mercado Pago, así que el pedido no se canceló."));
    render(<SellerOrders />);
    await screen.findByText("Cliente 1");

    await user.click(screen.getByRole("button", { name: "Cancelar el pedido #1" }));
    const dialogo = screen.getByRole("dialog");
    await user.type(within(dialogo).getByLabelText("Motivo"), "Sin stock real");
    await user.click(within(dialogo).getByRole("button", { name: "Cancelar pedido y devolver el pago" }));

    expect(await within(dialogo).findByText(/No pudimos devolver el pago/)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
