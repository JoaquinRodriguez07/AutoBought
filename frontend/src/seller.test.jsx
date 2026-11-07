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
  createPaymentMethod: jest.fn(),
  markMethodPaymentPrimary: jest.fn(),
  deleteMethodPaymentApi: jest.fn(),
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
  getStock: jest.fn(() => Promise.resolve({ thresholdStockLow: 5, repuestos: [] })),
  getStockoutRisk: jest.fn(() =>
    Promise.resolve({ month: "2026-11", umbrales: { high: 15, medium: 30 }, repuestos: [] })
  ),
  getSalesTrend: jest.fn(() =>
    Promise.resolve({ months: [], forecast: { month: "2026-11", units: 0 } })
  ),
  getBestSellers: jest.fn(() => Promise.resolve([])),
  getOrders: jest.fn(() => Promise.resolve({ orders: [], total: 0, byStatus: {}, forPrepare: 0 })),
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

const tokenOf = (tipo) => createToken(Date.now() + HORA, tipo);

const sessionOf = (tipo, extra = {}) => ({
  token: tokenOf(tipo),
  tokenType: "bearer",
  userId: "1",
  userType: tipo,
  email: tipo === "employee" ? "vendedor@example.com" : "ana@example.com",
  ...extra,
});

const save = (session) =>
  localStorage.setItem("autobought-sesion", JSON.stringify(session));

function CurrentRoute() {
  const location = useLocation();
  return <p data-testid="ruta-actual">{location.pathname}</p>;
}

function renderApp(route = "/") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <CartProvider>
        <VehicleProvider>
          <PitProvider>
            <App />
            <CurrentRoute />
          </PitProvider>
        </VehicleProvider>
      </CartProvider>
    </MemoryRouter>
  );
}

const currentRoute = () => screen.getByTestId("ruta-actual").textContent;

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
    displayName: "Ana Gomez",
    lastName: "",
    email: "ana@example.com",
    phone: "",
  });
});

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  jest.clearAllMocks();
});

// Ninguno de estos pedidos le corresponde a un vendedor (responden 403).
const ordersCustomer = () => [
  getProfile,
  getCart,
  getFavorites,
  getStockAlerts,
  getAddresses,
  getPurchaseHistory,
];

const customerExpectWithoutOrders = () => {
  ordersCustomer().forEach((pedido) => expect(pedido).not.toHaveBeenCalled());
};

describe("login según el tipo de usuario", () => {
  const startSession = async (tipo) => {
    const user = userEvent.setup();
    login.mockResolvedValue({ access_token: tokenOf(tipo), token_type: "bearer" });

    renderApp("/login");
    await user.type(screen.getByPlaceholderText("tu@email.com"), "alguien@example.com");
    await user.type(screen.getByPlaceholderText("••••••••"), "secreto123");
    await user.click(within(document.querySelector("form")).getByRole("button", { name: "Iniciar sesión" }));
  };

  it("sends a seller to the dashboard without asking for the client profile, cart or favorites", async () => {
    await startSession("employee");

    expect(await esperarDashboard()).toBeInTheDocument();
    expect(currentRoute()).toBe("/dashboard");
    customerExpectWithoutOrders();

    const session = JSON.parse(sessionStorage.getItem("autobought-sesion"));
    expect(session).toEqual(
      expect.objectContaining({ userType: "employee", email: "alguien@example.com" })
    );
  });

  it("lets a seller in even if an old remembered session is still stored", async () => {
    // Sesión de cliente con «Recordarme» que ya venció: no tiene que tapar
    // a la del vendedor, que se guarda en sessionStorage.
    save(sessionOf("client", { token: createToken(Date.now() - HORA, "client") }));

    await startSession("employee");

    expect(await esperarDashboard()).toBeInTheDocument();
    expect(currentRoute()).toBe("/dashboard");
    expect(localStorage.getItem("autobought-sesion")).toBeNull();
  });

  it("keeps sending a client to the store and loads profile and cart as before", async () => {
    await startSession("client");

    await waitFor(() => expect(currentRoute()).toBe("/"));
    expect(getProfile).toHaveBeenCalled();
    expect(getCart).toHaveBeenCalled();
    await waitFor(() => expect(getFavorites).toHaveBeenCalled());
    await waitFor(() => expect(getStockAlerts).toHaveBeenCalled());
    expect(screen.queryByRole("heading", { level: 1, name: "Resumen" })).not.toBeInTheDocument();
  });
});

describe("Navbar según el perfil", () => {
  const renderNavbar = (sessionUser) =>
    render(
      <MemoryRouter>
        <CartProvider>
          <Navbar
            currentPage="home"
            sessionUser={sessionUser}
            onHome={jest.fn()}
            onCatalogo={jest.fn()}
            onLogin={jest.fn()}
            onBrands={jest.fn()}
            onCart={jest.fn()}
            onFavorites={jest.fn()}
            onProfile={jest.fn()}
            onAddresses={jest.fn()}
            onHistory={jest.fn()}
            onCloseSession={jest.fn()}
          />
          <CurrentRoute />
        </CartProvider>
      </MemoryRouter>
    );

  it("shows a seller only Dashboard and Cerrar sesión, with no cart, favorites or client items", async () => {
    const user = userEvent.setup();
    renderNavbar(sessionOf("employee"));

    expect(screen.queryByTitle("Carrito")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Favoritos")).not.toBeInTheDocument();

    await user.click(screen.getByTitle("Mi cuenta"));

    expect(screen.getByRole("button", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeInTheDocument();
    expect(screen.getByText("vendedor@example.com")).toBeInTheDocument();
    ["Mi perfil", "Direcciones", "Historial de compras"].forEach((displayName) =>
      expect(screen.queryByRole("button", { name: displayName })).not.toBeInTheDocument()
    );
  });

  it("takes a seller to the dashboard from the menu", async () => {
    const user = userEvent.setup();
    renderNavbar(sessionOf("employee"));

    await user.click(screen.getByTitle("Mi cuenta"));
    await user.click(screen.getByRole("button", { name: "Dashboard" }));

    expect(currentRoute()).toBe("/dashboard");
  });

  it("shows a client the cart, favorites and account items, without a dashboard link", async () => {
    const user = userEvent.setup();
    renderNavbar(sessionOf("client", { displayName: "Ana" }));

    expect(screen.getByTitle("Carrito")).toBeInTheDocument();
    expect(screen.getByTitle("Favoritos")).toBeInTheDocument();

    await user.click(screen.getByTitle("Mi cuenta"));

    const dropdown = screen.getByRole("button", { name: "Ver toda mi cuenta" }).closest("div.absolute");
    ["Mis compras", "Mis datos", "Direcciones", "Cerrar sesión"].forEach(
      (displayName) => expect(within(dropdown).getByRole("button", { name: displayName })).toBeInTheDocument()
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
  beforeEach(() => save(sessionOf("employee")));

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

    customerExpectWithoutOrders();
  });

  it("does not request profile, cart or favorites when the seller opens the store", async () => {
    const user = userEvent.setup();
    getParts.mockResolvedValue([]);
    renderApp("/dashboard");

    await user.click(await screen.findByRole("button", { name: "Ver la tienda" }));
    await waitFor(() => expect(currentRoute()).toBe("/"));
    await user.click(await screen.findByRole("button", { name: "Repuestos" }));
    await waitFor(() => expect(currentRoute()).toBe("/catalogo"));

    customerExpectWithoutOrders();
  });

  it("logs out from the seller menu, clears the session and leaves the dashboard", async () => {
    const user = userEvent.setup();
    renderApp("/dashboard");

    await user.click(await screen.findByRole("button", { name: "Cerrar sesión" }));

    // Igual que cerrar sesión en /carrito: el guard ve que ya no hay sesión
    // y manda al login antes de que se aplique la navegación a "/".
    await waitFor(() => expect(currentRoute()).not.toBe("/dashboard"));
    expect(localStorage.getItem("autobought-sesion")).toBeNull();
  });

  it.each([
    "/carrito",
    "/favoritos",
    "/perfil",
    "/direcciones",
    "/pago?pedido=1",
    "/historial",
  ])("redirects the client route %s to the dashboard", async (route) => {
    renderApp(route);

    expect(await esperarDashboard()).toBeInTheDocument();
    expect(currentRoute()).toBe("/dashboard");
    customerExpectWithoutOrders();
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

    const added = await addToCart({ id: "BP1234", stock: 3 });

    expect(added).toBe(false);
    expect(addCartItem).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it("renews the token keeping the seller user type, without client requests", async () => {
    jest.useFakeTimers();
    try {
      const session = sessionOf("employee", { token: createToken(Date.now() + 4 * 60 * 1000, "employee") });
      save(session);
      const newItem = createToken(Date.now() + HORA, "employee");
      renewToken.mockResolvedValueOnce({ access_token: newItem, token_type: "bearer" });

      renderApp("/dashboard");
      await act(async () => {
        await jest.advanceTimersByTimeAsync(1000);
      });

      await waitFor(() =>
        expect(JSON.parse(localStorage.getItem("autobought-sesion"))).toEqual(
          expect.objectContaining({ token: newItem, userType: "employee" })
        )
      );
      expect(currentRoute()).toBe("/dashboard");
      customerExpectWithoutOrders();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("App con sesión de cliente o anónima", () => {
  it("keeps the dashboard closed to clients, who go back to the store", async () => {
    save(sessionOf("client", { displayName: "Ana" }));
    renderApp("/dashboard");

    await waitFor(() => expect(currentRoute()).toBe("/"));
    expect(screen.queryByRole("heading", { level: 1, name: "Resumen" })).not.toBeInTheDocument();
    expect(getStock).not.toHaveBeenCalled();
  });

  it("sends an anonymous visitor from the dashboard to the login", async () => {
    renderApp("/dashboard");

    await waitFor(() => expect(currentRoute()).toBe("/login"));
  });

  it("leaves client routes as they were for clients", async () => {
    save(sessionOf("client", { displayName: "Ana" }));
    renderApp("/perfil");

    expect(await screen.findByRole("button", { name: "Cerrar sesión" })).toBeInTheDocument();
    expect(currentRoute()).toBe("/perfil");
  });

  it("sends anonymous visitors from private client routes to the login", async () => {
    renderApp("/favoritos");

    await waitFor(() => expect(currentRoute()).toBe("/login"));
  });

  it("keeps sending anonymous visitors from the cart to the login", async () => {
    renderApp("/carrito");

    await waitFor(() => expect(currentRoute()).toBe("/login"));
  });
});

describe("EmployeeRoute", () => {
  const renderRoute = (route) =>
    render(
      <MemoryRouter initialEntries={[route]}>
        <EmployeeRoute />
        <CurrentRoute />
      </MemoryRouter>
    );

  it("redirects anonymous users to the login", () => {
    renderRoute("/dashboard");

    expect(currentRoute()).toBe("/login");
  });

  it("redirects an expired seller session to the login", () => {
    save(sessionOf("employee", { token: createToken(Date.now() - 1000, "employee") }));
    renderRoute("/dashboard");

    expect(currentRoute()).toBe("/login");
  });
});

describe("acciones de comprador según el rol", () => {
  const part = (id, stock) =>
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
  const buyerActions = () => [
    ...screen.queryAllByRole("button", { name: /^Agregar$|AGREGAR AL CARRITO|SIN STOCK/ }),
    ...screen.queryAllByRole("button", { name: /Marcar como favorito|Agregar a favoritos/ }),
    ...screen.queryAllByRole("button", { name: /Avisame cuando haya/ }),
  ];

  beforeEach(() => {
    getParts.mockResolvedValue([part(1, 8), part(2, 0)]);
    getPart.mockImplementation((id) => Promise.resolve(part(Number(id), Number(id) === 1 ? 8 : 0)));
  });

  it("hides the cart, favorites and stock alert buttons from a seller in the catalog", async () => {
    save(sessionOf("employee"));
    renderApp("/catalogo");

    expect(await screen.findAllByRole("button", { name: /^Ver detalle de / })).toHaveLength(2);
    expect(buyerActions()).toEqual([]);
  });

  it.each([
    ["with stock", "/producto/pastillas-1-1"],
    ["out of stock", "/producto/pastillas-2-2"],
  ])("hides them from a seller in the detail of a part %s", async (_, route) => {
    save(sessionOf("employee"));
    renderApp(route);

    expect(await screen.findByRole("heading", { level: 1, name: /Pastillas/ })).toBeInTheDocument();
    expect(buyerActions()).toEqual([]);
    // El navbar recibe la sesión: muestra el menú del vendedor, no el login.
    expect(screen.queryByTitle("Carrito")).not.toBeInTheDocument();
  });

  it("keeps them for a client", async () => {
    save(sessionOf("client", { displayName: "Ana" }));
    renderApp("/catalogo");

    await screen.findAllByRole("button", { name: /^Ver detalle de / });
    expect(screen.getByRole("button", { name: "Agregar" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Marcar como favorito" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: /Avisame cuando haya/ })).toBeInTheDocument();
  });
});
