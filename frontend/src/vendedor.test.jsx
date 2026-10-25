import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";

jest.mock("./api", () => ({
  buscarTexto: jest.fn(),
  login: jest.fn(),
  registrar: jest.fn(),
  obtenerPerfil: jest.fn(),
  renovarToken: jest.fn(),
  actualizarPerfil: jest.fn(),
  cambiarPassword: jest.fn(),
  obtenerRepuestos: jest.fn(),
  obtenerCategorias: jest.fn(),
  obtenerCarrito: jest.fn(),
  agregarItemCarrito: jest.fn(),
  actualizarItemCarrito: jest.fn(),
  eliminarItemCarrito: jest.fn(),
  vaciarCarritoAPI: jest.fn(),
  obtenerMarcas: jest.fn(),
  obtenerModelos: jest.fn(),
  obtenerAnios: jest.fn(),
  obtenerMasVendidos: jest.fn(),
  obtenerDirecciones: jest.fn(),
  crearDireccion: jest.fn(),
  marcarDireccionPrincipal: jest.fn(),
  eliminarDireccionAPI: jest.fn(),
  obtenerMetodosPago: jest.fn(),
  crearMetodoPago: jest.fn(),
  marcarMetodoPagoPrincipal: jest.fn(),
  eliminarMetodoPagoAPI: jest.fn(),
  obtenerRecomendaciones: jest.fn(),
  obtenerFavoritos: jest.fn(),
  obtenerAvisosStock: jest.fn(),
  agregarAvisoStock: jest.fn(),
  quitarAvisoStock: jest.fn(),
  reenviarVerificacion: jest.fn(),
  obtenerHistorialCompras: jest.fn(),
  obtenerDetalleCompra: jest.fn(),
  agregarFavoritoAPI: jest.fn(),
  quitarFavoritoAPI: jest.fn(),
}));
jest.mock(
  "react-hot-toast",
  () => ({ __esModule: true, default: { error: jest.fn() } }),
  { virtual: true }
);

import App from "./App";
import EmployeeRoute from "./EmployeeRoute";
import Navbar from "./Navbar";
import { CartProvider, useCart } from "./context/CartContext";
import { VehicleProvider } from "./context/VehicleContext";
import { PitProvider } from "./context/PitContext";
import { crearToken } from "./testTokens";
import toast from "react-hot-toast";
import {
  agregarItemCarrito,
  login,
  obtenerCarrito,
  obtenerCategorias,
  obtenerDetalleCompra,
  obtenerDirecciones,
  obtenerAvisosStock,
  obtenerFavoritos,
  obtenerHistorialCompras,
  obtenerMarcas,
  obtenerMasVendidos,
  obtenerMetodosPago,
  obtenerAnios,
  obtenerModelos,
  obtenerPerfil,
  obtenerRecomendaciones,
  obtenerRepuestos,
  renovarToken,
} from "./api";

const HORA = 60 * 60 * 1000;
const emptyCart = { items: [], total: 0 };

const tokenDe = (tipo) => crearToken(Date.now() + HORA, tipo);

const sesionDe = (tipo, extra = {}) => ({
  token: tokenDe(tipo),
  tokenType: "bearer",
  userId: "1",
  userType: tipo,
  email: tipo === "employee" ? "vendedor@example.com" : "ana@example.com",
  ...extra,
});

const guardar = (sesion) =>
  localStorage.setItem("autobought-sesion", JSON.stringify(sesion));

function RutaActual() {
  const location = useLocation();
  return <p data-testid="ruta-actual">{location.pathname}</p>;
}

function renderApp(ruta = "/") {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <CartProvider>
        <VehicleProvider>
          <PitProvider>
            <App />
            <RutaActual />
          </PitProvider>
        </VehicleProvider>
      </CartProvider>
    </MemoryRouter>
  );
}

const rutaActual = () => screen.getByTestId("ruta-actual").textContent;

beforeEach(() => {
  obtenerRepuestos.mockResolvedValue([]);
  obtenerCategorias.mockResolvedValue([]);
  obtenerCarrito.mockResolvedValue(emptyCart);
  agregarItemCarrito.mockResolvedValue(emptyCart);
  obtenerMarcas.mockResolvedValue([{ brand: "Volkswagen" }]);
  obtenerModelos.mockResolvedValue([]);
  obtenerAnios.mockResolvedValue([]);
  obtenerMasVendidos.mockResolvedValue([]);
  obtenerDirecciones.mockResolvedValue([]);
  obtenerMetodosPago.mockResolvedValue([]);
  obtenerRecomendaciones.mockResolvedValue([]);
  obtenerFavoritos.mockResolvedValue([]);
  obtenerAvisosStock.mockResolvedValue([]);
  obtenerHistorialCompras.mockResolvedValue([]);
  obtenerDetalleCompra.mockResolvedValue({});
  obtenerPerfil.mockResolvedValue({
    nombre: "Ana Gomez",
    apellido: "",
    email: "ana@example.com",
    telefono: "",
  });
});

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  jest.clearAllMocks();
});

// Ninguno de estos pedidos le corresponde a un vendedor (responden 403).
const pedidosDeCliente = () => [
  obtenerPerfil,
  obtenerCarrito,
  obtenerFavoritos,
  obtenerAvisosStock,
  obtenerDirecciones,
  obtenerMetodosPago,
  obtenerHistorialCompras,
];

const expectSinPedidosDeCliente = () => {
  pedidosDeCliente().forEach((pedido) => expect(pedido).not.toHaveBeenCalled());
};

describe("login según el tipo de usuario", () => {
  const iniciarSesion = async (tipo) => {
    const user = userEvent.setup();
    login.mockResolvedValue({ access_token: tokenDe(tipo), token_type: "bearer" });

    renderApp("/login");
    await user.type(screen.getByPlaceholderText("tu@email.com"), "alguien@example.com");
    await user.type(screen.getByPlaceholderText("••••••••"), "secreto123");
    await user.click(screen.getByRole("button", { name: "INICIAR SESIÓN" }));
  };

  it("sends a seller to the dashboard without asking for the client profile, cart or favorites", async () => {
    await iniciarSesion("employee");

    expect(await screen.findByRole("heading", { name: "Portal del vendedor" })).toBeInTheDocument();
    expect(rutaActual()).toBe("/dashboard");
    expectSinPedidosDeCliente();

    const sesion = JSON.parse(sessionStorage.getItem("autobought-sesion"));
    expect(sesion).toEqual(
      expect.objectContaining({ userType: "employee", email: "alguien@example.com" })
    );
  });

  it("keeps sending a client to the store and loads profile and cart as before", async () => {
    await iniciarSesion("client");

    await waitFor(() => expect(rutaActual()).toBe("/"));
    expect(obtenerPerfil).toHaveBeenCalled();
    expect(obtenerCarrito).toHaveBeenCalled();
    await waitFor(() => expect(obtenerFavoritos).toHaveBeenCalled());
    await waitFor(() => expect(obtenerAvisosStock).toHaveBeenCalled());
    expect(screen.queryByRole("heading", { name: "Portal del vendedor" })).not.toBeInTheDocument();
  });
});

describe("Navbar según el perfil", () => {
  const renderNavbar = (usuario) =>
    render(
      <MemoryRouter>
        <CartProvider>
          <Navbar
            paginaActual="home"
            usuario={usuario}
            onHome={jest.fn()}
            onCatalogo={jest.fn()}
            onLogin={jest.fn()}
            onMarcas={jest.fn()}
            onCarrito={jest.fn()}
            onFavoritos={jest.fn()}
            onPerfil={jest.fn()}
            onDirecciones={jest.fn()}
            onMetodosPago={jest.fn()}
            onHistorial={jest.fn()}
            onCerrarSesion={jest.fn()}
          />
          <RutaActual />
        </CartProvider>
      </MemoryRouter>
    );

  it("shows a seller only Dashboard and Cerrar sesión, with no cart, favorites or client items", async () => {
    const user = userEvent.setup();
    renderNavbar(sesionDe("employee"));

    expect(screen.queryByTitle("Carrito")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Favoritos")).not.toBeInTheDocument();

    await user.click(screen.getByTitle("Mi cuenta"));

    expect(screen.getByRole("button", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeInTheDocument();
    expect(screen.getByText("vendedor@example.com")).toBeInTheDocument();
    ["Mi perfil", "Direcciones", "Métodos de pago", "Historial de compras"].forEach((nombre) =>
      expect(screen.queryByRole("button", { name: nombre })).not.toBeInTheDocument()
    );
  });

  it("takes a seller to the dashboard from the menu", async () => {
    const user = userEvent.setup();
    renderNavbar(sesionDe("employee"));

    await user.click(screen.getByTitle("Mi cuenta"));
    await user.click(screen.getByRole("button", { name: "Dashboard" }));

    expect(rutaActual()).toBe("/dashboard");
  });

  it("shows a client the cart, favorites and account items, without a dashboard link", async () => {
    const user = userEvent.setup();
    renderNavbar(sesionDe("client", { nombre: "Ana" }));

    expect(screen.getByTitle("Carrito")).toBeInTheDocument();
    expect(screen.getByTitle("Favoritos")).toBeInTheDocument();

    await user.click(screen.getByTitle("Mi cuenta"));

    ["Mi perfil", "Direcciones", "Métodos de pago", "Historial de compras", "Cerrar sesión"].forEach(
      (nombre) => expect(screen.getByRole("button", { name: nombre })).toBeInTheDocument()
    );
    expect(screen.queryByRole("button", { name: "Dashboard" })).not.toBeInTheDocument();
  });

  it("shows an anonymous visitor the cart and favorites and no dashboard link", () => {
    renderNavbar(null);

    expect(screen.getByTitle("Carrito")).toBeInTheDocument();
    expect(screen.getByTitle("Favoritos")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dashboard" })).not.toBeInTheDocument();
  });
});

describe("App con sesión de vendedor", () => {
  beforeEach(() => guardar(sesionDe("employee")));

  it("greets the seller on the placeholder dashboard", async () => {
    renderApp("/dashboard");

    expect(await screen.findByRole("heading", { name: "Portal del vendedor" })).toBeInTheDocument();
    expect(screen.getByText(/vendedor@example\.com/)).toBeInTheDocument();
    expect(screen.getByText("El dashboard estará disponible pronto.")).toBeInTheDocument();
  });

  it("does not request profile, cart or favorites when the app loads", async () => {
    renderApp("/");

    await screen.findByTitle("Mi cuenta");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expectSinPedidosDeCliente();
  });

  it("does not request profile, cart or favorites when the seller opens the store", async () => {
    const user = userEvent.setup();
    obtenerRepuestos.mockResolvedValue([]);
    renderApp("/dashboard");

    await user.click(await screen.findByRole("button", { name: "Repuestos" }));
    await waitFor(() => expect(rutaActual()).toBe("/catalogo"));

    expectSinPedidosDeCliente();
  });

  it("logs out from the seller menu, clears the session and leaves the dashboard", async () => {
    const user = userEvent.setup();
    renderApp("/dashboard");

    await user.click(await screen.findByTitle("Mi cuenta"));
    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));

    // Igual que cerrar sesión en /carrito: el guard ve que ya no hay sesión
    // y manda al login antes de que se aplique la navegación a "/".
    await waitFor(() => expect(rutaActual()).not.toBe("/dashboard"));
    expect(localStorage.getItem("autobought-sesion")).toBeNull();
  });

  it.each([
    "/carrito",
    "/favoritos",
    "/perfil",
    "/direcciones",
    "/metodos-pago",
    "/historial",
  ])("redirects the client route %s to the dashboard", async (ruta) => {
    renderApp(ruta);

    expect(await screen.findByRole("heading", { name: "Portal del vendedor" })).toBeInTheDocument();
    expect(rutaActual()).toBe("/dashboard");
    expectSinPedidosDeCliente();
  });

  it("does not add to the cart through the API", async () => {
    let addToCart;
    function Sonda() {
      ({ addToCart } = useCart());
      return null;
    }
    render(
      <MemoryRouter>
        <CartProvider>
          <Sonda />
        </CartProvider>
      </MemoryRouter>
    );

    const agregado = await addToCart({ id: "BP1234", stock: 3 });

    expect(agregado).toBe(false);
    expect(agregarItemCarrito).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it("renews the token keeping the seller user type, without client requests", async () => {
    jest.useFakeTimers();
    try {
      const sesion = sesionDe("employee", { token: crearToken(Date.now() + 4 * 60 * 1000, "employee") });
      guardar(sesion);
      const nuevo = crearToken(Date.now() + HORA, "employee");
      renovarToken.mockResolvedValueOnce({ access_token: nuevo, token_type: "bearer" });

      renderApp("/dashboard");
      await act(async () => {
        await jest.advanceTimersByTimeAsync(1000);
      });

      await waitFor(() =>
        expect(JSON.parse(localStorage.getItem("autobought-sesion"))).toEqual(
          expect.objectContaining({ token: nuevo, userType: "employee" })
        )
      );
      expect(rutaActual()).toBe("/dashboard");
      expectSinPedidosDeCliente();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("App con sesión de cliente o anónima", () => {
  it("keeps the dashboard closed to clients, who go back to the store", async () => {
    guardar(sesionDe("client", { nombre: "Ana" }));
    renderApp("/dashboard");

    await waitFor(() => expect(rutaActual()).toBe("/"));
    expect(screen.queryByRole("heading", { name: "Portal del vendedor" })).not.toBeInTheDocument();
  });

  it("sends an anonymous visitor from the dashboard to the login", async () => {
    renderApp("/dashboard");

    await waitFor(() => expect(rutaActual()).toBe("/login"));
  });

  it("leaves client routes as they were for clients", async () => {
    guardar(sesionDe("client", { nombre: "Ana" }));
    renderApp("/perfil");

    expect(await screen.findByRole("button", { name: "Cerrar sesión" })).toBeInTheDocument();
    expect(rutaActual()).toBe("/perfil");
  });

  it("sends anonymous visitors from private client routes to the login", async () => {
    renderApp("/favoritos");

    await waitFor(() => expect(rutaActual()).toBe("/login"));
  });

  it("keeps sending anonymous visitors from the cart to the login", async () => {
    renderApp("/carrito");

    await waitFor(() => expect(rutaActual()).toBe("/login"));
  });
});

describe("EmployeeRoute", () => {
  const renderRuta = (ruta) =>
    render(
      <MemoryRouter initialEntries={[ruta]}>
        <EmployeeRoute />
        <RutaActual />
      </MemoryRouter>
    );

  it("redirects anonymous users to the login", () => {
    renderRuta("/dashboard");

    expect(rutaActual()).toBe("/login");
  });

  it("redirects an expired seller session to the login", () => {
    guardar(sesionDe("employee", { token: crearToken(Date.now() - 1000, "employee") }));
    renderRuta("/dashboard");

    expect(rutaActual()).toBe("/login");
  });
});
