// Tests de la entrada del vendedor a la tienda y al portal.

import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";

jest.mock("./api", () => ({
  searchText: jest.fn(),
  login: jest.fn(),
  register: jest.fn(),
  getProfile: jest.fn(),
  renewToken: jest.fn(),
  onInvalidSession: jest.fn(),
  updateProfile: jest.fn(),
  changePassword: jest.fn(),
  getParts: jest.fn(),
  getPart: jest.fn(),
  getCategories: jest.fn(),
  getManufacturers: jest.fn(() => Promise.resolve([])),
  getCart: jest.fn(),
  addCartItem: jest.fn(),
  updateCartItem: jest.fn(),
  removeCartItem: jest.fn(),
  clearCartApi: jest.fn(),
  getBrands: jest.fn(),
  getModels: jest.fn(),
  getYears: jest.fn(),
  getBestSellers: jest.fn(),
  getAddresses: jest.fn(),
  createAddress: jest.fn(),
  setPrimaryAddress: jest.fn(),
  deleteAddressApi: jest.fn(),
  crearMetodoPago: jest.fn(),
  marcarMetodoPagoPrincipal: jest.fn(),
  eliminarMetodoPagoAPI: jest.fn(),
  getRecommendations: jest.fn(),
  getFavorites: jest.fn(),
  getStockAlerts: jest.fn(),
  addStockAlert: jest.fn(),
  removeStockAlert: jest.fn(),
  resendVerification: jest.fn(),
  getPurchaseHistory: jest.fn(),
  getPurchaseDetail: jest.fn(),
  addFavoriteApi: jest.fn(),
  removeFavoriteApi: jest.fn(),
}));
// El dashboard tiene sus propios tests (dashboard/*.test.jsx): acá alcanza
// con que responda vacío.
jest.mock("./dashboard/dashboardApi", () => ({
  getStock: jest.fn(() => Promise.resolve({ umbralStockBajo: 5, repuestos: [] })),
  getStockoutRisk: jest.fn(() =>
    Promise.resolve({ mes: "2026-11", umbrales: { alto: 15, medio: 30 }, repuestos: [] })
  ),
  getSalesTrend: jest.fn(() =>
    Promise.resolve({ meses: [], proyeccion: { mes: "2026-11", unidades: 0 } })
  ),
  getBestSellers: jest.fn(() => Promise.resolve([])),
  getOrders: jest.fn(() => Promise.resolve({ pedidos: [], total: 0, porEstado: {}, paraPreparar: 0 })),
  getAISummary: jest.fn(() => Promise.reject(Object.assign(new Error("No encontrado"), { status: 404 }))),
  unpublishedFeature: (error) => error?.status === 404,
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
import { createToken } from "./testTokens";
import toast from "react-hot-toast";
import { getStock } from "./dashboard/dashboardApi";
import {
  addCartItem,
  login,
  getCart,
  getCategories,
  getPurchaseDetail,
  getAddresses,
  getStockAlerts,
  getFavorites,
  getPurchaseHistory,
  getBrands,
  getBestSellers,
  getYears,
  getModels,
  getProfile,
  getRecommendations,
  getPart,
  getParts,
  renewToken,
} from "./api";
import { mapPart } from "./mapPart";

const HORA = 60 * 60 * 1000;
const emptyCart = { items: [], total: 0 };

const tokenDe = (tipo) => createToken(Date.now() + HORA, tipo);

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

// El dashboard se carga diferido (React.lazy). Se importa antes para que el
// primer test que lo abre no dependa de cuánto tarda en cargarse cuando la
// suite corre en paralelo.
beforeAll(() => import("./dashboard/Dashboard"));

// Aun con el módulo cargado, el primer dibujo del dashboard completo tarda en
// jsdom ~0,9 s (y ~2 s con la suite en paralelo y cobertura, como en CI): el
// segundo que espera findByRole por defecto no alcanza.
const esperarDashboard = () =>
  screen.findByRole("heading", { level: 1, name: "Resumen" }, { timeout: 4000 });

beforeEach(() => {
  getParts.mockResolvedValue([]);
  getCategories.mockResolvedValue([]);
  getCart.mockResolvedValue(emptyCart);
  addCartItem.mockResolvedValue(emptyCart);
  getBrands.mockResolvedValue([{ brand: "Volkswagen" }]);
  getModels.mockResolvedValue([]);
  getYears.mockResolvedValue([]);
  getBestSellers.mockResolvedValue([]);
  getAddresses.mockResolvedValue([]);
  getRecommendations.mockResolvedValue([]);
  getFavorites.mockResolvedValue([]);
  getStockAlerts.mockResolvedValue([]);
  getPurchaseHistory.mockResolvedValue([]);
  getPurchaseDetail.mockResolvedValue({});
  getProfile.mockResolvedValue({
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
  getProfile,
  getCart,
  getFavorites,
  getStockAlerts,
  getAddresses,
  getPurchaseHistory,
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
    await user.click(within(document.querySelector("form")).getByRole("button", { name: "Iniciar sesión" }));
  };

  it("sends a seller to the dashboard without asking for the client profile, cart or favorites", async () => {
    await iniciarSesion("employee");

    expect(await esperarDashboard()).toBeInTheDocument();
    expect(rutaActual()).toBe("/dashboard");
    expectSinPedidosDeCliente();

    const sesion = JSON.parse(sessionStorage.getItem("autobought-sesion"));
    expect(sesion).toEqual(
      expect.objectContaining({ userType: "employee", email: "alguien@example.com" })
    );
  });

  it("lets a seller in even if an old remembered session is still stored", async () => {
    // Sesión de cliente con «Recordarme» que ya venció: no tiene que tapar
    // a la del vendedor, que se guarda en sessionStorage.
    guardar(sesionDe("client", { token: createToken(Date.now() - HORA, "client") }));

    await iniciarSesion("employee");

    expect(await esperarDashboard()).toBeInTheDocument();
    expect(rutaActual()).toBe("/dashboard");
    expect(localStorage.getItem("autobought-sesion")).toBeNull();
  });

  it("keeps sending a client to the store and loads profile and cart as before", async () => {
    await iniciarSesion("client");

    await waitFor(() => expect(rutaActual()).toBe("/"));
    expect(getProfile).toHaveBeenCalled();
    expect(getCart).toHaveBeenCalled();
    await waitFor(() => expect(getFavorites).toHaveBeenCalled());
    await waitFor(() => expect(getStockAlerts).toHaveBeenCalled());
    expect(screen.queryByRole("heading", { level: 1, name: "Resumen" })).not.toBeInTheDocument();
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
    ["Mi perfil", "Direcciones", "Historial de compras"].forEach((nombre) =>
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

    const desplegable = screen.getByRole("button", { name: "Ver toda mi cuenta" }).closest("div.absolute");
    ["Mis compras", "Mis datos", "Direcciones", "Cerrar sesión"].forEach(
      (nombre) => expect(within(desplegable).getByRole("button", { name: nombre })).toBeInTheDocument()
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

  it("greets the seller in the dashboard, in its own portal, with the data from the API", async () => {
    renderApp("/dashboard");

    expect(await esperarDashboard()).toBeInTheDocument();
    expect(screen.getByText(/Hola, vendedor\./)).toBeInTheDocument();
    expect(await screen.findByText("No hay repuestos que requieran reposición")).toBeInTheDocument();
    expect(getStock).toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: "ABRIR DASHBOARD" })).not.toBeInTheDocument();
    // Su propio marco: sin el menú ni el footer de la tienda.
    expect(screen.getByRole("navigation", { name: "Secciones del dashboard" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Marcas" })).not.toBeInTheDocument();
    expect(screen.queryByText("Mi carrito")).not.toBeInTheDocument();
  });

  it("does not request profile, cart or favorites when the app loads", async () => {
    renderApp("/");

    await screen.findByTitle("Mi cuenta");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expectSinPedidosDeCliente();
  });

  it("does not request profile, cart or favorites when the seller opens the store", async () => {
    const user = userEvent.setup();
    getParts.mockResolvedValue([]);
    renderApp("/dashboard");

    await user.click(await screen.findByRole("button", { name: "Ver la tienda" }));
    await waitFor(() => expect(rutaActual()).toBe("/"));
    await user.click(await screen.findByRole("button", { name: "Repuestos" }));
    await waitFor(() => expect(rutaActual()).toBe("/catalogo"));

    expectSinPedidosDeCliente();
  });

  it("logs out from the seller menu, clears the session and leaves the dashboard", async () => {
    const user = userEvent.setup();
    renderApp("/dashboard");

    await user.click(await screen.findByRole("button", { name: "Cerrar sesión" }));

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
    "/pago?pedido=1",
    "/historial",
  ])("redirects the client route %s to the dashboard", async (ruta) => {
    renderApp(ruta);

    expect(await esperarDashboard()).toBeInTheDocument();
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
    expect(addCartItem).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it("renews the token keeping the seller user type, without client requests", async () => {
    jest.useFakeTimers();
    try {
      const sesion = sesionDe("employee", { token: createToken(Date.now() + 4 * 60 * 1000, "employee") });
      guardar(sesion);
      const nuevo = createToken(Date.now() + HORA, "employee");
      renewToken.mockResolvedValueOnce({ access_token: nuevo, token_type: "bearer" });

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
    expect(screen.queryByRole("heading", { level: 1, name: "Resumen" })).not.toBeInTheDocument();
    expect(getStock).not.toHaveBeenCalled();
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
    guardar(sesionDe("employee", { token: createToken(Date.now() - 1000, "employee") }));
    renderRuta("/dashboard");

    expect(rutaActual()).toBe("/login");
  });
});

describe("acciones de comprador según el rol", () => {
  const repuesto = (id, stock) =>
    mapPart({
      id,
      part_code: `FRE-00${id}`,
      name: `Pastillas ${id}`,
      manufacturer: "Bosch",
      category: "Frenos",
      price: 2500,
      stock,
      compatibilities: [],
    });

  // Los botones de la tarjeta y del detalle; el enlace «Mis favoritos» del
  // footer lleva al vendedor a su dashboard y no cuenta.
  const accionesDeComprador = () => [
    ...screen.queryAllByRole("button", { name: /^Agregar$|AGREGAR AL CARRITO|SIN STOCK/ }),
    ...screen.queryAllByRole("button", { name: /Marcar como favorito|Agregar a favoritos/ }),
    ...screen.queryAllByRole("button", { name: /Avisame cuando haya/ }),
  ];

  beforeEach(() => {
    getParts.mockResolvedValue([repuesto(1, 8), repuesto(2, 0)]);
    getPart.mockImplementation((id) => Promise.resolve(repuesto(Number(id), Number(id) === 1 ? 8 : 0)));
  });

  it("hides the cart, favorites and stock alert buttons from a seller in the catalog", async () => {
    guardar(sesionDe("employee"));
    renderApp("/catalogo");

    expect(await screen.findAllByRole("button", { name: /^Ver detalle de / })).toHaveLength(2);
    expect(accionesDeComprador()).toEqual([]);
  });

  it.each([
    ["with stock", "/producto/pastillas-1-1"],
    ["out of stock", "/producto/pastillas-2-2"],
  ])("hides them from a seller in the detail of a part %s", async (_, ruta) => {
    guardar(sesionDe("employee"));
    renderApp(ruta);

    expect(await screen.findByRole("heading", { level: 1, name: /Pastillas/ })).toBeInTheDocument();
    expect(accionesDeComprador()).toEqual([]);
    // El navbar recibe la sesión: muestra el menú del vendedor, no el login.
    expect(screen.queryByTitle("Carrito")).not.toBeInTheDocument();
  });

  it("keeps them for a client", async () => {
    guardar(sesionDe("client", { nombre: "Ana" }));
    renderApp("/catalogo");

    await screen.findAllByRole("button", { name: /^Ver detalle de / });
    expect(screen.getByRole("button", { name: "Agregar" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Marcar como favorito" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: /Avisame cuando haya/ })).toBeInTheDocument();
  });
});
