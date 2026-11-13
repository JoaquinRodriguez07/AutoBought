// Tests de los pedidos en curso.

import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import MyOrders from "./MyOrders";
import { confirmReceipt, createPaymentLink, getPurchaseDetail, getPurchaseHistory } from "./api";
import { goTo } from "./redirect";
import { isActive, statusPhrase, trackingSteps } from "./orderTracking";
import { AUTO_REFRESH_MS } from "./useAutoRefresh";

jest.mock("./api", () => ({
  confirmReceipt: jest.fn(),
  createPaymentLink: jest.fn(),
  getPurchaseDetail: jest.fn(),
  getPurchaseHistory: jest.fn(),
}));

// jsdom no navega a otras páginas: se registra adónde se habría ido.
jest.mock("./redirect", () => ({ goTo: jest.fn() }));

jest.mock("./Navbar", () => () => <nav aria-label="Navegación" />);

const items = [{ partId: 1, displayName: "Pastillas de freno", code: "BRK-1", quantity: 2, price: 900 }];

const inWay = {
  id: 17,
  date: "2026-01-02T00:00:00.000Z",
  estado: "shipped",
  paymentStatus: "approved",
  paymentMethod: "Mercado Pago",
  total: 1800,
  items,
  tracking: [
    { estado: "confirmed", date: "2026-01-02T10:00:00.000Z" },
    { estado: "packing", date: "2026-01-02T15:00:00.000Z" },
    { estado: "shipped", date: "2026-01-03T09:30:00.000Z" },
  ],
};

const withoutPay = {
  id: 42,
  date: "2026-01-03T00:00:00.000Z",
  estado: "confirmed",
  paymentStatus: "pending",
  expiresPayment: "2026-01-03T00:15:00.000Z",
  paymentMethod: "Mercado Pago",
  total: 3600,
  items: [],
};

const delivered = { id: 9, date: "2026-01-01T00:00:00.000Z", estado: "delivered", paymentStatus: "approved", total: 1000, items: [] };
const expired = { id: 5, date: "2025-12-30T00:00:00.000Z", estado: "cancelled", paymentStatus: "pending", total: 700, items: [] };

function RouteEntry() {
  return <p data-testid="route">{useLocation().pathname}</p>;
}

function renderOrders(shippingAddress = "/pedidos") {
  const props = { onHome: jest.fn(), onCatalogo: jest.fn(), onHistory: jest.fn() };
  render(
    <MemoryRouter initialEntries={[shippingAddress]}>
      <Routes>
        <Route path="/pedidos" element={<MyOrders {...props} />} />
        <Route path="/pedidos/:id" element={<MyOrders {...props} />} />
      </Routes>
      <RouteEntry />
    </MemoryRouter>
  );
  return props;
}

const inProgress = () => screen.findByRole("list", { name: "Pedidos en curso" });

beforeEach(() => {
  jest.clearAllMocks();
  getPurchaseHistory.mockResolvedValue([withoutPay, inWay, delivered, expired]);
});

describe("MisPedidos: los pedidos en curso", () => {
  test("shows only the orders that haven't finished, each with what's happening now", async () => {
    renderOrders();

    const list = await inProgress();
    expect(within(list).getByText("Falta pagar")).toBeInTheDocument();
    expect(within(list).getByText("Está en camino")).toBeInTheDocument();
    expect(within(list).getByText("Pedido #42")).toBeInTheDocument();
    expect(within(list).getByText("Pedido #17")).toBeInTheDocument();
    // Los terminados están en el historial, no acá.
    expect(screen.queryByText(/#9/)).not.toBeInTheDocument();
    expect(screen.queryByText(/#5/)).not.toBeInTheDocument();
  });

  test("an order on its way shows its progress bar and an unpaid one its deadline", async () => {
    renderOrders();

    expect(await screen.findByRole("list", { name: "Progreso del pedido #17: 3 de 4 etapas" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: /Progreso del pedido #42/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Pagalo antes de/)).toBeInTheDocument();
  });

  test("the 'Anteriores' tab opens the finished purchases", async () => {
    const user = userEvent.setup();
    renderOrders();
    await inProgress();

    const pestanas = screen.getByRole("navigation", { name: "Mis compras" });
    expect(within(pestanas).getByRole("button", { name: /En curso/ })).toHaveAttribute("aria-current", "page");
    await user.click(within(pestanas).getByRole("button", { name: "Anteriores" }));

    expect(screen.getByTestId("route")).toHaveTextContent(/^\/historial$/);
  });

  test("without orders in progress, says so and leads to the catalog", async () => {
    const user = userEvent.setup();
    getPurchaseHistory.mockResolvedValue([delivered, expired]);
    const props = renderOrders();

    expect(await screen.findByText("No tenés pedidos en curso.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ver repuestos" }));
    expect(props.onCatalogo).toHaveBeenCalled();
  });

  test("shows the error if the orders can't be loaded", async () => {
    getPurchaseHistory.mockRejectedValue(new Error("No pudimos cargar tus pedidos."));
    renderOrders();

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos cargar tus pedidos.");
    expect(screen.queryByText("No tenés pedidos en curso.")).not.toBeInTheDocument();
  });

  test("'Ya lo recibí' delivers the order and takes it off the list", async () => {
    const user = userEvent.setup();
    confirmReceipt.mockResolvedValue({ ...inWay, estado: "delivered" });
    renderOrders();
    await inProgress();

    await user.click(screen.getByRole("button", { name: "Ya recibí el pedido #17" }));

    expect(confirmReceipt).toHaveBeenCalledWith(17);
    expect(await screen.findByRole("status")).toHaveTextContent("Marcamos el pedido #17 como entregado");
    expect(screen.queryByText("Pedido #17")).not.toBeInTheDocument();
    expect(screen.getByText("Pedido #42")).toBeInTheDocument();
  });

  test("shows the error if the arrival can't be confirmed", async () => {
    const user = userEvent.setup();
    confirmReceipt.mockRejectedValue(new Error("Solo se puede confirmar la llegada de un pedido enviado."));
    renderOrders();
    await inProgress();

    await user.click(screen.getByRole("button", { name: "Ya recibí el pedido #17" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Solo se puede confirmar la llegada");
    expect(screen.getByRole("button", { name: "Ya recibí el pedido #17" })).toBeEnabled();
  });

  test("pays an unpaid order from its card", async () => {
    const user = userEvent.setup();
    createPaymentLink.mockResolvedValue("https://mercadopago.test/pagar");
    renderOrders();
    await inProgress();

    await user.click(screen.getByRole("button", { name: "Pagar el pedido #42 con Mercado Pago" }));

    expect(createPaymentLink).toHaveBeenCalledWith(42);
    expect(goTo).toHaveBeenCalledWith("https://mercadopago.test/pagar");
  });

  test("shows the error if Mercado Pago can't be opened", async () => {
    const user = userEvent.setup();
    createPaymentLink.mockRejectedValue(new Error("No pudimos conectar con Mercado Pago."));
    renderOrders();
    await inProgress();

    await user.click(screen.getByRole("button", { name: "Pagar el pedido #42 con Mercado Pago" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos conectar con Mercado Pago.");
    expect(goTo).not.toHaveBeenCalled();
  });

  test("'Ver detalle' opens the order at its own address", async () => {
    const user = userEvent.setup();
    getPurchaseDetail.mockResolvedValue(inWay);
    renderOrders();
    await inProgress();

    await user.click(screen.getByRole("button", { name: "Ver detalle del pedido #17" }));

    expect(screen.getByTestId("route")).toHaveTextContent("/pedidos/17");
    expect(getPurchaseDetail).toHaveBeenCalledWith("17");
    expect(await screen.findByRole("heading", { name: "Pedido #17" })).toBeInTheDocument();
  });
});

describe("MisPedidos: el detalle (/pedidos/:id)", () => {
  test("shows the timeline, the products and 'Ya lo recibí'", async () => {
    const user = userEvent.setup();
    getPurchaseDetail.mockResolvedValue(inWay);
    confirmReceipt.mockResolvedValue({
      ...inWay,
      estado: "delivered",
      tracking: [...inWay.tracking, { estado: "delivered", date: "2026-01-05T12:00:00.000Z" }],
    });
    renderOrders("/pedidos/17");

    const line = await screen.findByRole("list", { name: "Seguimiento del pedido" });
    expect(within(line).getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByText("Pastillas de freno")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ya lo recibí" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Marcamos el pedido como entregado");
    expect(screen.queryByRole("button", { name: "Ya lo recibí" })).not.toBeInTheDocument();
  });

  test("shows the error if the order can't be loaded and lets you go back", async () => {
    const user = userEvent.setup();
    getPurchaseDetail.mockRejectedValue(new Error("Pedido no encontrado."));
    renderOrders("/pedidos/999");

    expect(await screen.findByRole("alert")).toHaveTextContent("Pedido no encontrado.");
    await user.click(screen.getByRole("button", { name: "← Volver a mis compras" }));
    expect(screen.getByTestId("route")).toHaveTextContent(/^\/pedidos$/);
  });

  test("goes back to the list", async () => {
    const user = userEvent.setup();
    getPurchaseDetail.mockResolvedValue(inWay);
    renderOrders("/pedidos/17");

    await user.click(await screen.findByRole("button", { name: "← Volver a mis compras" }));

    expect(screen.getByTestId("route")).toHaveTextContent(/^\/pedidos$/);
    expect(await inProgress()).toBeInTheDocument();
  });
});

describe("MisPedidos: se actualiza solo cuando el vendedor cambia el estado", () => {
  const packingOrder = {
    ...inWay,
    estado: "packing",
    tracking: inWay.tracking.slice(0, 2),
  };

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const waitRefresh = () =>
    act(async () => {
      await jest.advanceTimersByTimeAsync(AUTO_REFRESH_MS);
    });

  test("the list goes from packing to shipped to delivered without reloading", async () => {
    getPurchaseHistory.mockResolvedValue([packingOrder]);
    renderOrders();

    const list = await inProgress();
    expect(within(list).getByText("Lo estamos empaquetando")).toBeInTheDocument();

    getPurchaseHistory.mockResolvedValue([inWay]);
    await waitRefresh();
    expect(within(list).getByText("Está en camino")).toBeInTheDocument();

    // Entregado: ya no está en curso.
    getPurchaseHistory.mockResolvedValue([{ ...inWay, estado: "delivered" }]);
    await waitRefresh();
    expect(screen.getByText("No tenés pedidos en curso.")).toBeInTheDocument();
  });

  test("the order detail shows the new status without reloading", async () => {
    getPurchaseDetail.mockResolvedValue(packingOrder);
    renderOrders("/pedidos/17");

    await screen.findByRole("heading", { name: "Pedido #17" });
    expect(screen.queryByRole("button", { name: /Ya lo recibí/ })).not.toBeInTheDocument();

    getPurchaseDetail.mockResolvedValue(inWay);
    await waitRefresh();
    expect(getPurchaseDetail).toHaveBeenLastCalledWith("17");
    expect(screen.getByRole("button", { name: /Ya lo recibí/ })).toBeInTheDocument();
  });
});

describe("seguimientoPedido", () => {
  test("estaEnCurso: unpaid, confirmed, packing and shipped orders are in progress", () => {
    expect(isActive(withoutPay)).toBe(true);
    expect(isActive({ ...inWay, estado: "confirmed" })).toBe(true);
    expect(isActive({ ...inWay, estado: "packing" })).toBe(true);
    expect(isActive(inWay)).toBe(true);
    expect(isActive(delivered)).toBe(false);
    expect(isActive(expired)).toBe(false);
  });

  test("fraseDelEstado says what's happening with the order", () => {
    expect(statusPhrase(withoutPay)).toBe("Falta pagar");
    expect(statusPhrase({ ...withoutPay, paymentStatus: "rejected" })).toBe("El pago fue rechazado");
    expect(statusPhrase({ ...inWay, estado: "confirmed" })).toBe("Lo estamos preparando");
    expect(statusPhrase({ ...inWay, estado: "packing" })).toBe("Lo estamos empaquetando");
    expect(statusPhrase(inWay)).toBe("Está en camino");
  });

  test("pasosDeSeguimiento: a cancelled order shows only the stages it reached and then Cancelado", () => {
    const steps = trackingSteps({
      estado: "cancelled",
      tracking: [
        { estado: "confirmed", date: "a" },
        { estado: "packing", date: "b" },
        { estado: "cancelled", date: "c" },
      ],
    });

    expect(steps).toEqual([
      { estado: "confirmed", hecho: true, date: "a" },
      { estado: "packing", hecho: true, date: "b" },
      { estado: "cancelled", hecho: true, date: "c" },
    ]);
  });

  test("pasosDeSeguimiento: an old order without dates marks the stages up to the current one", () => {
    const steps = trackingSteps({
      estado: "shipped",
      tracking: [
        { estado: "confirmed", date: "a" },
        { estado: "shipped", date: null },
      ],
    });

    expect(steps.map(({ hecho }) => hecho)).toEqual([true, true, true, false]);
    expect(steps[1].date).toBeNull();
  });

  test("pasosDeSeguimiento: without history it uses the current status", () => {
    expect(trackingSteps({ estado: "packing" }).map(({ hecho }) => hecho)).toEqual([true, true, false, false]);
  });
});
