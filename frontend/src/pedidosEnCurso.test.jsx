import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";

import PedidosEnCursoInicio from "./PedidosEnCursoInicio";
import { PedidosProvider } from "./context/PedidosContext";
import Footer from "./Footer";
import Navbar from "./Navbar";
import { obtenerHistorialCompras } from "./api";
import { obtenerSesion } from "./auth";

// Los pedidos en curso fuera de «Mis pedidos»: el ícono de la barra, el
// la sección del inicio y el link del pie de página.

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

describe("sección del inicio", () => {
  const seccion = () => screen.findByRole("region", { name: "Tus pedidos en curso" });

  test("shows the orders in progress, the most advanced first, with their progress", async () => {
    const user = userEvent.setup();
    obtenerHistorialCompras.mockResolvedValue([entregado, empaquetando, enCaminoConItems]);
    renderConPedidos(<PedidosEnCursoInicio />);

    const tarjetas = within(await seccion()).getAllByRole("button", { name: /Ver el seguimiento del pedido/ });
    expect(tarjetas).toHaveLength(2);
    expect(tarjetas[0]).toHaveTextContent("Está en camino");
    expect(tarjetas[0]).toHaveTextContent("Pedido #1 · 4 productos");
    expect(tarjetas[1]).toHaveTextContent("Lo estamos empaquetando");
    expect(within(tarjetas[0]).getByRole("list", { name: /Progreso del pedido #1/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ver el seguimiento del pedido #1: Está en camino" }));
    expect(screen.getByTestId("ruta")).toHaveTextContent("/pedidos/1");
  });

  test("shows at most two and links to all of them", async () => {
    const user = userEvent.setup();
    obtenerHistorialCompras.mockResolvedValue([sinPagar, empaquetando, enCamino]);
    renderConPedidos(<PedidosEnCursoInicio />);

    const lista = await seccion();
    expect(within(lista).getAllByRole("button", { name: /Ver el seguimiento del pedido/ })).toHaveLength(2);
    // El que falta pagar es el que queda afuera.
    expect(lista).not.toHaveTextContent("Falta pagar");

    await user.click(within(lista).getByRole("button", { name: "Ver los 3 →" }));
    expect(screen.getByTestId("ruta")).toHaveTextContent(/^\/pedidos$/);
  });

  test("an unpaid order invites to pay instead of showing the progress", async () => {
    obtenerHistorialCompras.mockResolvedValue([{ ...sinPagar, vencePago: "2026-01-03T00:15:00.000Z" }]);
    renderConPedidos(<PedidosEnCursoInicio />);

    const lista = await seccion();
    expect(lista).toHaveTextContent("Falta pagar");
    expect(lista).toHaveTextContent("Pagar →");
    expect(lista).toHaveTextContent("Tus repuestos quedan reservados hasta");
    expect(within(lista).queryByRole("list", { name: /Progreso/ })).not.toBeInTheDocument();
    expect(within(lista).getByRole("button", { name: "Ver mis pedidos →" })).toBeInTheDocument();
  });

  test("doesn't show without orders in progress", async () => {
    obtenerHistorialCompras.mockResolvedValue([entregado]);
    renderConPedidos(<PedidosEnCursoInicio />);

    await screen.findByTestId("ruta");
    expect(obtenerHistorialCompras).toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Tus pedidos en curso" })).not.toBeInTheDocument();
  });

  test("doesn't ask for orders without a session or for a seller", () => {
    obtenerSesion.mockReturnValue(null);
    renderConPedidos(<PedidosEnCursoInicio />);
    obtenerSesion.mockReturnValue({ ...cliente, userType: "employee" });
    renderConPedidos(<PedidosEnCursoInicio />);

    expect(obtenerHistorialCompras).not.toHaveBeenCalled();
  });
});

describe("ícono de Mis pedidos en la barra", () => {
  test("shows how many orders are in progress and opens Mis pedidos", async () => {
    const user = userEvent.setup();
    obtenerHistorialCompras.mockResolvedValue([enCamino, sinPagar, entregado]);
    renderConPedidos(<Navbar usuario={cliente} onHistorial={jest.fn()} />);

    const icono = await screen.findByRole("button", { name: "Mis pedidos (2 en curso)" });
    expect(icono).toHaveTextContent("2");

    await user.click(icono);
    expect(screen.getByTestId("ruta")).toHaveTextContent(/^\/pedidos$/);
  });

  test("without orders in progress it has no number", async () => {
    obtenerHistorialCompras.mockResolvedValue([entregado]);
    renderConPedidos(<Navbar usuario={cliente} />);

    await screen.findByTestId("ruta");
    expect(screen.getByRole("button", { name: "Mis pedidos" })).not.toHaveTextContent(/\d/);
  });

  test("the account menu has Mis pedidos (with the count) and the purchase history", async () => {
    const user = userEvent.setup();
    const onHistorial = jest.fn();
    obtenerHistorialCompras.mockResolvedValue([enCamino]);
    renderConPedidos(<Navbar usuario={cliente} onHistorial={onHistorial} />);
    await screen.findByRole("button", { name: "Mis pedidos (1 en curso)" });

    await user.click(screen.getByTitle("Mi cuenta"));
    const menu = screen.getByText("ana@example.com").closest("div.absolute");
    expect(within(menu).getByRole("button", { name: /Mis pedidos/ })).toHaveTextContent("1 en curso");

    await user.click(within(menu).getByRole("button", { name: "Historial de compras" }));
    expect(onHistorial).toHaveBeenCalled();
  });

  test("a seller doesn't see it", () => {
    renderConPedidos(<Navbar usuario={{ ...cliente, userType: "employee" }} />);

    expect(screen.queryByTitle("Mis pedidos")).not.toBeInTheDocument();
  });

  test("an anonymous visitor sees it, like the cart and favorites, and it leads to the login", async () => {
    const user = userEvent.setup();
    const onLogin = jest.fn();
    obtenerSesion.mockReturnValue(null);
    renderConPedidos(<Navbar usuario={null} onLogin={onLogin} />);

    await user.click(screen.getByTitle("Mis pedidos"));

    expect(onLogin).toHaveBeenCalled();
    expect(screen.getByTestId("ruta")).toHaveTextContent(/^\/$/);
    expect(screen.getByTitle("Favoritos")).toBeInTheDocument();
    expect(screen.getByTitle("Carrito")).toBeInTheDocument();
  });
});

describe("link del pie de página", () => {
  test("'Mis pedidos' opens the orders in progress, or the login without a session", async () => {
    const user = userEvent.setup();
    const props = { onPedidos: jest.fn(), onLogin: jest.fn() };
    const { unmount } = render(<Footer usuario={cliente} {...props} />);

    await user.click(screen.getByRole("button", { name: "Mis pedidos" }));
    expect(props.onPedidos).toHaveBeenCalled();
    unmount();

    render(<Footer usuario={null} {...props} />);
    await user.click(screen.getByRole("button", { name: "Mis pedidos" }));
    expect(props.onLogin).toHaveBeenCalled();
  });
});
