// Tests del historial de compras.

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";

import OrderDetail from "./OrderDetail";
import PurchaseHistory from "./PurchaseHistory";
import { confirmReceipt, createPaymentLink, getPurchaseDetail, getPurchaseHistory } from "./api";
import { goTo } from "./redirect";

jest.mock("./api", () => ({
  confirmReceipt: jest.fn(),
  createPaymentLink: jest.fn(),
  getPurchaseDetail: jest.fn(),
  getPurchaseHistory: jest.fn(),
}));

// jsdom no navega a otras páginas: se registra adónde se habría ido.
jest.mock("./redirect", () => ({ goTo: jest.fn() }));

jest.mock("./Navbar", () => () => <nav aria-label="Navegación" />);

// «Mis compras › Anteriores»: solo las compras que ya terminaron.
const purchases = [
  { id: 42, date: "2026-01-03T00:00:00.000Z", estado: "delivered", total: 3600, items: [] },
  { id: 17, date: "2026-01-02T00:00:00.000Z", estado: "cancelled", reasonCancellation: "store", total: 2400, items: [] },
  { id: 9, date: "2026-01-01T00:00:00.000Z", estado: "delivered", total: 1000, items: [] },
];

function renderHistory() {
  return render(
    <MemoryRouter>
      <PurchaseHistory onProfile={jest.fn()} />
    </MemoryRouter>
  );
}

const listPurchases = () => screen.findByRole("list", { name: "Compras anteriores" });

beforeEach(() => {
  jest.clearAllMocks();
});

describe("HistorialCompras (Mis compras › Anteriores)", () => {
  test("renders the ordered purchase list with date, ID, and total", async () => {
    getPurchaseHistory.mockResolvedValue(purchases);

    renderHistory();

    const orders = within(await listPurchases()).getAllByRole("listitem");

    expect(orders).toHaveLength(3);
    expect(within(orders[0]).getByText("#42")).toBeInTheDocument();
    expect(within(orders[1]).getByText("#17")).toBeInTheDocument();
    expect(within(orders[2]).getByText("#9")).toBeInTheDocument();
    const formattedDate = /\d{1,2}\/\d{1,2}\/\d{4}/;
    expect(within(orders[0]).getByText(formattedDate)).toBeInTheDocument();
    expect(within(orders[0]).getByText(/3[.]600|3,600/)).toBeInTheDocument();
    expect(within(orders[1]).getByText(/2[.]400|2,400/)).toBeInTheDocument();
    expect(within(orders[2]).getByText(/1[.]000|1,000/)).toBeInTheDocument();
    expect(getPurchaseHistory).toHaveBeenCalledTimes(1);
  });

  test("leaves out the orders in progress: they are in the other tab", async () => {
    getPurchaseHistory.mockResolvedValue([
      ...purchases,
      { id: 50, date: "2026-01-04T00:00:00.000Z", estado: "shipped", paymentStatus: "approved", total: 500, items: [] },
      { id: 51, date: "2026-01-04T00:00:00.000Z", estado: "confirmed", paymentStatus: "pending", total: 500, items: [] },
    ]);

    renderHistory();

    const list = await listPurchases();
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(within(list).queryByText("#50")).not.toBeInTheDocument();
    expect(within(list).queryByText("#51")).not.toBeInTheDocument();
    // Las dos pestañas de Mis compras.
    const pestanas = screen.getByRole("navigation", { name: "Mis compras" });
    expect(within(pestanas).getByRole("button", { name: "Anteriores" })).toHaveAttribute("aria-current", "page");
    expect(within(pestanas).getByRole("button", { name: /En curso/ })).toBeInTheDocument();
  });

  test("shows the status of each purchase and why one was cancelled", async () => {
    getPurchaseHistory.mockResolvedValue(purchases);

    renderHistory();

    const orders = within(await listPurchases()).getAllByRole("listitem");

    expect(within(orders[0]).getByText("Entregado")).toBeInTheDocument();
    expect(within(orders[1]).getByText("Cancelado")).toBeInTheDocument();
    expect(within(orders[1]).getByText("Lo canceló la tienda")).toBeInTheDocument();
  });

  test("loads and displays the selected purchase details", async () => {
    const user = userEvent.setup();
    getPurchaseHistory.mockResolvedValue(purchases);
    getPurchaseDetail.mockResolvedValue({
      ...purchases[0],
      shippingAddress: {
        street: "Av. Italia",
        number: "1234",
        apartamento: "",
        city: "Montevideo",
        departamento: "Montevideo",
      },
      paymentMethod: "Visa •••• 1234",
      items: [{ partId: 1, displayName: "Pastillas de freno", quantity: 2, price: 900 }],
    });

    renderHistory();
    await user.click(await screen.findByRole("button", { name: "Ver detalle del pedido #42" }));

    expect(getPurchaseDetail).toHaveBeenCalledWith(42);
    expect(await screen.findByRole("heading", { name: /Pedido #/ })).toBeInTheDocument();
    expect(screen.getByText("Pastillas de freno")).toBeInTheDocument();
    expect(screen.getByText(/Cantidad: 2 · .*900 c\/u/)).toBeInTheDocument();
    // El subtotal del producto: 2 × 900.
    expect(screen.getByText(/1[.]800|1,800/)).toBeInTheDocument();
    expect(screen.getByText("Av. Italia 1234, Montevideo, Montevideo")).toBeInTheDocument();
    expect(screen.getByText("Visa •••• 1234")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pagar el pedido/ })).not.toBeInTheDocument();
  });

  test("an order cancelled for not being paid in time says so and cannot be paid", async () => {
    const user = userEvent.setup();
    const expired = { ...purchases[0], estado: "cancelled", paymentStatus: "pending", paymentMethod: "Mercado Pago" };
    getPurchaseHistory.mockResolvedValue([expired]);
    getPurchaseDetail.mockResolvedValue(expired);

    renderHistory();

    const list = await listPurchases();
    expect(within(list).getByText("Cancelado")).toBeInTheDocument();
    expect(within(list).getByText("No se completó el pago a tiempo")).toBeInTheDocument();
    expect(within(list).queryByRole("button", { name: /Pagar el pedido/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ver detalle del pedido #42" }));

    expect(await screen.findByText("Este pedido se canceló porque no se completó el pago a tiempo")).toBeInTheDocument();
    expect(screen.getByText("Mercado Pago (no se completó)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pagar el pedido/ })).not.toBeInTheDocument();
  });

  test("shows the products of each order in the list", async () => {
    getPurchaseHistory.mockResolvedValue([
      {
        ...purchases[0],
        items: [
          { partId: 1, displayName: "Bujía NGK 1.4 8V", quantity: 1, price: 650 },
          { partId: 2, displayName: "Filtro de aire Mann-Filter", quantity: 1, price: 940 },
        ],
      },
    ]);

    renderHistory();

    expect(await screen.findByText("Bujía NGK 1.4 8V y 1 producto más")).toBeInTheDocument();
  });

  test("says there are no finished purchases yet (also when all are in progress)", async () => {
    getPurchaseHistory.mockResolvedValue([{ id: 50, estado: "shipped", paymentStatus: "approved", total: 500, items: [] }]);

    renderHistory();

    expect(await screen.findByText("Todavía no tenés compras terminadas.")).toBeInTheDocument();
    expect(screen.getByText("Cuando te llegue un pedido, lo vas a ver acá.")).toBeInTheDocument();
  });

  test("shows an API error instead of the empty message", async () => {
    getPurchaseHistory.mockRejectedValue(new Error("No pudimos cargar tu historial de compras."));

    renderHistory();

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos cargar tu historial de compras.");
    expect(screen.queryByText("Todavía no tenés compras terminadas.")).not.toBeInTheDocument();
  });

  test("keeps the purchase list visible when a detail fails to load", async () => {
    getPurchaseHistory.mockResolvedValue(purchases);
    getPurchaseDetail.mockRejectedValue(new Error("No pudimos cargar el detalle de la compra."));

    renderHistory();
    await userEvent.click(await screen.findByRole("button", { name: "Ver detalle del pedido #42" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos cargar el detalle de la compra.");
    expect(screen.getByRole("list", { name: "Compras anteriores" })).toBeInTheDocument();
  });
});

// El detalle de un pedido (el mismo en las dos pestañas de Mis compras):
// pagar, la línea de tiempo y «Ya lo recibí».
describe("DetallePedido", () => {
  const confirmed = { id: 42, date: "2026-01-03T00:00:00.000Z", estado: "confirmed", total: 3600, items: [] };
  const shipped = {
    id: 17,
    date: "2026-01-02T00:00:00.000Z",
    estado: "shipped",
    total: 2400,
    items: [],
    paymentMethod: "Mercado Pago",
    paymentStatus: "approved",
    tracking: [
      { estado: "confirmed", date: "2026-01-02T10:00:00.000Z" },
      { estado: "packing", date: "2026-01-02T15:00:00.000Z" },
      { estado: "shipped", date: "2026-01-03T09:30:00.000Z" },
    ],
  };

  // Como la página que lo usa: después de «Ya lo recibí» le pasa el pedido entregado.
  function Detail({ initial }) {
    const [purchase, setPurchase] = useState(initial);
    return <OrderDetail purchase={purchase} textGoBack="← Volver" onGoBack={() => {}} onUpdated={setPurchase} />;
  }

  function renderDetail(purchase) {
    const user = userEvent.setup();
    render(<Detail initial={purchase} />);
    return user;
  }

  test.each([
    ["pending", "pendiente"],
    ["rejected", "rechazado"],
  ])("an order with a %s payment can be paid", async (paymentStatus, texto) => {
    createPaymentLink.mockResolvedValue("https://mercadopago.test/pagar");
    const user = renderDetail({ ...confirmed, paymentMethod: "Mercado Pago", paymentStatus });

    expect(screen.getByText(`Mercado Pago (${texto})`)).toBeInTheDocument();
    expect(screen.getByText("Pendiente de pago")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pagar el pedido #42 con Mercado Pago" }));

    expect(createPaymentLink).toHaveBeenCalledWith(42);
    expect(goTo).toHaveBeenCalledWith("https://mercadopago.test/pagar");
  });

  test("a paid order has no pay button", () => {
    renderDetail({ ...confirmed, paymentMethod: "Mercado Pago", paymentStatus: "approved" });

    expect(screen.getByText("Mercado Pago")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pagar el pedido/ })).not.toBeInTheDocument();
  });

  test("shows the error when Mercado Pago cannot be opened", async () => {
    createPaymentLink.mockRejectedValue(new Error("No pudimos conectar con Mercado Pago. Probá de nuevo en un rato."));
    const user = renderDetail({ ...confirmed, paymentMethod: "Mercado Pago", paymentStatus: "pending" });

    await user.click(screen.getByRole("button", { name: "Pagar el pedido #42 con Mercado Pago" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos conectar con Mercado Pago");
    expect(goTo).not.toHaveBeenCalled();
  });

  test("shows the timeline with the date of each stage and the ones still pending", () => {
    renderDetail(shipped);

    const steps = within(screen.getByRole("list", { name: "Seguimiento del pedido" })).getAllByRole("listitem");
    expect(steps.map((step) => step.querySelector("p").textContent)).toEqual([
      "Confirmado",
      "Empaquetando",
      "Enviado",
      "Entregado",
    ]);
    const date = /\d{2}\/\d{2}\/\d{4}/;
    expect(within(steps[0]).getByText(date)).toBeInTheDocument();
    expect(within(steps[2]).getByText(date)).toBeInTheDocument();
    expect(within(steps[3]).getByText("Pendiente")).toBeInTheDocument();
    expect(steps[2]).toHaveAttribute("aria-current", "step");
  });

  test("an unpaid order shows no timeline", () => {
    renderDetail({ ...confirmed, paymentStatus: "pending", tracking: [{ estado: "confirmed", date: null }] });

    expect(screen.getByRole("button", { name: /Pagar el pedido/ })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Seguimiento del pedido" })).not.toBeInTheDocument();
  });

  test("'Ya lo recibí' marks a shipped order as delivered", async () => {
    const delivered = {
      ...shipped,
      estado: "delivered",
      tracking: [...shipped.tracking, { estado: "delivered", date: "2026-01-05T12:00:00.000Z" }],
    };
    confirmReceipt.mockResolvedValue(delivered);
    const user = renderDetail(shipped);

    await user.click(screen.getByRole("button", { name: "Ya lo recibí" }));

    expect(confirmReceipt).toHaveBeenCalledWith(17);
    expect(await screen.findByRole("status")).toHaveTextContent("Marcamos el pedido como entregado");
    expect(screen.queryByRole("button", { name: "Ya lo recibí" })).not.toBeInTheDocument();
    const steps = within(screen.getByRole("list", { name: "Seguimiento del pedido" })).getAllByRole("listitem");
    expect(within(steps[3]).queryByText("Pendiente")).not.toBeInTheDocument();
  });

  test("shows the error if the arrival can't be confirmed", async () => {
    confirmReceipt.mockRejectedValue(new Error("Solo se puede confirmar la llegada de un pedido enviado."));
    const user = renderDetail(shipped);

    await user.click(screen.getByRole("button", { name: "Ya lo recibí" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Solo se puede confirmar la llegada");
    expect(screen.getByRole("button", { name: "Ya lo recibí" })).toBeEnabled();
  });

  test.each(["confirmed", "packing", "delivered"])("a %s order has no 'Ya lo recibí' button", (estado) => {
    renderDetail({ ...shipped, estado });

    expect(screen.getByRole("list", { name: "Seguimiento del pedido" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ya lo recibí" })).not.toBeInTheDocument();
  });

  test("an order cancelled by the store says so", () => {
    renderDetail({
      ...shipped,
      estado: "cancelled",
      reasonCancellation: "store",
      tracking: [...shipped.tracking.slice(0, 2), { estado: "cancelled", date: "2026-01-02T18:00:00.000Z" }],
    });

    expect(screen.getByText("La tienda canceló este pedido")).toBeInTheDocument();
    expect(screen.queryByText(/no se completó el pago a tiempo/)).not.toBeInTheDocument();
  });

  test("an expired order says it wasn't paid in time", () => {
    renderDetail({ ...confirmed, estado: "cancelled", paymentStatus: "pending", reasonCancellation: "expired" });

    expect(screen.getByText(/no se completó el pago a tiempo/)).toBeInTheDocument();
    expect(screen.queryByText("La tienda canceló este pedido")).not.toBeInTheDocument();
  });
});
