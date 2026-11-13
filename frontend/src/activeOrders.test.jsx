// Tests de los pedidos en curso fuera de «Mis pedidos».

import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";

import HomeActiveOrders from "./HomeActiveOrders";
import { sortByProgress } from "./orderTracking";
import { OrdersProvider } from "./context/OrdersContext";
import Footer from "./Footer";
import Navbar from "./Navbar";
import { getPurchaseHistory } from "./api";
import { getSession } from "./auth";
import { AUTO_REFRESH_MS } from "./useAutoRefresh";

// Los pedidos en curso fuera de «Mis pedidos»: el ícono de la barra, el
// la tarjeta del inicio y el link del pie de página.

jest.mock("./api", () => ({ getPurchaseHistory: jest.fn() }));
jest.mock("./auth", () => ({
  getSession: jest.fn(),
  isSessionValid: (session) => Boolean(session),
  isSeller: (session) => session?.userType === "employee",
}));
jest.mock("./context/CartContext", () => ({ useCart: () => ({ cartQuantity: 0 }) }));
jest.mock("./HeaderSearch", () => () => null);

const customer = { token: "jwt", userType: "client", displayName: "Ana", email: "ana@example.com" };

const inWay = { id: 1, estado: "shipped", paymentStatus: "approved", items: [] };
const packing = { id: 2, estado: "packing", paymentStatus: "approved", items: [] };
const withoutPay = { id: 3, estado: "confirmed", paymentStatus: "pending", items: [] };
const delivered = { id: 4, estado: "delivered", paymentStatus: "approved", items: [] };

function RouteEntry() {
  return <p data-testid="route">{useLocation().pathname}</p>;
}

function renderWithOrders(ui) {
  return render(
    <MemoryRouter>
      <OrdersProvider>
        {ui}
        <RouteEntry />
      </OrdersProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  getSession.mockReturnValue(customer);
});

const inWayWithItems = { ...inWay, total: 2600, items: [{ quantity: 4, price: 650 }] };

function renderHome() {
  renderWithOrders(<HomeActiveOrders />);
}

describe("tarjeta de pedidos en curso del inicio", () => {
  const cardElement = () => screen.findByRole("region", { name: "Tus pedidos en curso" });
  const ordersOf = (region) => within(region).getAllByRole("button", { name: /Ver el seguimiento del pedido/ });

  test("shows the orders in progress, the most advanced first, with their progress", async () => {
    const user = userEvent.setup();
    getPurchaseHistory.mockResolvedValue([delivered, withoutPay, packing, inWayWithItems]);
    renderHome();

    const orders = ordersOf(await cardElement());
    expect(orders.map((pedido) => pedido.textContent)).toEqual([
      expect.stringContaining("En camino"),
      expect.stringContaining("Empaquetando"),
      expect.stringContaining("Falta pagar"),
    ]);
    expect(within(orders[0]).getByRole("img", { name: "Progreso del pedido #1: 3 de 4 etapas" })).toBeInTheDocument();

    await user.click(orders[0]);
    expect(screen.getByTestId("route")).toHaveTextContent("/pedidos/1");
  });

  test("updates by itself when the seller changes the status: packing → shipped → delivered", async () => {
    jest.useFakeTimers();
    try {
      getPurchaseHistory.mockResolvedValue([packing]);
      renderHome();

      expect(ordersOf(await cardElement())[0]).toHaveTextContent("Empaquetando");

      const waitRefresh = () =>
        act(async () => {
          await jest.advanceTimersByTimeAsync(AUTO_REFRESH_MS);
        });

      getPurchaseHistory.mockResolvedValue([{ ...packing, estado: "shipped" }]);
      await waitRefresh();
      expect(ordersOf(screen.getByRole("region", { name: "Tus pedidos en curso" }))[0]).toHaveTextContent("En camino");

      // Entregado: ya no está en curso y la tarjeta desaparece.
      getPurchaseHistory.mockResolvedValue([{ ...packing, estado: "delivered" }]);
      await waitRefresh();
      expect(screen.queryByRole("region", { name: "Tus pedidos en curso" })).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  test("shows at most three and links to all of them", async () => {
    const user = userEvent.setup();
    const other = { ...packing, id: 5 };
    getPurchaseHistory.mockResolvedValue([withoutPay, packing, inWay, other]);
    renderHome();

    const region = await cardElement();
    expect(ordersOf(region)).toHaveLength(3);
    // El que falta pagar es el que queda afuera.
    expect(region).not.toHaveTextContent("Falta pagar");

    await user.click(within(region).getByRole("button", { name: "Ver los 4 →" }));
    expect(screen.getByTestId("route")).toHaveTextContent(/^\/pedidos$/);
  });

  test("an unpaid order shows the deadline instead of the progress", async () => {
    getPurchaseHistory.mockResolvedValue([{ ...withoutPay, expiresPayment: "2026-01-03T00:15:00.000Z" }]);
    renderHome();

    const region = await cardElement();
    expect(region).toHaveTextContent("Falta pagar");
    expect(region).toHaveTextContent(/Pagalo antes de/);
    expect(within(region).queryByRole("img", { name: /Progreso/ })).not.toBeInTheDocument();
    expect(within(region).getByRole("button", { name: "Ver todo →" })).toBeInTheDocument();
  });

  test("without orders in progress it doesn't show", async () => {
    getPurchaseHistory.mockResolvedValue([delivered]);
    renderHome();

    await waitFor(() => expect(getPurchaseHistory).toHaveBeenCalled());
    await screen.findByTestId("route");
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  test("without a session it doesn't show nor ask for orders", () => {
    getSession.mockReturnValue(null);
    renderHome();

    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(getPurchaseHistory).not.toHaveBeenCalled();
  });

  test("ordenarPorAvance: shipped, packing, preparing, unpaid; newest first among equals", () => {
    const old = { id: 10, estado: "packing", paymentStatus: "approved", date: "2026-01-01" };
    const newItem = { id: 11, estado: "packing", paymentStatus: "approved", date: "2026-01-05" };
    const preparing = { id: 12, estado: "confirmed", paymentStatus: "approved" };

    expect(sortByProgress([withoutPay, old, preparing, inWay, newItem]).map((p) => p.id)).toEqual([
      inWay.id, 11, 10, 12, withoutPay.id,
    ]);
  });
});

describe("ícono de Mis pedidos en la barra", () => {
  test("shows how many orders are in progress and opens Mis pedidos", async () => {
    const user = userEvent.setup();
    getPurchaseHistory.mockResolvedValue([inWay, withoutPay, delivered]);
    renderWithOrders(<Navbar sessionUser={customer} onHistory={jest.fn()} />);

    const icon = await screen.findByRole("button", { name: "Mis compras (2 en curso)" });
    expect(icon).toHaveTextContent("2");

    await user.click(icon);
    expect(screen.getByTestId("route")).toHaveTextContent(/^\/pedidos$/);
  });

  test("without orders in progress it has no number", async () => {
    getPurchaseHistory.mockResolvedValue([delivered]);
    renderWithOrders(<Navbar sessionUser={customer} />);

    await screen.findByTestId("route");
    expect(screen.getByRole("button", { name: "Mis compras" })).not.toHaveTextContent(/\d/);
  });

  test("the account menu has a single Mis compras (with the count) and the rest of the account", async () => {
    const user = userEvent.setup();
    getPurchaseHistory.mockResolvedValue([inWay]);
    renderWithOrders(<Navbar sessionUser={customer} />);
    await screen.findByRole("button", { name: "Mis compras (1 en curso)" });

    await user.click(screen.getByTitle("Mi cuenta"));
    const menu = screen.getByText("ana@example.com").closest("div.absolute");
    expect(within(menu).getByRole("button", { name: /Mis compras/ })).toHaveTextContent("1 en curso");
    // Las compras anteriores van en una pestaña de Mis compras, no aparte.
    expect(within(menu).queryByRole("button", { name: /Historial/ })).not.toBeInTheDocument();

    await user.click(within(menu).getByRole("button", { name: "Ver toda mi cuenta" }));
    expect(screen.getByTestId("route")).toHaveTextContent(/^\/cuenta$/);
  });

  test("a seller doesn't see it", () => {
    renderWithOrders(<Navbar sessionUser={{ ...customer, userType: "employee" }} />);

    expect(screen.queryByTitle("Mis compras")).not.toBeInTheDocument();
  });

  test("an anonymous visitor sees it, like the cart and favorites, and it leads to the login", async () => {
    const user = userEvent.setup();
    const onLogin = jest.fn();
    getSession.mockReturnValue(null);
    renderWithOrders(<Navbar sessionUser={null} onLogin={onLogin} />);

    await user.click(screen.getByTitle("Mis compras"));

    expect(onLogin).toHaveBeenCalled();
    expect(screen.getByTestId("route")).toHaveTextContent(/^\/$/);
    expect(screen.getByTitle("Favoritos")).toBeInTheDocument();
    expect(screen.getByTitle("Carrito")).toBeInTheDocument();
  });
});

describe("link del pie de página", () => {
  test("'Mis compras' and 'Mi cuenta' open the account, or the login without a session", async () => {
    const user = userEvent.setup();
    const props = { onOrders: jest.fn(), onAccount: jest.fn(), onLogin: jest.fn() };
    const { unmount } = render(<Footer sessionUser={customer} {...props} />);

    await user.click(screen.getByRole("button", { name: "Mis compras" }));
    await user.click(screen.getByRole("button", { name: "Mi cuenta" }));
    expect(props.onOrders).toHaveBeenCalled();
    expect(props.onAccount).toHaveBeenCalled();
    unmount();

    render(<Footer sessionUser={null} {...props} />);
    await user.click(screen.getByRole("button", { name: "Mis compras" }));
    await user.click(screen.getByRole("button", { name: "Mi cuenta" }));
    expect(props.onLogin).toHaveBeenCalledTimes(2);
  });
});
