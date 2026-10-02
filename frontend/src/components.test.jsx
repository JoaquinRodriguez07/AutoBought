import { fireEvent, render as renderBase, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

jest.mock("./api", () => ({
  login: jest.fn(),
  obtenerRepuestos: jest.fn(),
  obtenerCategorias: jest.fn(),
  obtenerCarrito: jest.fn(),
  agregarItemCarrito: jest.fn(),
  actualizarItemCarrito: jest.fn(),
  eliminarItemCarrito: jest.fn(),
  vaciarCarritoAPI: jest.fn(),
  obtenerMarcas: jest.fn(),
  obtenerModelos: jest.fn(),
  obtenerDirecciones: jest.fn(),
  crearDireccion: jest.fn(),
  marcarDireccionPrincipal: jest.fn(),
  eliminarDireccionAPI: jest.fn(),
  obtenerMetodosPago: jest.fn(),
  crearMetodoPago: jest.fn(),
  marcarMetodoPagoPrincipal: jest.fn(),
  eliminarMetodoPagoAPI: jest.fn(),
  obtenerRecomendaciones: jest.fn(),
}));
jest.mock(
  "react-hot-toast",
  () => ({ __esModule: true, default: { error: jest.fn() } }),
  { virtual: true }
);

import App from "./App";
import BrandDropdown from "./BrandDropdown";
import Carrito from "./Carrito";
import Catalogo from "./Catalogo";
import DetalleProducto from "./DetalleProducto";
import Favoritos from "./Favoritos";
import Home from "./Home";
import Login from "./Login";
import Marcas from "./Marcas";
import MetodosPago from "./MetodosPago";
import ModelDropdown from "./ModelDropdown";
import Navbar from "./Navbar";
import Perfil from "./Perfil";
import Registro from "./Registro";
import Direcciones from "./Direcciones";
import HistorialCompras from "./HistorialCompras";
import ProtectedRoute from "./ProtectedRoute";
import SearchBar from "./SearchBar";
import SinResultadosBusqueda from "./SinResultadosBusqueda";
import { CartProvider } from "./context/CartContext";
import { filtrarRepuestos } from "./filtrarRepuestos";
import {
  agregarItemCarrito,
  actualizarItemCarrito,
  crearDireccion,
  crearMetodoPago,
  eliminarDireccionAPI,
  eliminarItemCarrito,
  eliminarMetodoPagoAPI,
  login,
  marcarDireccionPrincipal,
  marcarMetodoPagoPrincipal,
  obtenerCarrito,
  obtenerCategorias,
  obtenerDirecciones,
  obtenerMarcas,
  obtenerMetodosPago,
  obtenerModelos,
  obtenerRepuestos,
  obtenerRecomendaciones,
  vaciarCarritoAPI,
} from "./api";
import {
  decodeToken,
  haySesionActiva,
  obtenerSesion,
  sesionValida,
} from "./auth";

const navigationProps = () => ({
  onHome: jest.fn(),
  onCatalogo: jest.fn(),
  onLogin: jest.fn(),
  onMarcas: jest.fn(),
  onCarrito: jest.fn(),
  onFavoritos: jest.fn(),
  cantidadCarrito: 0,
  cantidadFavoritos: 0,
});

const product = {
  id: "TEST-001",
  marca: "BOSCH",
  nombre: "Pastillas de prueba",
  codigo: "TEST-001",
  precio: 1500,
  categoria: "Frenos",
  imagen: "test-image.jpg",
  descripcion: "Descripcion de prueba",
  stock: 5,
  especificaciones: [["Material", "Semi-metalico"]],
  aplicaciones: ["Volkswagen Gol"],
  garantia: "6 meses",
  opiniones: [{ nombre: "Ana", estrellas: 5, texto: "Excelente" }],
};

const catalogProducts = [
  {
    ...product,
    id: "BP1234",
    codigo: "BP1234",
    nombre: "Pastillas de Freno Delanteras Bosch",
    marca: "Bosch",
    categoria: "Frenos",
  },
  {
    ...product,
    id: "DB5678",
    codigo: "DB5678",
    nombre: "Discos de Freno Delanteros",
    marca: "Brembo",
    categoria: "Frenos",
  },
  {
    ...product,
    id: "FA9012",
    codigo: "FA9012",
    nombre: "Filtro de Aire",
    marca: "Mann",
    categoria: "Motor",
  },
];

const emptyCart = { items: [], total: 0 };
const originalFetch = global.fetch;

const startClientSession = () => {
  localStorage.setItem(
    "autobought-sesion",
    JSON.stringify({ id: 1, nombre: "Test User" })
  );
};

/**
 * Renders test UI inside a memory router and cart provider.
 * @param {import("react").ReactNode} ui - UI to render with the shared providers.
 * @param {import("@testing-library/react").RenderOptions} [options] - Options
 * forwarded to React Testing Library's render function.
 * @returns {import("@testing-library/react").RenderResult} Queries and render utilities.
 */
function render(ui, options) {
  return renderBase(
    <MemoryRouter>
      <CartProvider>{ui}</CartProvider>
    </MemoryRouter>,
    options
  );
}

beforeEach(() => {
  obtenerRepuestos.mockImplementation(({ categoria } = {}) =>
    Promise.resolve(
      categoria
        ? catalogProducts.filter((item) => item.categoria === categoria)
        : catalogProducts
    )
  );
  obtenerCategorias.mockResolvedValue([
    { nombre: "Frenos", cantidad: 2 },
    { nombre: "Motor", cantidad: 1 },
  ]);
  obtenerCarrito.mockResolvedValue(emptyCart);
  agregarItemCarrito.mockResolvedValue(emptyCart);
  actualizarItemCarrito.mockResolvedValue(emptyCart);
  eliminarItemCarrito.mockResolvedValue(emptyCart);
  vaciarCarritoAPI.mockResolvedValue(emptyCart);
  obtenerMarcas.mockResolvedValue([{ brand: "Volkswagen" }]);
  obtenerModelos.mockResolvedValue([]);
  obtenerDirecciones.mockResolvedValue([]);
  crearDireccion.mockResolvedValue({});
  marcarDireccionPrincipal.mockResolvedValue({});
  eliminarDireccionAPI.mockResolvedValue({});
  obtenerMetodosPago.mockResolvedValue([]);
  crearMetodoPago.mockResolvedValue({});
  marcarMetodoPagoPrincipal.mockResolvedValue({});
  eliminarMetodoPagoAPI.mockResolvedValue({});
  obtenerRecomendaciones.mockResolvedValue([]);
});

afterEach(() => {
  global.fetch = originalFetch;
  localStorage.clear();
  sessionStorage.clear();
  jest.clearAllMocks();
});

describe("Navbar", () => {
  it("calls navigation handlers and displays the cart count", async () => {
    const user = userEvent.setup();
    const props = navigationProps();
    localStorage.setItem("autobought-sesion", JSON.stringify({ nombre: "Ana" }));
    obtenerCarrito.mockResolvedValue({ items: [{ ...product, cantidad: 2 }], total: 3000 });

    render(<Navbar paginaActual="home" {...props} />);

    await user.click(screen.getByRole("button", { name: "Home" }));
    await user.click(screen.getByRole("button", { name: "Marcas" }));
    await user.click(screen.getByRole("button", { name: "Repuestos" }));
    await user.click(screen.getByTitle("Iniciar sesión"));
    await user.click(screen.getByTitle("Favoritos"));
    await user.click(screen.getByTitle("Carrito"));

    expect(props.onHome).toHaveBeenCalled();
    expect(props.onMarcas).toHaveBeenCalled();
    expect(props.onCatalogo).toHaveBeenCalledWith();
    expect(props.onLogin).toHaveBeenCalled();
    expect(props.onFavoritos).toHaveBeenCalled();
    expect(props.onCarrito).toHaveBeenCalled();
    expect(await screen.findByText("2")).toBeInTheDocument();
  });

  it("opens the authenticated account menu and closes it outside the menu", async () => {
    const user = userEvent.setup();
    const props = navigationProps();
    props.onPerfil = jest.fn();
    props.onDirecciones = jest.fn();
    props.onMetodosPago = jest.fn();
    props.onHistorial = jest.fn();
    props.onCerrarSesion = jest.fn();

    render(
      <Navbar
        paginaActual="home"
        usuario={{ nombre: "Ana", apellido: "Perez", email: "ana@example.com" }}
        {...props}
      />
    );

    await user.click(screen.getByTitle("Mi cuenta"));
    expect(screen.getByText("Ana Perez")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mi perfil" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Mi perfil" }));
    expect(props.onPerfil).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Mi perfil" })).not.toBeInTheDocument();

    await user.click(screen.getByTitle("Mi cuenta"));
    await user.click(screen.getByRole("button", { name: "Direcciones" }));
    expect(props.onDirecciones).toHaveBeenCalled();
    await user.click(screen.getByTitle("Mi cuenta"));
    await user.click(screen.getByRole("button", { name: "Métodos de pago" }));
    expect(props.onMetodosPago).toHaveBeenCalled();
    await user.click(screen.getByTitle("Mi cuenta"));
    await user.click(screen.getByRole("button", { name: "Historial de compras" }));
    expect(props.onHistorial).toHaveBeenCalled();
    await user.click(screen.getByTitle("Mi cuenta"));
    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    expect(props.onCerrarSesion).toHaveBeenCalled();

    await user.click(screen.getByTitle("Mi cuenta"));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("button", { name: "Mi perfil" })).not.toBeInTheDocument();
  });
});

describe("Home", () => {
  it("renders the hero and opens the catalog from the search button", async () => {
    const user = userEvent.setup();
    const props = navigationProps();

    render(<Home {...props} />);

    expect(screen.getByRole("heading", { name: /repuestos que te/i })).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: /buscar repuestos/i })[0]);

    expect(props.onCatalogo).toHaveBeenCalledWith(null, {
      brand: "",
      model: "",
      year: "",
    });
  });

  it("loads model and year options and searches with the selected vehicle", async () => {
    const user = userEvent.setup();
    const props = navigationProps();
    obtenerModelos.mockResolvedValue(["Golf", "Polo"]);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ years: [2020, 2021] }),
    });

    render(<Home {...props} />);

    const [brandSelect, modelSelect, yearSelect] = screen.getAllByRole("combobox");
    expect(await screen.findByRole("option", { name: "Volkswagen" })).toBeInTheDocument();
    await user.selectOptions(brandSelect, "Volkswagen");
    expect(await screen.findByRole("option", { name: "Golf" })).toBeInTheDocument();
    expect(obtenerModelos).toHaveBeenCalledWith("Volkswagen");

    await user.selectOptions(modelSelect, "Golf");
    expect(await screen.findByRole("option", { name: "2020" })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/v1/years?brand=Volkswagen&model=Golf");

    await user.selectOptions(yearSelect, "2021");
    await user.click(screen.getByRole("button", { name: /^BUSCAR REPUESTOS$/i }));

    expect(props.onCatalogo).toHaveBeenCalledWith(null, {
      brand: "Volkswagen",
      model: "Golf",
      year: "2021",
    });
  });

  it("passes the selected backend category to the catalog", async () => {
    const user = userEvent.setup();
    const props = navigationProps();

    render(<Home {...props} />);

    await user.click(await screen.findByRole("button", { name: "Motor" }));

    expect(props.onCatalogo).toHaveBeenCalledWith("Motor");
  });

  it("keeps the landing page available when categories fail to load", async () => {
    const props = navigationProps();
    obtenerCategorias.mockRejectedValue(new Error("API unavailable"));

    render(<Home {...props} />);

    expect(await screen.findByRole("heading", { name: /encontrá lo que necesitás/i }))
      .toBeInTheDocument();
    expect(screen.queryByText("Cargando categorías…")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Frenos" })).not.toBeInTheDocument();
  });
});

describe("BrandDropdown", () => {
  it("loads available brands and reports the selected value", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    obtenerMarcas.mockResolvedValue([
      { brand: "Volkswagen" },
      { brand: "Toyota" },
    ]);

    render(<BrandDropdown value="Toyota" onChange={onChange} />);

    const select = screen.getByRole("combobox");
    expect(await screen.findByRole("option", { name: "Volkswagen" }))
      .toBeInTheDocument();
    expect(select).toHaveValue("Toyota");
    expect(screen.getByRole("option", { name: "Toyota" })).toBeInTheDocument();
    expect(obtenerMarcas).toHaveBeenCalledTimes(1);

    await user.selectOptions(select, "Volkswagen");
    expect(onChange).toHaveBeenCalledWith("Volkswagen");
  });

  it("logs a brand lookup failure and keeps the placeholder available", async () => {
    const error = new Error("Brands unavailable");
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    obtenerMarcas.mockRejectedValue(error);

    render(<BrandDropdown value="" onChange={jest.fn()} />);

    expect(await screen.findByRole("option", { name: "Selecciona tu Marca" }))
      .toBeInTheDocument();
    await waitFor(() => expect(consoleError).toHaveBeenCalledWith(
      "Error fetching brands:",
      error
    ));
    expect(screen.getAllByRole("option")).toHaveLength(1);
  });
});

describe("ModelDropdown", () => {
  it("disables selection without a brand and loads options when a brand is selected", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    obtenerModelos.mockResolvedValue(["Corolla", "Yaris"]);
    const { rerender } = render(
      <ModelDropdown brand="" value="" onChange={onChange} />
    );

    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(screen.getByRole("option", { name: "Selecciona una Marca primero" }))
      .toBeInTheDocument();
    expect(obtenerModelos).not.toHaveBeenCalled();

    rerender(
      <MemoryRouter>
        <CartProvider>
          <ModelDropdown brand="Toyota" value="" onChange={onChange} />
        </CartProvider>
      </MemoryRouter>
    );

    expect(await screen.findByRole("option", { name: "Corolla" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Yaris" })).toBeInTheDocument();
    const loadedSelect = screen.getByRole("combobox");
    expect(loadedSelect).toBeEnabled();
    expect(obtenerModelos).toHaveBeenCalledWith("Toyota");

    await user.selectOptions(loadedSelect, "Corolla");
    expect(onChange).toHaveBeenCalledWith("Corolla");
  });

  it("logs a model lookup failure and leaves only the placeholder option", async () => {
    const error = new Error("Models unavailable");
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    obtenerModelos.mockRejectedValue(error);

    render(<ModelDropdown brand="Toyota" value="" onChange={jest.fn()} />);

    expect(await screen.findByRole("option", { name: "Selecciona tu Modelo" }))
      .toBeInTheDocument();
    await waitFor(() => expect(consoleError).toHaveBeenCalledWith(
      "Error fetching models:",
      error
    ));
    expect(screen.getAllByRole("option")).toHaveLength(1);
  });
});

describe("Catalogo", () => {
  it("filters products and adds the selected quantity to the cart", async () => {
    const user = userEvent.setup();
    const props = navigationProps();
    props.onAlternarFavorito = jest.fn();
    props.onDetalle = jest.fn();
    props.esFavorito = jest.fn(() => false);

    startClientSession();
    render(<Catalogo {...props} categoriaInicial="Frenos" />);

    expect(await screen.findByText("Pastillas de Freno Delanteras Bosch")).toBeInTheDocument();
    const search = screen.getByPlaceholderText(/buscar repuesto/i);
    await user.type(search, "Brembo");

    expect(await screen.findByText("Discos de Freno Delanteros")).toBeInTheDocument();
    expect(screen.queryByText("Pastillas de Freno Delanteras Bosch")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "+" }));
    await user.click(screen.getByRole("button", { name: /agregar/i }));

    await waitFor(() => expect(agregarItemCarrito).toHaveBeenCalledWith("DB5678", 2));
  });

  it("changes category and toggles a product favorite", async () => {
    const user = userEvent.setup();
    const props = navigationProps();
    props.onAlternarFavorito = jest.fn();
    props.onDetalle = jest.fn();
    props.esFavorito = jest.fn(() => false);

    render(<Catalogo {...props} categoriaInicial="Frenos" />);

    await user.click(await screen.findByRole("button", { name: /Motor/ }));
    expect(await screen.findByText("Filtro de Aire")).toBeInTheDocument();
    await waitFor(() => {
      expect(obtenerRepuestos).toHaveBeenCalledWith(
        expect.objectContaining({ categoria: "Motor" })
      );
    });
    const favoriteButtons = screen.getAllByRole("button", { name: "♡" });
    await user.click(favoriteButtons[favoriteButtons.length - 1]);

    expect(props.onAlternarFavorito).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: "Filtro de Aire" })
    );
  });

  it("shows an API error and retries the catalog request", async () => {
    const user = userEvent.setup();
    obtenerRepuestos
      .mockRejectedValueOnce(new Error("No pudimos cargar los repuestos."))
      .mockResolvedValueOnce(catalogProducts);

    render(
      <Catalogo
        {...navigationProps()}
        categoriaInicial="Frenos"
        esFavorito={() => false}
      />
    );

    expect(await screen.findByText("No pudimos cargar los repuestos.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("Pastillas de Freno Delanteras Bosch")).toBeInTheDocument();
    expect(obtenerRepuestos).toHaveBeenCalledTimes(2);
  });
});

describe("DetalleProducto", () => {
  it("changes quantity, adds the product, and switches detail tabs", async () => {
    const user = userEvent.setup();
    const props = navigationProps();
    props.onAlternarFavorito = jest.fn();
    props.esFavorito = jest.fn(() => false);

    startClientSession();
    render(<DetalleProducto {...props} producto={product} />);

    await user.click(screen.getByRole("button", { name: "+" }));
    await user.click(screen.getByRole("button", { name: /agregar al carrito/i }));
    await user.click(screen.getByRole("button", { name: "Especificaciones" }));

    await waitFor(() => expect(agregarItemCarrito).toHaveBeenCalledWith("TEST-001", 2));
    expect(screen.getByText("Especificaciones técnicas")).toBeInTheDocument();
    expect(screen.getByText("Semi-metalico")).toBeInTheDocument();
  });
});

describe("Carrito", () => {
  it("renders an empty state and navigates to the catalog", async () => {
    const user = userEvent.setup();
    const props = navigationProps();

    render(<Carrito {...props} />);
    await user.click(screen.getByRole("button", { name: /ver repuestos/i }));

    expect(screen.getByText("Tu carrito está vacío")).toBeInTheDocument();
    expect(props.onCatalogo).toHaveBeenCalledWith();
  });

  it("loads the server cart and updates quantity and removal through the API", async () => {
    const user = userEvent.setup();
    const props = navigationProps();
    props.onDetalle = jest.fn();
    const cartProduct = { ...product, cantidad: 2 };

    startClientSession();
    obtenerCarrito.mockResolvedValue({ items: [cartProduct], total: 3000 });
    actualizarItemCarrito.mockImplementation(async (_id, cantidad) => ({
      items: [{ ...product, cantidad }],
      total: 1500 * cantidad,
    }));
    render(<Carrito {...props} />);
    expect(await screen.findByText(product.nombre)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "+" }));
    expect(await screen.findAllByText("3", { exact: true })).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "−" }));
    expect(await screen.findAllByText("2", { exact: true })).toHaveLength(2);
    expect(screen.getAllByText("$3.000")).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: "🗑" }));

    expect(actualizarItemCarrito).toHaveBeenNthCalledWith(1, "TEST-001", 3);
    expect(actualizarItemCarrito).toHaveBeenNthCalledWith(2, "TEST-001", 2);
    expect(eliminarItemCarrito).toHaveBeenCalledWith("TEST-001");
    expect(await screen.findByText("Tu carrito está vacío")).toBeInTheDocument();
  });

  it("clears a populated cart through the API", async () => {
    const user = userEvent.setup();
    startClientSession();
    obtenerCarrito.mockResolvedValue({
      items: [{ ...product, cantidad: 1 }],
      total: product.precio,
    });
    render(<Carrito {...navigationProps()} />);

    await user.click(await screen.findByRole("button", { name: /vaciar carrito/i }));

    expect(vaciarCarritoAPI).toHaveBeenCalled();
    expect(await screen.findByText("Tu carrito está vacío")).toBeInTheDocument();
  });
});

describe("Favoritos", () => {
  it("renders the empty state and opens the catalog", async () => {
    const user = userEvent.setup();
    const props = navigationProps();

    render(<Favoritos {...props} favoritos={[]} />);
    await user.click(screen.getByRole("button", { name: /explorar repuestos/i }));

    expect(screen.getByText("Todavía no tenés favoritos")).toBeInTheDocument();
    expect(props.onCatalogo).toHaveBeenCalledWith();
  });

  it("renders favorites and supports remove, detail, and add actions", async () => {
    const user = userEvent.setup();
    const props = navigationProps();
    props.onAlternarFavorito = jest.fn();
    props.onDetalle = jest.fn();

    startClientSession();
    render(<Favoritos {...props} favoritos={[product]} />);
    const favoriteButtons = screen.getAllByRole("button", { name: "♥" });
    await user.click(favoriteButtons[favoriteButtons.length - 1]);
    await user.click(screen.getByRole("button", { name: product.nombre }));
    await user.click(screen.getByRole("button", { name: /agregar al carrito/i }));

    expect(props.onAlternarFavorito).toHaveBeenCalledWith(product);
    expect(props.onDetalle).toHaveBeenCalledWith(product);
    await waitFor(() => expect(agregarItemCarrito).toHaveBeenCalledWith("TEST-001", 1));
  });
});

describe("Login", () => {
  it("toggles password visibility and remembers the user selection", async () => {
    const user = userEvent.setup();
    render(<Login {...navigationProps()} />);

    const password = screen.getByPlaceholderText("••••••••");
    expect(password).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "○" }));
    expect(password).toHaveAttribute("type", "text");

    const remember = screen.getByRole("checkbox");
    await user.click(remember);
    expect(remember).toBeChecked();
  });

  it("validates credentials and completes a successful login", async () => {
    const user = userEvent.setup();
    const props = navigationProps();
    props.onIniciarSesion = jest.fn();
    const payload = btoa(
      JSON.stringify({ sub: "7", user_type: "client", exp: Math.floor(Date.now() / 1000) + 3600 })
    );
    login.mockResolvedValue({
      access_token: `header.${payload}.signature`,
      token_type: "bearer",
    });

    render(<Login {...props} onRegistro={jest.fn()} />);
    await user.click(screen.getByRole("button", { name: "INICIAR SESIÓN" }));
    expect(screen.getByText("Completá el correo electrónico y la contraseña.")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("tu@email.com"), "client@example.com");
    await user.type(screen.getByPlaceholderText("••••••••"), "secret");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "INICIAR SESIÓN" }));

    await waitFor(() => expect(props.onIniciarSesion).toHaveBeenCalledWith(
      expect.objectContaining({ email: "client@example.com", userId: "7" }),
      true
    ));
  });

  it("shows the API error when login fails and forwards registration", async () => {
    const user = userEvent.setup();
    const props = navigationProps();
    props.onRegistro = jest.fn();
    login.mockRejectedValue(new Error("Credenciales inválidas"));

    render(<Login {...props} />);
    await user.type(screen.getByPlaceholderText("tu@email.com"), "wrong@example.com");
    await user.type(screen.getByPlaceholderText("••••••••"), "wrong");
    await user.click(screen.getByRole("button", { name: "INICIAR SESIÓN" }));

    expect(await screen.findByText("Credenciales inválidas")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Registrate" }));
    expect(props.onRegistro).toHaveBeenCalled();
  });
});

describe("Authentication helpers", () => {
  it("decodes valid tokens and rejects invalid or expired sessions", () => {
    const payload = btoa(JSON.stringify({ sub: "1", exp: Math.floor(Date.now() / 1000) + 60 }));
    const token = `header.${payload}.signature`;

    expect(decodeToken(token)).toEqual({ sub: "1", exp: expect.any(Number) });
    expect(decodeToken("invalid")).toBeNull();
    expect(sesionValida({ token })).toBe(true);
    expect(sesionValida({ token: "header.invalid.signature" })).toBe(false);
    expect(sesionValida({ token: `header.${btoa(JSON.stringify({ exp: 1 }))}.signature` })).toBe(false);
    expect(sesionValida({ nombre: "Local User" })).toBe(true);
    expect(sesionValida(null)).toBe(false);
  });

  it("reads sessions from localStorage before sessionStorage", () => {
    sessionStorage.setItem("autobought-sesion", JSON.stringify({ id: 2 }));
    expect(obtenerSesion()).toEqual({ id: 2 });
    expect(haySesionActiva()).toBe(true);

    localStorage.setItem("autobought-sesion", "not-json");
    expect(obtenerSesion()).toBeNull();
    expect(haySesionActiva()).toBe(false);
  });
});

describe("Marcas", () => {
  it("renders available brands and opens the catalog for a selected brand", async () => {
    const user = userEvent.setup();
    const props = navigationProps();

    render(<Marcas {...props} />);
    expect(await screen.findByText("1 marcas")).toBeInTheDocument();
    expect(screen.getByText("Volkswagen")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Volkswagen/i }));
    expect(props.onCatalogo).toHaveBeenCalledWith("Frenos");
  });
});

describe("App", () => {
  it("starts on home and changes pages through the navbar", async () => {
    const user = userEvent.setup();
    renderBase(
      <MemoryRouter>
        <CartProvider><App /></CartProvider>
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: /repuestos que te/i })).toBeInTheDocument();
    await user.click(screen.getByTitle("Iniciar sesión"));

    expect(screen.getByRole("heading", { name: "INICIAR SESIÓN" })).toBeInTheDocument();
  });

  it("persists a product added from the catalog in the cart", async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      "autobought-sesion",
      JSON.stringify({ id: 1, nombre: "Test User" })
    );
    agregarItemCarrito.mockResolvedValue({
      items: [{ ...catalogProducts[0], cantidad: 1 }],
      total: catalogProducts[0].precio,
    });
    renderBase(
      <MemoryRouter>
        <CartProvider><App /></CartProvider>
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: "Repuestos" }));
    await user.click(screen.getAllByRole("button", { name: /agregar/i })[0]);
    await user.click(screen.getByTitle("Carrito"));

    expect(screen.getByText("Tu Carrito de Compras")).toBeInTheDocument();
    expect(await screen.findByText("Pastillas de Freno Delanteras Bosch")).toBeInTheDocument();
    expect(agregarItemCarrito).toHaveBeenCalledWith("BP1234", 1);
  });
});

describe("MetodosPago", () => {
  it("validates and creates a card through the API", async () => {
    const user = userEvent.setup();
    let savedCards = [];
    obtenerMetodosPago.mockImplementation(() => Promise.resolve(savedCards));
    crearMetodoPago.mockImplementation(async (card) => {
      savedCards = [{
        id: 1,
        ...card,
        numero: card.numero.slice(-4),
        principal: true,
      }];
    });
    render(<MetodosPago {...navigationProps()} onPerfil={jest.fn()} />);

    await user.click(screen.getByRole("button", { name: /agregar tarjeta/i }));
    await user.type(screen.getByPlaceholderText("Nombre del titular"), "Ana Perez");
    await user.type(screen.getByPlaceholderText("1234 5678 9012 3456"), "4111111111111111");
    await user.type(screen.getByPlaceholderText("MM/AA"), "12/30");
    await user.click(screen.getByRole("button", { name: /guardar tarjeta/i }));

    expect(await screen.findByText("•••• •••• •••• 1111")).toBeInTheDocument();
    expect(screen.getByText("PRINCIPAL")).toBeInTheDocument();
    expect(crearMetodoPago).toHaveBeenCalledWith(expect.objectContaining({
      titular: "Ana Perez",
      numero: "4111111111111111",
      vencimiento: "12/30",
    }));
  });

  it("rejects incomplete and short card data, then marks and deletes saved cards", async () => {
    const user = userEvent.setup();
    const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
    let savedCards = [
      { id: 1, tipo: "Visa", titular: "Ana", numero: "1111", vencimiento: "12/30", principal: true },
      { id: 2, tipo: "Mastercard", titular: "Luis", numero: "2222", vencimiento: "11/29", principal: false },
    ];
    obtenerMetodosPago.mockImplementation(() => Promise.resolve(savedCards));
    marcarMetodoPagoPrincipal.mockImplementation(async (id) => {
      savedCards = savedCards.map((card) => ({ ...card, principal: card.id === id }));
    });
    eliminarMetodoPagoAPI.mockImplementation(async (id) => {
      savedCards = savedCards.filter((card) => card.id !== id);
    });
    render(<MetodosPago {...navigationProps()} onPerfil={jest.fn()} />);

    await user.click(screen.getByRole("button", { name: /agregar tarjeta/i }));
    await user.click(screen.getByRole("button", { name: /guardar tarjeta/i }));
    expect(alertSpy).toHaveBeenCalledWith("Completá todos los campos.");

    await user.type(screen.getByPlaceholderText("Nombre del titular"), "Test");
    await user.type(screen.getByPlaceholderText("1234 5678 9012 3456"), "123456789012");
    await user.type(screen.getByPlaceholderText("MM/AA"), "01/30");
    await user.click(screen.getByRole("button", { name: /guardar tarjeta/i }));
    expect(alertSpy).toHaveBeenCalledWith("Ingresá un número de tarjeta válido.");

    await user.click(await screen.findByRole("button", { name: "MARCAR PRINCIPAL" }));
    expect(await screen.findAllByText("PRINCIPAL")).toHaveLength(1);
    await user.click(screen.getAllByRole("button", { name: "ELIMINAR" })[1]);
    await waitFor(() => expect(screen.queryByText("Luis")).not.toBeInTheDocument());
    expect(marcarMetodoPagoPrincipal).toHaveBeenCalledWith(2);
    expect(eliminarMetodoPagoAPI).toHaveBeenCalledWith(2);
    alertSpy.mockRestore();
  });
});

describe("Perfil", () => {
  it("edits personal information and exposes profile actions", async () => {
    const user = userEvent.setup();
    const props = navigationProps();
    props.onActualizarUsuario = jest.fn();
    props.onDirecciones = jest.fn();
    props.onMetodosPago = jest.fn();
    props.onHistorialCompras = jest.fn();
    props.onCerrarSesion = jest.fn();
    const usuario = {
      id: 1,
      nombre: "Ana",
      apellido: "Perez",
      email: "ana@example.com",
      telefono: "099123456",
      tipoDocumento: "CI",
      documento: "12345678",
    };

    render(<Perfil {...props} usuario={usuario} />);
    expect(screen.getByRole("heading", { name: "MI PERFIL" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "EDITAR" }));
    const nameInput = screen.getByDisplayValue("Ana");
    await user.clear(nameInput);
    await user.type(nameInput, "Ana Maria");
    await user.click(screen.getByRole("button", { name: /guardar cambios/i }));
    await user.click(screen.getByRole("button", { name: /direcciones/i }));
    await user.click(screen.getByRole("button", { name: /métodos de pago/i }));
    await user.click(screen.getByRole("button", { name: /historial de compra/i }));
    await user.click(screen.getByRole("button", { name: /cerrar sesión/i }));

    expect(props.onActualizarUsuario).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: "Ana Maria" })
    );
    expect(props.onDirecciones).toHaveBeenCalled();
    expect(props.onMetodosPago).toHaveBeenCalled();
    expect(props.onHistorialCompras).toHaveBeenCalled();
    expect(props.onCerrarSesion).toHaveBeenCalled();
  });

  it("cancels profile edits and restores the saved values", async () => {
    const user = userEvent.setup();
    const usuario = { nombre: "Ana", email: "ana@example.com" };
    render(<Perfil {...navigationProps()} usuario={usuario} />);
    await user.click(screen.getByRole("button", { name: "EDITAR" }));
    const nameInput = screen.getByDisplayValue("Ana");
    await user.clear(nameInput);
    await user.type(nameInput, "Cambio temporal");
    await user.click(screen.getByRole("button", { name: "CANCELAR" }));

    expect(screen.getByRole("button", { name: "EDITAR" })).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Cambio temporal")).not.toBeInTheDocument();
  });
});

describe("Registro", () => {
  it("shows validation errors and registers a new user", async () => {
    const user = userEvent.setup();
    const props = navigationProps();
    props.onRegistroExitoso = jest.fn();
    render(<Registro {...props} />);

    await user.click(screen.getByRole("button", { name: /crear cuenta/i }));
    expect(screen.getByText("Completá todos los campos.")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Tu nombre"), "Lucia");
    await user.type(screen.getByPlaceholderText("Tu apellido"), "Gomez");
    await user.type(screen.getByPlaceholderText("tu@email.com"), "lucia@example.com");
    await user.type(screen.getByPlaceholderText("099 123 456"), "099123456");
    await user.type(screen.getByPlaceholderText("Mínimo 6 caracteres"), "secreto");
    await user.type(screen.getByPlaceholderText("Repetí tu contraseña"), "secreto");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /crear cuenta/i }));

    expect(props.onRegistroExitoso).toHaveBeenCalledWith(
      expect.objectContaining({ email: "lucia@example.com", nombre: "Lucia" })
    );
    expect(JSON.parse(localStorage.getItem("autobought-usuarios"))).toEqual([
      expect.objectContaining({ email: "lucia@example.com" }),
    ]);
  });
});

describe("Direcciones", () => {
  it("saves a primary address and can delete it", async () => {
    const user = userEvent.setup();
    let savedAddresses = [];
    obtenerDirecciones.mockImplementation(() => Promise.resolve(savedAddresses));
    crearDireccion.mockImplementation(async (address) => {
      savedAddresses = [{ ...address, id: 1, principal: true }];
    });
    eliminarDireccionAPI.mockImplementation(async (id) => {
      savedAddresses = savedAddresses.filter((address) => address.id !== id);
    });
    render(<Direcciones {...navigationProps()} onPerfil={jest.fn()} />);

    await user.click(screen.getByRole("button", { name: /agregar dirección/i }));
    await user.type(screen.getByPlaceholderText("Ej: Casa"), "Casa");
    await user.type(screen.getByPlaceholderText("Ej: Montevideo"), "Montevideo");
    await user.type(screen.getByPlaceholderText("Ej: Av. Italia"), "Av. Italia");
    await user.type(screen.getByPlaceholderText("Ej: 1234"), "1234");
    await user.selectOptions(screen.getByRole("combobox"), "Montevideo");
    await user.click(screen.getByRole("button", { name: /guardar dirección/i }));

    expect(await screen.findByRole("heading", { name: /casa/i })).toBeInTheDocument();
    expect(await screen.findByText("PRINCIPAL")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "ELIMINAR" }));
    expect(await screen.findByText("Todavía no tenés direcciones guardadas.")).toBeInTheDocument();
    expect(crearDireccion).toHaveBeenCalledWith(expect.objectContaining({
      nombre: "Casa",
      departamento: "Montevideo",
    }));
    expect(eliminarDireccionAPI).toHaveBeenCalledWith(1);
  });

  it("changes the primary address and returns to the profile", async () => {
    const user = userEvent.setup();
    const onPerfil = jest.fn();
    let savedAddresses = [
      { id: 1, nombre: "Casa", calle: "A", numero: "1", ciudad: "MVD", departamento: "MVD", principal: true },
      { id: 2, nombre: "Oficina", calle: "B", numero: "2", ciudad: "MVD", departamento: "MVD", principal: false },
    ];
    obtenerDirecciones.mockImplementation(() => Promise.resolve(savedAddresses));
    marcarDireccionPrincipal.mockImplementation(async (id) => {
      savedAddresses = savedAddresses.map((address) => ({
        ...address,
        principal: address.id === id,
      }));
    });
    render(<Direcciones {...navigationProps()} onPerfil={onPerfil} />);

    await user.click(await screen.findByRole("button", { name: "MARCAR COMO PRINCIPAL" }));
    expect(await screen.findAllByText("PRINCIPAL")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: /volver a mi perfil/i }));
    expect(onPerfil).toHaveBeenCalled();
    expect(marcarDireccionPrincipal).toHaveBeenCalledWith(2);
  });
});

describe("HistorialCompras", () => {
  it("renders an empty state and stored purchase details", () => {
    const props = navigationProps();
    render(<HistorialCompras {...props} onPerfil={jest.fn()} />);
    expect(screen.getByText("Todavía no realizaste ninguna compra.")).toBeInTheDocument();

    localStorage.setItem(
      "autobought-compras",
      JSON.stringify([
        {
          id: "ORD-1",
          fecha: "2026-01-15T00:00:00.000Z",
          estado: "ENTREGADA",
          total: 2500,
          productos: [{ nombre: "Filtro", cantidad: 2, precio: 1250 }],
        },
      ])
    );
    render(<HistorialCompras {...props} onPerfil={jest.fn()} />);

    expect(screen.getByText("#ORD-1")).toBeInTheDocument();
    expect(screen.getByText("ENTREGADA")).toBeInTheDocument();
    expect(screen.getByText("Filtro")).toBeInTheDocument();
  });
});

describe("ProtectedRoute", () => {
  it("redirects anonymous users and renders the protected route for a session", async () => {
    renderBase(
      <MemoryRouter initialEntries={["/privado"]}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/privado" element={<p>Contenido privado</p>} />
          </Route>
          <Route path="/login" element={<p>Pantalla de login</p>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Pantalla de login")).toBeInTheDocument();
    localStorage.setItem("autobought-sesion", JSON.stringify({ id: 1, nombre: "Ana" }));
    window.history.pushState({}, "", "/privado");
    renderBase(
      <MemoryRouter initialEntries={["/privado"]}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/privado" element={<p>Contenido privado</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Contenido privado")).toBeInTheDocument();
  });
});

describe("SearchBar and search helpers", () => {
  it("submits, clears, and filters mock and API-shaped products", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    const onSubmit = jest.fn();
    render(<SearchBar value="" onChange={onChange} onSubmit={onSubmit} />);

    const input = screen.getByRole("searchbox");
    await user.type(input, "filtro");
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenLastCalledWith("filtro");
    expect(onSubmit).toHaveBeenLastCalledWith("filtro");
    await user.click(screen.getByRole("button", { name: "Limpiar búsqueda" }));
    expect(onSubmit).toHaveBeenLastCalledWith("");

    expect(
      filtrarRepuestos(
        [{ name: "Filtro API", part_code: "API-1", category: "Filters", price: 300 }],
        { busqueda: "api" }
      )
    ).toHaveLength(1);
  });

  it("renders the no-results message", () => {
    render(<SinResultadosBusqueda termino="bujía" />);
    expect(screen.getByRole("status")).toHaveTextContent("bujía");
  });
});
