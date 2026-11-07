// Tests de los pedidos en curso fuera de «Mis pedidos».

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";

import PedidosEnCursoInicio from "./PedidosEnCursoInicio";
import { ordenarPorAvance } from "./seguimientoPedido";
import { PedidosProvider } from "./context/PedidosContext";
import Footer from "./Footer";
import Navbar from "./Navbar";
import { obtenerHistorialCompras } from "./api";
import { obtenerSesion } from "./auth";

// Los pedidos en curso fuera de «Mis pedidos»: el ícono de la barra, el
// la tarjeta del inicio y el link del pie de página.

jest.mock("./api", () => ({ obtenerHistorialCompras: jest.fn() }));
jest.mock("./auth", () => ({
  obtenerSesion: jest.fn(),
  sesionValida: (sesion) => Boolean(sesion),
  esVendedor: (sesion) => sesion?.userType === "employee",
}));
jest.mock("./context/CartContext", () => ({ useCart: () => ({ cantidadCarrito: 0 }) }));
jest.mock("./BusquedaCabecera", () => () => null);

const cliente = { token: "jwt", userType: "client", nombre: "Ana", email: "ana@example.com" };

const enCamino = { id: 1, estado: "shipped", estadoPago: "approved", items: [] };
const empaquetando = { id: 2, estado: "packing", estadoPago: "approved", items: [] };
const sinPagar = { id: 3, estado: "confirmed", estadoPago: "pending", items: [] };
const entregado = { id: 4, estado: "delivered", estadoPago: "approved", items: [] };

function Ruta() {
  return <p data-testid="ruta">{useLocation().pathname}</p>;
}

function renderConPedidos(ui) {
  return render(
    <MemoryRouter>
      <PedidosProvider>
        {ui}
        <Ruta />
      </PedidosProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  obtenerSesion.mockReturnValue(cliente);
});

const enCaminoConItems = { ...enCamino, total: 2600, items: [{ cantidad: 4, precio: 650 }] };

function renderInicio() {
  renderConPedidos(<PedidosEnCursoInicio />);
}

describe("tarjeta de pedidos en curso del inicio", () => {
  const tarjeta = () => screen.findByRole("region", { name: "Tus pedidos en curso" });
  const pedidosDe = (region) => within(region).getAllByRole("button", { name: /Ver el seguimiento del pedido/ });

  test("shows the orders in progress, the most advanced first, with their progress", async () => {
    const user = userEvent.setup();
    obtenerHistorialCompras.mockResolvedValue([entregado, sinPagar, empaquetando, enCaminoConItems]);
    renderInicio();

    const pedidos = pedidosDe(await tarjeta());
    expect(pedidos.map((pedido) => pedido.textContent)).toEqual([
      expect.stringContaining("En camino"),
      expect.stringContaining("Empaquetando"),
      expect.stringContaining("Falta pagar"),
    ]);
    expect(within(pedidos[0]).getByRole("img", { name: "Progreso del pedido #1: 3 de 4 etapas" })).toBeInTheDocument();

    await user.click(pedidos[0]);
    expect(screen.getByTestId("ruta")).toHaveTextContent("/pedidos/1");
  });

  test("shows at most three and links to all of them", async () => {
    const user = userEvent.setup();
    const otro = { ...empaquetando, id: 5 };
    obtenerHistorialCompras.mockResolvedValue([sinPagar, empaquetando, enCamino, otro]);
    renderInicio();

    const region = await tarjeta();
    expect(pedidosDe(region)).toHaveLength(3);
    // El que falta pagar es el que queda afuera.
    expect(region).not.toHaveTextContent("Falta pagar");

    await user.click(within(region).getByRole("button", { name: "Ver los 4 →" }));
    expect(screen.getByTestId("ruta")).toHaveTextContent(/^\/pedidos$/);
  });

  test("an unpaid order shows the deadline instead of the progress", async () => {
    obtenerHistorialCompras.mockResolvedValue([{ ...sinPagar, vencePago: "2026-01-03T00:15:00.000Z" }]);
    renderInicio();

    const region = await tarjeta();
    expect(region).toHaveTextContent("Falta pagar");
    expect(region).toHaveTextContent(/Pagalo antes de/);
    expect(within(region).queryByRole("img", { name: /Progreso/ })).not.toBeInTheDocument();
    expect(within(region).getByRole("button", { name: "Ver todo →" })).toBeInTheDocument();
  });

  test("without orders in progress it doesn't show", async () => {
    obtenerHistorialCompras.mockResolvedValue([entregado]);
    renderInicio();

    await waitFor(() => expect(obtenerHistorialCompras).toHaveBeenCalled());
    await screen.findByTestId("ruta");
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  test("without a session it doesn't show nor ask for orders", () => {
    obtenerSesion.mockReturnValue(null);
    renderInicio();

    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(obtenerHistorialCompras).not.toHaveBeenCalled();
  });

  test("ordenarPorAvance: shipped, packing, preparing, unpaid; newest first among equals", () => {
    const viejo = { id: 10, estado: "packing", estadoPago: "approved", fecha: "2026-01-01" };
    const nuevo = { id: 11, estado: "packing", estadoPago: "approved", fecha: "2026-01-05" };
    const preparando = { id: 12, estado: "confirmed", estadoPago: "approved" };

    expect(ordenarPorAvance([sinPagar, viejo, preparando, enCamino, nuevo]).map((p) => p.id)).toEqual([
      enCamino.id, 11, 10, 12, sinPagar.id,
    ]);
  });
});

describe("ícono de Mis pedidos en la barra", () => {
  test("shows how many orders are in progress and opens Mis pedidos", async () => {
    const user = userEvent.setup();
    obtenerHistorialCompras.mockResolvedValue([enCamino, sinPagar, entregado]);
    renderConPedidos(<Navbar usuario={cliente} onHistorial={jest.fn()} />);

    const icono = await screen.findByRole("button", { name: "Mis compras (2 en curso)" });
    expect(icono).toHaveTextContent("2");

    await user.click(icono);
    expect(screen.getByTestId("ruta")).toHaveTextContent(/^\/pedidos$/);
  });

  test("without orders in progress it has no number", async () => {
    obtenerHistorialCompras.mockResolvedValue([entregado]);
    renderConPedidos(<Navbar usuario={cliente} />);

    await screen.findByTestId("ruta");
    expect(screen.getByRole("button", { name: "Mis compras" })).not.toHaveTextContent(/\d/);
  });

  test("the account menu has a single Mis compras (with the count) and the rest of the account", async () => {
    const user = userEvent.setup();
    obtenerHistorialCompras.mockResolvedValue([enCamino]);
    renderConPedidos(<Navbar usuario={cliente} />);
    await screen.findByRole("button", { name: "Mis compras (1 en curso)" });

    await user.click(screen.getByTitle("Mi cuenta"));
    const menu = screen.getByText("ana@example.com").closest("div.absolute");
    expect(within(menu).getByRole("button", { name: /Mis compras/ })).toHaveTextContent("1 en curso");
    // Las compras anteriores van en una pestaña de Mis compras, no aparte.
    expect(within(menu).queryByRole("button", { name: /Historial/ })).not.toBeInTheDocument();

    await user.click(within(menu).getByRole("button", { name: "Ver toda mi cuenta" }));
    expect(screen.getByTestId("ruta")).toHaveTextContent(/^\/cuenta$/);
  });

  test("a seller doesn't see it", () => {
    renderConPedidos(<Navbar usuario={{ ...cliente, userType: "employee" }} />);

    expect(screen.queryByTitle("Mis compras")).not.toBeInTheDocument();
  });

  test("an anonymous visitor sees it, like the cart and favorites, and it leads to the login", async () => {
    const user = userEvent.setup();
    const onLogin = jest.fn();
    obtenerSesion.mockReturnValue(null);
    renderConPedidos(<Navbar usuario={null} onLogin={onLogin} />);

    await user.click(screen.getByTitle("Mis compras"));

    expect(onLogin).toHaveBeenCalled();
    expect(screen.getByTestId("ruta")).toHaveTextContent(/^\/$/);
    expect(screen.getByTitle("Favoritos")).toBeInTheDocument();
    expect(screen.getByTitle("Carrito")).toBeInTheDocument();
  });
});

describe("link del pie de página", () => {
  test("'Mis compras' and 'Mi cuenta' open the account, or the login without a session", async () => {
    const user = userEvent.setup();
    const props = { onPedidos: jest.fn(), onCuenta: jest.fn(), onLogin: jest.fn() };
    const { unmount } = render(<Footer usuario={cliente} {...props} />);

    await user.click(screen.getByRole("button", { name: "Mis compras" }));
    await user.click(screen.getByRole("button", { name: "Mi cuenta" }));
    expect(props.onPedidos).toHaveBeenCalled();
    expect(props.onCuenta).toHaveBeenCalled();
    unmount();

    render(<Footer usuario={null} {...props} />);
    await user.click(screen.getByRole("button", { name: "Mis compras" }));
    await user.click(screen.getByRole("button", { name: "Mi cuenta" }));
    expect(props.onLogin).toHaveBeenCalledTimes(2);
  });
});
