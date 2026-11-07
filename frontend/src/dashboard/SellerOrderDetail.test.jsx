// Tests del detalle de un pedido del vendedor.

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation, useParams } from "react-router-dom";

jest.mock("./dashboardApi");
jest.mock("react-hot-toast", () => ({ __esModule: true, default: { success: jest.fn(), error: jest.fn() } }));

import SellerOrderDetail from "./SellerOrderDetail";
import toast from "react-hot-toast";
import { changeOrderStatus, updateOrder, getOrder } from "./dashboardApi";

const pedido = (extra = {}) => ({
  id: 42,
  date: "2026-11-05T14:30:00Z",
  estado: "confirmed",
  paymentStatus: "approved",
  total: 4300,
  paymentMethod: "Mercado Pago",
  idPaymentMP: "1234567890",
  customer: { displayName: "Ana Pérez", email: "ana@example.com", phone: "099123456" },
  shipping: {
    addressName: "Casa",
    street: "Av. Italia",
    number: "1234",
    apartamento: "301",
    city: "Montevideo",
    departamento: "Montevideo",
    codePostal: "11300",
  },
  items: [
    { idPart: 7, code: "FRE-001", displayName: "Pastillas Bosch", quantity: 2, price: 1500 },
    { idPart: 9, code: "FIL-002", displayName: "Filtro de aceite", quantity: 1, price: 1300 },
  ],
  nextStatus: "packing",
  previousStatus: null,
  canCancel: true,
  canEditShipping: true,
  reasonCancellation: null,
  internalNote: null,
  ...extra,
});

function Lugar() {
  const location = useLocation();
  const { id } = useParams();
  return <p>Estoy en {id ? `repuesto ${id}` : `dashboard${location.search}`}</p>;
}

function renderDetail(from) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/dashboard/pedidos/42", state: from !== undefined ? { from } : undefined }]}>
      <Routes>
        <Route path="/dashboard/pedidos/:id" element={<SellerOrderDetail sessionUser={{ email: "vendedor@example.com" }} />} />
        <Route path="/dashboard" element={<Lugar />} />
        <Route path="/dashboard/repuestos/:id" element={<Lugar />} />
      </Routes>
    </MemoryRouter>
  );
}

const panel = (title) => screen.getByRole("heading", { name: title }).closest("section, div.rounded-xl");

beforeEach(() => getOrder.mockResolvedValue(pedido()));
afterEach(() => jest.clearAllMocks());

it("shows the products with their prices and the total", async () => {
  renderDetail();

  expect(screen.getByRole("heading", { level: 1, name: "Pedido #42" })).toBeInTheDocument();
  const table = await screen.findByRole("table");
  const rows = within(table).getAllByRole("row");
  expect(rows[1]).toHaveTextContent("FRE-001");
  expect(rows[1]).toHaveTextContent("Pastillas Bosch");
  expect(rows[1]).toHaveTextContent("$ 3.000");
  expect(rows[2]).toHaveTextContent("Filtro de aceite");
  expect(screen.getByText("3 unidades para preparar. Precios del momento de la compra.")).toBeInTheDocument();
  expect(getOrder).toHaveBeenCalledWith("42");
});

it("shows where to ship it, who ordered it and how it was paid", async () => {
  renderDetail();
  await screen.findByRole("table");

  const shipping = panel("Envío");
  expect(shipping).toHaveTextContent("RecibeAna Pérez");
  expect(shipping).toHaveTextContent("Dirección («Casa»)");
  expect(shipping).toHaveTextContent("Av. Italia 1234, apto. 301");
  expect(shipping).toHaveTextContent("Montevideo, Montevideo · CP 11300");

  const customer = panel("Cliente");
  expect(within(customer).getByRole("link", { name: "ana@example.com" })).toHaveAttribute("href", "mailto:ana@example.com");
  expect(within(customer).getByRole("link", { name: "099123456" })).toHaveAttribute("href", "tel:099123456");

  const payment = panel("Pago");
  expect(payment).toHaveTextContent("Pagado");
  expect(payment).toHaveTextContent("Mercado Pago");
  expect(payment).toHaveTextContent("1234567890");
});

it("says when the client has no phone", async () => {
  getOrder.mockResolvedValue(pedido({ customer: { displayName: "Ana", email: "ana@example.com", phone: null } }));
  renderDetail();

  expect(await screen.findByText("No lo cargó")).toBeInTheDocument();
});

it("moves the order to the next status from the detail and reloads it", async () => {
  const user = userEvent.setup();
  changeOrderStatus.mockResolvedValue(pedido({ estado: "packing", nextStatus: "shipped" }));
  renderDetail();
  await screen.findByRole("table");
  getOrder.mockResolvedValue(pedido({ estado: "packing", nextStatus: "shipped" }));

  await user.click(screen.getByRole("button", { name: "Pasar el pedido #42 a Empaquetando" }));

  expect(changeOrderStatus).toHaveBeenCalledWith(42, "packing");
  expect(await screen.findByRole("button", { name: "Pasar el pedido #42 a Enviado" })).toBeInTheDocument();
  expect(getOrder).toHaveBeenCalledTimes(2);
});

it("cancels with a reason from the detail", async () => {
  const user = userEvent.setup();
  changeOrderStatus.mockResolvedValue(pedido({ estado: "cancelled", nextStatus: null, canCancel: false }));
  renderDetail();
  await screen.findByRole("table");

  await user.click(screen.getByRole("button", { name: "Cancelar el pedido #42" }));
  const dialogo = screen.getByRole("dialog");
  await user.type(within(dialogo).getByLabelText("Motivo"), "Llegó roto del proveedor");
  await user.click(within(dialogo).getByRole("button", { name: "Cancelar pedido y devolver el pago" }));

  expect(changeOrderStatus).toHaveBeenCalledWith(42, "cancelled", "Llegó roto del proveedor");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

it("shows why the store cancelled it and offers no actions", async () => {
  getOrder.mockResolvedValue(
    pedido({ estado: "cancelled", nextStatus: null, canCancel: false, reasonCancellation: "Sin stock real" })
  );
  renderDetail();

  expect(await screen.findByText(/Motivo: Sin stock real/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Pasar el pedido/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Cancelar el pedido/ })).not.toBeInTheDocument();
});

it("goes back to the list it came from, and to a part's detail", async () => {
  const user = userEvent.setup();
  renderDetail("?vista=orders&estado=packing");
  await screen.findByRole("table");

  await user.click(screen.getByRole("button", { name: "Pastillas Bosch" }));
  expect(screen.getByText("Estoy en repuesto 7")).toBeInTheDocument();
});

it("goes back to the order list", async () => {
  const user = userEvent.setup();
  renderDetail("?vista=orders&estado=packing");
  await screen.findByRole("table");

  await user.click(screen.getByRole("button", { name: "Volver a los pedidos" }));
  expect(screen.getByText("Estoy en dashboard?vista=orders&estado=packing")).toBeInTheDocument();
});

it("goes back to the dashboard summary when it came from there", async () => {
  const user = userEvent.setup();
  renderDetail("");
  await screen.findByRole("table");

  await user.click(screen.getByRole("button", { name: "Volver al dashboard" }));
  expect(screen.getByText("Estoy en dashboard")).toBeInTheDocument();
});

it("shows the error if the order does not exist", async () => {
  getOrder.mockRejectedValue(Object.assign(new Error("Pedido no encontrado."), { status: 404 }));
  renderDetail();

  expect(await screen.findByText("Pedido no encontrado.")).toBeInTheDocument();
});

describe("volver un paso atrás", () => {
  it("asks before going back and says the client gets no mail", async () => {
    const user = userEvent.setup();
    getOrder.mockResolvedValue(pedido({ estado: "shipped", nextStatus: "delivered", previousStatus: "packing" }));
    changeOrderStatus.mockResolvedValue(pedido({ estado: "packing", nextStatus: "shipped", previousStatus: "confirmed" }));
    renderDetail();
    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: "Volver el pedido #42 a Empaquetando" }));
    const dialogo = screen.getByRole("dialog", { name: "¿Volver el pedido #42 a Empaquetando?" });
    expect(dialogo).toHaveTextContent("Al cliente no le llega mail");

    // "No" no cambia nada.
    await user.click(within(dialogo).getByRole("button", { name: "No, dejarlo así" }));
    expect(changeOrderStatus).not.toHaveBeenCalled();

    getOrder.mockResolvedValue(pedido({ estado: "packing", nextStatus: "shipped", previousStatus: "confirmed" }));
    await user.click(screen.getByRole("button", { name: "Volver el pedido #42 a Empaquetando" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Volver a Empaquetando" }));

    expect(changeOrderStatus).toHaveBeenCalledWith(42, "packing");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(toast.success).toHaveBeenCalledWith("Pedido #42: volvió a Empaquetando. Al cliente no le llega mail.");
    expect(await screen.findByRole("button", { name: "Volver el pedido #42 a Confirmado" })).toBeInTheDocument();
  });

  it("does not offer going back when there is nowhere to go", async () => {
    renderDetail();
    await screen.findByRole("table");

    expect(screen.queryByRole("button", { name: /^Volver el pedido/ })).not.toBeInTheDocument();
  });
});

describe("editar la dirección de envío", () => {
  it("fixes the address with the same rules as the client's profile", async () => {
    const user = userEvent.setup();
    updateOrder.mockResolvedValue(pedido());
    renderDetail();
    await screen.findByRole("table");

    await user.click(within(panel("Envío")).getByRole("button", { name: "Editar la dirección de envío" }));
    const dialogo = screen.getByRole("dialog", { name: "Dirección de envío del pedido #42" });
    expect(within(dialogo).getByLabelText("Calle")).toHaveValue("Av. Italia");

    await user.clear(within(dialogo).getByLabelText("Calle"));
    await user.click(within(dialogo).getByRole("button", { name: "Guardar dirección" }));
    expect(within(dialogo).getByText("La calle no puede estar vacía.")).toBeInTheDocument();
    expect(updateOrder).not.toHaveBeenCalled();

    await user.type(within(dialogo).getByLabelText("Calle"), "  Bv. Artigas ");
    await user.selectOptions(within(dialogo).getByLabelText("Departamento"), "Canelones");
    await user.clear(within(dialogo).getByLabelText("Ciudad"));
    await user.type(within(dialogo).getByLabelText("Ciudad"), "Pando");
    await user.clear(within(dialogo).getByLabelText("Apto. (opcional)"));
    await user.click(within(dialogo).getByRole("button", { name: "Guardar dirección" }));

    expect(updateOrder).toHaveBeenCalledWith(42, {
      shipping: {
        addressName: "Casa",
        street: "Bv. Artigas",
        number: "1234",
        apartamento: null,
        city: "Pando",
        departamento: "Canelones",
        codePostal: "11300",
      },
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(toast.success).toHaveBeenCalledWith("Dirección de envío actualizada.");
    expect(getOrder).toHaveBeenCalledTimes(2);
  });

  it("does not let the address change once the order was shipped", async () => {
    getOrder.mockResolvedValue(pedido({ estado: "shipped", canEditShipping: false }));
    renderDetail();
    await screen.findByRole("table");

    expect(within(panel("Envío")).queryByRole("button", { name: /Editar/ })).not.toBeInTheDocument();
  });
});

describe("nota interna", () => {
  it("saves a note that only the store sees", async () => {
    const user = userEvent.setup();
    updateOrder.mockResolvedValue(pedido({ internalNote: "Entregar de tarde." }));
    renderDetail();
    await screen.findByRole("table");

    const note = within(panel("Nota interna"));
    expect(panel("Nota interna")).toHaveTextContent("Solo la ve la tienda");
    const save = note.getByRole("button", { name: "Guardar nota" });
    expect(save).toBeDisabled();

    getOrder.mockResolvedValue(pedido({ internalNote: "Entregar de tarde." }));
    await user.type(note.getByRole("textbox", { name: "Nota interna" }), "Entregar de tarde.");
    await user.click(save);

    expect(updateOrder).toHaveBeenCalledWith(42, { internalNote: "Entregar de tarde." });
    expect(toast.success).toHaveBeenCalledWith("Nota guardada.");
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Nota interna" })).toHaveValue("Entregar de tarde."));
    expect(within(panel("Nota interna")).getByRole("button", { name: "Guardar nota" })).toBeDisabled();
  });

  it("shows the saved note, clears it, and shows the error if it could not be saved", async () => {
    const user = userEvent.setup();
    getOrder.mockResolvedValue(pedido({ internalNote: "Llamar antes." }));
    updateOrder.mockRejectedValue(new Error("No pudimos guardar los cambios del pedido."));
    renderDetail();

    expect(await screen.findByRole("textbox", { name: "Nota interna" })).toHaveValue("Llamar antes.");
    await user.clear(screen.getByRole("textbox", { name: "Nota interna" }));
    await user.click(screen.getByRole("button", { name: "Guardar nota" }));

    expect(updateOrder).toHaveBeenCalledWith(42, { internalNote: "" });
    expect(await screen.findByText("No pudimos guardar los cambios del pedido.")).toBeInTheDocument();
  });
});

it("says when the payment was refunded, and warns when it is still pending", async () => {
  getOrder.mockResolvedValue(pedido({ estado: "cancelled", refunded: "2026-11-07T10:00:00Z" }));
  const { unmount } = renderDetail();
  expect(await screen.findByText(/^Devuelto el /)).toBeInTheDocument();
  unmount();

  getOrder.mockResolvedValue(pedido({ estado: "cancelled", faltaDevolver: true }));
  renderDetail();
  expect(await screen.findByText(/Falta devolver el pago/)).toBeInTheDocument();
});

it("says to refund by hand when the payment did not go through Mercado Pago", async () => {
  getOrder.mockResolvedValue(pedido({ estado: "cancelled", idPaymentMP: null, faltaDevolver: true }));
  renderDetail();

  expect(await screen.findByText("Este pago no pasó por Mercado Pago: devolvé el dinero a mano.")).toBeInTheDocument();
});
