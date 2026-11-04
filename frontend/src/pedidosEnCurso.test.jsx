import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";

import AvisoPedidoEnCurso from "./AvisoPedidoEnCurso";
import { PedidosProvider } from "./context/PedidosContext";
import Footer from "./Footer";
import Navbar from "./Navbar";
import { obtenerHistorialCompras } from "./api";
import { obtenerSesion } from "./auth";

// Los pedidos en curso fuera de «Mis pedidos»: el ícono de la barra, el
// aviso del inicio y el link del pie de página.

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

describe("aviso del inicio", () => {
  test("says the most advanced order is on its way and leads to its tracking", async () => {
    const user = userEvent.setup();
    obtenerHistorialCompras.mockResolvedValue([entregado, enCamino]);
    renderConPedidos(<AvisoPedidoEnCurso />);

    const aviso = await screen.findByRole("region", { name: "Tus pedidos en curso" });
    expect(aviso).toHaveTextContent("Tu pedido #1 está en camino");

    await user.click(within(aviso).getByRole("button", { name: "Ver seguimiento →" }));
    expect(screen.getByTestId("ruta")).toHaveTextContent("/pedidos/1");
  });

  test("with several orders in progress, counts them and leads to Mis pedidos", async () => {
    const user = userEvent.setup();
    obtenerHistorialCompras.mockResolvedValue([sinPagar, empaquetando]);
    renderConPedidos(<AvisoPedidoEnCurso />);

    const aviso = await screen.findByRole("region", { name: "Tus pedidos en curso" });
    expect(aviso).toHaveTextContent("Estamos empaquetando tu pedido #2");
    expect(aviso).toHaveTextContent("Tenés 2 pedidos en curso");

    await user.click(within(aviso).getByRole("button", { name: "Ver mis pedidos →" }));
    expect(screen.getByTestId("ruta")).toHaveTextContent(/^\/pedidos$/);
  });

  test("an unpaid order says it's waiting for the payment", async () => {
    obtenerHistorialCompras.mockResolvedValue([sinPagar]);
    renderConPedidos(<AvisoPedidoEnCurso />);

    expect(await screen.findByRole("region", { name: "Tus pedidos en curso" })).toHaveTextContent(
      "Tu pedido #3 está esperando el pago"
    );
  });

  test("doesn't show without orders in progress", async () => {
    obtenerHistorialCompras.mockResolvedValue([entregado]);
    renderConPedidos(<AvisoPedidoEnCurso />);

    await screen.findByTestId("ruta");
    expect(obtenerHistorialCompras).toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Tus pedidos en curso" })).not.toBeInTheDocument();
  });

  test("doesn't ask for orders without a session or for a seller", () => {
    obtenerSesion.mockReturnValue(null);
    renderConPedidos(<AvisoPedidoEnCurso />);
    obtenerSesion.mockReturnValue({ ...cliente, userType: "employee" });
    renderConPedidos(<AvisoPedidoEnCurso />);

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

  test("an anonymous visitor doesn't see it", () => {
    obtenerSesion.mockReturnValue(null);
    renderConPedidos(<Navbar usuario={null} />);

    expect(screen.queryByTitle("Mis pedidos")).not.toBeInTheDocument();
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
