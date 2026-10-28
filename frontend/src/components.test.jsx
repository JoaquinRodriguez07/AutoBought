import { act, fireEvent, render as renderBase, screen, waitFor, within } from "@testing-library/react";
import { useEffect } from "react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";

jest.mock("./api", () => ({
  buscarTexto: jest.fn(),
  login: jest.fn(),
  registrar: jest.fn(),
  obtenerPerfil: jest.fn(),
  renovarToken: jest.fn(),
  alSesionInvalida: jest.fn(),
  actualizarPerfil: jest.fn(),
  cambiarPassword: jest.fn(),
  obtenerRepuestos: jest.fn(),
  obtenerRepuesto: jest.fn(),
  obtenerCategorias: jest.fn(),
  obtenerMasVendidos: jest.fn(),
  obtenerCarrito: jest.fn(),
  agregarItemCarrito: jest.fn(),
  actualizarItemCarrito: jest.fn(),
  eliminarItemCarrito: jest.fn(),
  vaciarCarritoAPI: jest.fn(),
  obtenerMarcas: jest.fn(),
  obtenerModelos: jest.fn(),
  obtenerAnios: jest.fn(),
  obtenerDirecciones: jest.fn(),
  crearDireccion: jest.fn(),
  marcarDireccionPrincipal: jest.fn(),
  eliminarDireccionAPI: jest.fn(),
  obtenerRecomendaciones: jest.fn(),
  obtenerFavoritos: jest.fn(),
  obtenerHistorialCompras: jest.fn(),
  obtenerDetalleCompra: jest.fn(),
  agregarFavoritoAPI: jest.fn(),
  quitarFavoritoAPI: jest.fn(),
  pedirRecuperacion: jest.fn(),
  restablecerPassword: jest.fn(),
  verificarCorreo: jest.fn(),
  reenviarVerificacion: jest.fn(),
  obtenerAvisosStock: jest.fn(),
  agregarAvisoStock: jest.fn(),
  quitarAvisoStock: jest.fn(),
  guardarPreferenciasMails: jest.fn(),
  darseDeBaja: jest.fn(),
}));
jest.mock(
  "react-hot-toast",
  () => ({ __esModule: true, default: { error: jest.fn(), success: jest.fn() } }),
  { virtual: true }
);

import App from "./App";
import ActiveVehicleBanner from "./ActiveVehicleBanner";
import BrandDropdown from "./BrandDropdown";
import BusquedaCabecera from "./BusquedaCabecera";
import CambiarPassword from "./CambiarPassword";
import Carrito from "./Carrito";
import Catalogo from "./Catalogo";
import DetalleProducto from "./DetalleProducto";
import Favoritos from "./Favoritos";
import { mapearRepuesto } from "./mapearRepuesto";
import ConfirmacionAgregarCarrito, { DURACION_AVISO_MS } from "./ConfirmacionAgregarCarrito";
import Home from "./Home";
import Login from "./Login";
import Marcas from "./Marcas";
import ModelDropdown from "./ModelDropdown";
import Navbar from "./Navbar";
import Perfil from "./Perfil";
import Registro from "./Registro";
import Direcciones from "./Direcciones";
import HistorialCompras from "./HistorialCompras";
import ProtectedRoute from "./ProtectedRoute";
import { crearToken } from "./testTokens";
import SearchBar from "./SearchBar";
import SinResultadosBusqueda from "./SinResultadosBusqueda";
import InvitacionAsistente from "./InvitacionAsistente";
import PanelPit from "./PanelPit";
import { CartProvider } from "./context/CartContext";
import { VehicleProvider } from "./context/VehicleContext";
import { useVehicle } from "./context/VehicleContext";
import { PitProvider } from "./context/PitContext";

import { filtrarRepuestos } from "./filtrarRepuestos";
import toast from "react-hot-toast";
import {
  buscarTexto,
  agregarFavoritoAPI,
  actualizarPerfil,
  cambiarPassword,
  agregarItemCarrito,
  actualizarItemCarrito,
  crearDireccion,
  eliminarDireccionAPI,
  eliminarItemCarrito,
  login,
  marcarDireccionPrincipal,
  obtenerCarrito,
  obtenerCategorias,
  obtenerMasVendidos,
  obtenerDirecciones,
  obtenerFavoritos,
  obtenerHistorialCompras,
  obtenerDetalleCompra,
  obtenerMarcas,
  obtenerModelos,
  obtenerAnios,
  obtenerRepuestos,
  obtenerRepuesto,
  obtenerPerfil,
  obtenerRecomendaciones,
  quitarFavoritoAPI,
  registrar,
  vaciarCarritoAPI,
  renovarToken,
  alSesionInvalida,
  verificarCorreo,
  obtenerAvisosStock,
  agregarAvisoStock,
  quitarAvisoStock,
} from "./api";
import {
  decodeToken,
  guardarSesion,
  haySesionActiva,
  obtenerSesion,
  sesionValida,
  TIPO_VENDEDOR,
} from "./auth";

const navigationProps = () => ({
  onHome: jest.fn(),
  esFavorito: jest.fn(() => false),
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
};

const catalogProducts = [
  {
    ...product,
    id: "BP1234",
    codigo: "BP1234",
    nombre: "Pastillas de Freno Delanteras Bosch",
    fabricante: "Bosch",
    marca: "Bosch",
    categoria: "Frenos",
  },
  {
    ...product,
    id: "DB5678",
    codigo: "DB5678",
    nombre: "Discos de Freno Delanteros",
    fabricante: "Brembo",
    marca: "Brembo",
    categoria: "Frenos",
  },
  {
    ...product,
    id: "FA9012",
    codigo: "FA9012",
    nombre: "Filtro de Aire",
    fabricante: "Mann",
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

function render(ui, options = {}) {
  const { initialEntries = ["/"], ...renderOptions } = options;

  return renderBase(
    <MemoryRouter initialEntries={initialEntries}>
      <CartProvider>
        <VehicleProvider>
          <PitProvider>{ui}</PitProvider>
        </VehicleProvider>
      </CartProvider>
    </MemoryRouter>,
    renderOptions
  );
}

function RutaActual() {
  const { useLocation } = require("react-router-dom");
  const location = useLocation();

  return (
    <p data-testid="ruta-actual">
      {location.pathname}
      {location.search}
    </p>
  );
}

function ControlesHistorialDetalle() {
  const navigate = useNavigate();
  return (
    <div>
      <button onClick={() => navigate("/producto/filtro-de-aire-8")}>Abrir otro repuesto</button>
      <button onClick={() => navigate(-1)}>Volver al repuesto anterior</button>
      <button onClick={() => navigate(1)}>Avanzar al repuesto siguiente</button>
    </div>
  );
}

function ActivarVehiculo({ vehiculo }) {
  const { activarVehiculo } = useVehicle();
  useEffect(() => activarVehiculo(vehiculo), [activarVehiculo]);
  return null;
}

beforeEach(() => {
  obtenerRepuesto.mockImplementation(async (id) =>
    catalogProducts.find((item) => String(item.partId ?? item.id) === String(id)) ?? null
  );
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
  obtenerMasVendidos.mockResolvedValue([]);
  obtenerCarrito.mockResolvedValue(emptyCart);
  agregarItemCarrito.mockResolvedValue(emptyCart);
  actualizarItemCarrito.mockResolvedValue(emptyCart);
  eliminarItemCarrito.mockResolvedValue(emptyCart);
  vaciarCarritoAPI.mockResolvedValue(emptyCart);
  obtenerMarcas.mockResolvedValue([{ brand: "Volkswagen" }]);
  obtenerModelos.mockResolvedValue([]);
  obtenerAnios.mockResolvedValue([]);
  obtenerDirecciones.mockResolvedValue([]);
  crearDireccion.mockResolvedValue({});
  marcarDireccionPrincipal.mockResolvedValue({});
  eliminarDireccionAPI.mockResolvedValue({});
  obtenerRecomendaciones.mockResolvedValue([]);
  obtenerFavoritos.mockResolvedValue([]);
  obtenerAvisosStock.mockResolvedValue([]);
  obtenerHistorialCompras.mockResolvedValue([]);
  obtenerDetalleCompra.mockResolvedValue({});
  agregarFavoritoAPI.mockResolvedValue();
  quitarFavoritoAPI.mockResolvedValue();
});

afterEach(() => {
  global.fetch = originalFetch;
  localStorage.clear();
  sessionStorage.clear();
  jest.clearAllMocks();
});

describe("Navbar", () => {
  it("bounces the favorites counter only when it goes up", () => {
    const props = navigationProps();
    const { rerender } = render(<Navbar paginaActual="home" {...props} cantidadFavoritos={1} />);
    const contador = () => within(screen.getByTitle("Favoritos")).getByText(/^\d+$/);

    // Al montar (ej. al cambiar de pantalla) no rebota.
    expect(contador()).not.toHaveClass("motion-safe:animate-rebote");

    rerender(
      <MemoryRouter><CartProvider><VehicleProvider><PitProvider>
        <Navbar paginaActual="home" {...props} cantidadFavoritos={2} />
      </PitProvider></VehicleProvider></CartProvider></MemoryRouter>
    );
    expect(contador()).toHaveTextContent("2");
    expect(contador()).toHaveClass("motion-safe:animate-rebote");
  });

  it("opens the global search with focus and applies its query from another page", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Navbar paginaActual="favoritos" {...navigationProps()} />
        <RutaActual />
      </>,
      { initialEntries: ["/favoritos"] }
    );

    await user.click(screen.getByRole("button", { name: "Abrir búsqueda" }));
    const input = screen.getByPlaceholderText("¿Qué repuesto estás buscando?");
    expect(input).toHaveFocus();
    const panel = screen.getByRole("search");
    expect(panel).toHaveClass("max-w-[330px]", "top-[4.75rem]");
    expect(input.parentElement).toHaveClass("rounded-full", "border", "shadow-xs");
    await user.type(input, "kit de distribución");
    await user.keyboard("{Enter}");

    expect(screen.getByTestId("ruta-actual")).toHaveTextContent(
      "/catalogo?q=kit%20de%20distribuci%C3%B3n"
    );
    expect(screen.queryByPlaceholderText("¿Qué repuesto estás buscando?")).not.toBeInTheDocument();
  });

  it("closes the global search with Escape, restores focus, and closes on outside click", async () => {
    const user = userEvent.setup();
    render(<Navbar paginaActual="home" {...navigationProps()} />);

    const openButton = screen.getByRole("button", { name: "Abrir búsqueda" });
    await user.click(openButton);
    await user.keyboard("{Escape}");
    expect(screen.queryByPlaceholderText("¿Qué repuesto estás buscando?")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir búsqueda" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Abrir búsqueda" }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByPlaceholderText("¿Qué repuesto estás buscando?")).not.toBeInTheDocument();
  });

  it("runs a global search with the Buscar button", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Navbar paginaActual="detalle" {...navigationProps()} />
        <RutaActual />
      </>,
      { initialEntries: ["/producto/kit-de-freno-3"] }
    );

    await user.click(screen.getByRole("button", { name: "Abrir búsqueda" }));
    await user.type(screen.getByRole("textbox", { name: "Buscar repuestos" }), "filtro aceite");
    await user.click(screen.getByRole("button", { name: "Buscar" }));

    expect(screen.getByTestId("ruta-actual")).toHaveTextContent(
      "/catalogo?q=filtro%20aceite"
    );
  });

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
    expect(screen.queryByRole("button", { name: "Métodos de pago" })).not.toBeInTheDocument();
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
  it("renders the hero with the vehicle selector as the main action", async () => {
    const user = userEvent.setup();
    const props = navigationProps();

    render(<Home {...props} />);

    expect(screen.getByRole("heading", { name: /repuestos que te/i })).toBeInTheDocument();
    expect(screen.getByText("¿Qué auto tenés?")).toBeInTheDocument();
    // Sin auto elegido no se puede buscar ni hay nada para borrar.
    const buscar = screen.getByRole("button", { name: "BUSCAR REPUESTOS" });
    expect(buscar).toBeDisabled();
    expect(screen.queryByRole("button", { name: "BORRAR FILTROS" })).not.toBeInTheDocument();
    await user.click(buscar);

    expect(props.onCatalogo).not.toHaveBeenCalled();
  });

  it("loads model and year options and searches with the selected vehicle", async () => {
    const user = userEvent.setup();
    const props = navigationProps();
    obtenerModelos.mockResolvedValue(["Golf", "Polo"]);
    obtenerAnios.mockResolvedValue([2020, 2021]);

    render(<Home {...props} />);

    const [brandSelect, modelSelect, yearSelect] = screen.getAllByRole("combobox");
    expect(await screen.findByRole("option", { name: "Volkswagen" })).toBeInTheDocument();
    await user.selectOptions(brandSelect, "Volkswagen");
    expect(await screen.findByRole("option", { name: "Golf" })).toBeInTheDocument();
    expect(obtenerModelos).toHaveBeenCalledWith("Volkswagen");

    await user.selectOptions(modelSelect, "Golf");
    expect(await screen.findByRole("option", { name: "2020" })).toBeInTheDocument();
    expect(obtenerAnios).toHaveBeenCalledWith("Volkswagen", "Golf");

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

    await user.click(await screen.findByRole("button", { name: /^Motor/ }));

    expect(props.onCatalogo).toHaveBeenCalledWith("Motor");
  });

  it("keeps the landing page available when categories fail to load", async () => {
    const props = navigationProps();
    obtenerCategorias.mockRejectedValue(new Error("API unavailable"));

    render(<Home {...props} />);

    expect(await screen.findByRole("heading", { name: "Categorías" }))
      .toBeInTheDocument();
    expect(screen.queryByText("Cargando categorías…")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Frenos/ })).not.toBeInTheDocument();
  });

  it("shows the real best sellers and opens the detail of the one clicked", async () => {
    const user = userEvent.setup();
    const props = { ...navigationProps(), onDetalle: jest.fn() };
    obtenerMasVendidos.mockResolvedValue([catalogProducts[0]]);

    render(<Home {...props} />);

    expect(await screen.findByText(catalogProducts[0].nombre)).toBeInTheDocument();
    expect(screen.getByText(`$${catalogProducts[0].precio.toLocaleString("es-UY")}`))
      .toBeInTheDocument();
    // Arriba va el fabricante, no la marca del auto.
    expect(screen.getAllByText("Bosch").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "VER REPUESTO" }));

    expect(props.onDetalle).toHaveBeenCalledWith(catalogProducts[0]);
  });

  it("opens the catalog filtered by the manufacturer clicked", async () => {
    const user = userEvent.setup();
    const props = navigationProps();

    render(<Home {...props} />);
    await user.click(screen.getByRole("button", { name: "Brembo" }));

    expect(props.onCatalogo).toHaveBeenCalledWith(null, null, { fabricante: "Brembo" });
  });

  it("opens the catalog filtered by the brand logo clicked, without making it the active vehicle", async () => {
    const user = userEvent.setup();
    const props = navigationProps();

    render(<Home {...props} />);
    await user.click(screen.getAllByRole("button", { name: "Ver repuestos de Volkswagen" })[0]);

    expect(props.onCatalogo).toHaveBeenCalledWith(null, null, { marca: "Volkswagen" });
  });

  it.each([
    ["there are no sales", () => obtenerMasVendidos.mockResolvedValue([])],
    ["the request fails", () => obtenerMasVendidos.mockRejectedValue(new Error("API unavailable"))],
  ])("hides the best sellers section when %s", async (_caso, preparar) => {
    preparar();

    render(<Home {...navigationProps()} />);

    await waitFor(() =>
      expect(screen.queryByText("Cargando más vendidos…")).not.toBeInTheDocument()
    );
    expect(screen.queryByRole("heading", { name: "MÁS VENDIDOS" })).not.toBeInTheDocument();
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
  it("keeps the desktop filters sticky and scrollable within the viewport", () => {
    const props = navigationProps();
    props.onAlternarFavorito = jest.fn();
    props.onDetalle = jest.fn();
    props.esFavorito = jest.fn(() => false);

    render(<Catalogo {...props} />);

    const filters = screen.getByRole("complementary", { name: "Filtros" });
    expect(filters).toHaveClass("lg:sticky", "lg:top-24", "lg:overflow-y-auto");
    expect(filters).toHaveClass("lg:max-h-[calc(100vh-7rem)]", "lg:overscroll-contain");
  });

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

  // Después de agregar, el botón dice "Agregado" por un momento: se
  // buscan los dos textos para seguir encontrando el mismo botón.
  const botonesAgregar = () =>
    screen.getAllByRole("button", { name: /^(agregar|agregado)$/i });
  const esperarCatalogo = () =>
    screen.findAllByRole("button", { name: /^agregar$/i });
  const avisoCarrito = () =>
    screen.getByText("Agregado al carrito").closest("[aria-live]");
  const catalogoProps = () => ({
    ...navigationProps(),
    onAlternarFavorito: jest.fn(),
    onDetalle: jest.fn(),
    esFavorito: jest.fn(() => false),
  });
  const carritoConPastillas = (cantidad) => ({
    items: [{
      id: "BP1234",
      partId: "BP1234",
      nombre: "Pastillas de Freno Delanteras Bosch",
      precio: 1500,
      cantidad,
      stock: 5,
    }],
    total: 1500 * cantidad,
  });

  it("shows a non-blocking notice that merges repeated adds and closes or goes to the cart", async () => {
    const user = userEvent.setup();
    startClientSession();
    agregarItemCarrito
      .mockResolvedValueOnce(carritoConPastillas(1))
      .mockResolvedValueOnce(carritoConPastillas(2));

    render(<><Catalogo {...catalogoProps()} categoriaInicial="Frenos" /><RutaActual /></>);
    await esperarCatalogo();
    await user.click(botonesAgregar()[0]);

    expect(await screen.findByText("Agregado al carrito")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(botonesAgregar()[0]).toHaveTextContent("Agregado");
    expect(within(avisoCarrito()).getByText("Pastillas de Freno Delanteras Bosch")).toBeInTheDocument();
    expect(within(avisoCarrito()).getByText(/×1/)).toBeInTheDocument();
    expect(within(avisoCarrito()).getByText(/Tu carrito \(1 producto\)/)).toBeInTheDocument();
    expect(within(screen.getByTitle("Carrito")).getByText("1"))
      .toHaveClass("motion-safe:animate-rebote");

    // Agregar otra vez el mismo repuesto actualiza el aviso, no apila otro.
    await user.click(botonesAgregar()[0]);
    await waitFor(() => expect(within(avisoCarrito()).getByText(/×2/)).toBeInTheDocument());
    expect(screen.getAllByText("Agregado al carrito")).toHaveLength(1);
    expect(within(avisoCarrito()).getByText(/Tu carrito \(2 productos\)/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Seguir comprando" }));
    expect(screen.queryByText("Agregado al carrito")).not.toBeInTheDocument();

    await user.click(botonesAgregar()[0]);
    await user.click(await screen.findByRole("button", { name: "Cerrar aviso" }));
    expect(screen.queryByText("Agregado al carrito")).not.toBeInTheDocument();

    await user.click(botonesAgregar()[0]);
    await screen.findByText("Agregado al carrito");
    await user.keyboard("{Escape}");
    expect(screen.queryByText("Agregado al carrito")).not.toBeInTheDocument();

    await user.click(botonesAgregar()[0]);
    await user.click(await screen.findByRole("button", { name: "Ver carrito" }));
    expect(screen.getByTestId("ruta-actual")).toHaveTextContent("/carrito");
    expect(screen.queryByText("Agregado al carrito")).not.toBeInTheDocument();
  });

  it("disables the button while adding and shows the result in the same place", async () => {
    const user = userEvent.setup();
    startClientSession();
    let responder;
    agregarItemCarrito.mockReturnValue(new Promise((resolve) => { responder = resolve; }));

    render(<Catalogo {...catalogoProps()} categoriaInicial="Frenos" />);
    await esperarCatalogo();
    await user.click(botonesAgregar()[0]);

    expect(screen.getByRole("button", { name: "Agregando…" })).toBeDisabled();

    responder(carritoConPastillas(1));
    expect(await screen.findByRole("button", { name: "Agregado" })).toBeEnabled();
  });

  it("undo removes the line when nothing was in the cart before", async () => {
    const user = userEvent.setup();
    startClientSession();
    agregarItemCarrito.mockResolvedValue(carritoConPastillas(1));

    render(<Catalogo {...catalogoProps()} categoriaInicial="Frenos" />);
    await esperarCatalogo();
    await user.click(botonesAgregar()[0]);

    await user.click(await screen.findByRole("button", { name: "Deshacer" }));
    await waitFor(() => expect(eliminarItemCarrito).toHaveBeenCalledWith("BP1234"));
    expect(screen.queryByText("Agregado al carrito")).not.toBeInTheDocument();
  });

  it("undo only removes the quantity that was just added", async () => {
    const user = userEvent.setup();
    startClientSession();
    // El carrito ya tenía 2 unidades: después de agregar 1 quedan 3.
    agregarItemCarrito.mockResolvedValue(carritoConPastillas(3));

    render(<Catalogo {...catalogoProps()} categoriaInicial="Frenos" />);
    await esperarCatalogo();
    await user.click(botonesAgregar()[0]);

    await user.click(await screen.findByRole("button", { name: "Deshacer" }));

    await waitFor(() => expect(actualizarItemCarrito).toHaveBeenCalledWith("BP1234", 2));
    expect(eliminarItemCarrito).not.toHaveBeenCalled();
  });

  it("explains a stock conflict with the units already in the cart", async () => {
    const user = userEvent.setup();
    startClientSession();
    obtenerCarrito.mockResolvedValue(carritoConPastillas(4));
    agregarItemCarrito.mockRejectedValue(
      Object.assign(new Error("No hay stock suficiente. Disponible: 5 unidades."), { status: 409 })
    );

    render(<Catalogo {...catalogoProps()} categoriaInicial="Frenos" />);
    await esperarCatalogo();
    await waitFor(() =>
      expect(within(screen.getByTitle("Carrito")).getByText("4")).toBeInTheDocument()
    );
    await user.click(botonesAgregar()[0]);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Solo quedan 5 unidades y ya tenés 4 en el carrito.")
    );
    expect(screen.queryByText("Agregado al carrito")).not.toBeInTheDocument();
    expect(botonesAgregar()[0]).toHaveTextContent(/^Agregar$/);
  });

  it("asks an anonymous visitor to log in with a button instead of only a message", async () => {
    const user = userEvent.setup();

    render(<><Catalogo {...catalogoProps()} categoriaInicial="Frenos" /><RutaActual /></>);
    await esperarCatalogo();
    await user.click(botonesAgregar()[0]);

    const aviso = screen
      .getByText("Iniciá sesión para agregar productos al carrito.")
      .closest("[aria-live]");
    expect(agregarItemCarrito).not.toHaveBeenCalled();
    expect(screen.getByTestId("ruta-actual")).toHaveTextContent(/^\/$/);

    await user.click(within(aviso).getByRole("button", { name: "Iniciar sesión" }));
    expect(screen.getByTestId("ruta-actual")).toHaveTextContent("/login");
  });

  it("filters by the manufacturers of the loaded products and clears them", async () => {
    const user = userEvent.setup();
    const props = navigationProps();
    props.onAlternarFavorito = jest.fn();
    props.onDetalle = jest.fn();
    props.esFavorito = jest.fn(() => false);

    render(<Catalogo {...props} categoriaInicial="Frenos" />);

    expect(await screen.findByText("Pastillas de Freno Delanteras Bosch")).toBeInTheDocument();
    // Solo los fabricantes de lo cargado (Frenos): Mann es de Motor.
    expect(screen.getByRole("checkbox", { name: /Bosch/ })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /Mann/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: /Brembo/ }));

    expect(screen.getByText("Discos de Freno Delanteros")).toBeInTheDocument();
    expect(screen.queryByText("Pastillas de Freno Delanteras Bosch")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Limpiar filtros" }));

    expect(await screen.findByText("Pastillas de Freno Delanteras Bosch")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Brembo/ })).not.toBeChecked();
  });

  it("filters by price, stock and car brand and shows each filter as a removable chip", async () => {
    const user = userEvent.setup();
    const props = navigationProps();
    props.onAlternarFavorito = jest.fn();
    props.onDetalle = jest.fn();
    props.esFavorito = jest.fn(() => false);
    obtenerRepuestos.mockResolvedValue([
      { ...catalogProducts[0], precio: 1500, stock: 0, marcas: ["Chevrolet"], modelos: ["Onix"] },
      { ...catalogProducts[1], precio: 4200, stock: 3, marcas: ["Ford"], modelos: ["Ka"] },
      { ...catalogProducts[2], precio: 900, stock: 8, marcas: ["Chevrolet", "Ford"], modelos: [] },
    ]);

    render(<Catalogo {...props} />);

    expect(await screen.findByText("Para Chevrolet Onix")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Solo con stock" }));
    expect(screen.queryByText("Pastillas de Freno Delanteras Bosch")).not.toBeInTheDocument();

    await user.type(screen.getByRole("spinbutton", { name: "Precio máximo" }), "1000");
    expect(screen.getByText("Filtro de Aire")).toBeInTheDocument();
    expect(screen.queryByText("Discos de Freno Delanteros")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Quitar filtro Hasta $1.000" }));
    expect(screen.getByText("Discos de Freno Delanteros")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: /Ford/ }));
    await user.click(screen.getByRole("button", { name: "Quitar filtro Con stock" }));
    expect(screen.queryByText("Pastillas de Freno Delanteras Bosch")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quitar filtro Para Ford" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    expect(screen.getByText("Pastillas de Freno Delanteras Bosch")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Quitar filtro/ })).not.toBeInTheDocument();
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
    const favoriteButtons = screen.getAllByRole("button", { name: "Marcar como favorito" });
    await user.click(favoriteButtons[favoriteButtons.length - 1]);

    expect(props.onAlternarFavorito).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: "Filtro de Aire" })
    );
  });

it("exits free search mode when changing category", async () => {
  const user = userEvent.setup();
  const props = navigationProps();

  buscarTexto.mockResolvedValue({
    parts: [],
    entities: { part: true },
  });

  render(
    <>
      <Catalogo
        {...props}
        categoriaInicial="Frenos"
        esFavorito={() => false}
      />
      <RutaActual />
    </>,
    { initialEntries: ["/catalogo?q=pastillas"] }
  );

  await user.click(
    await screen.findByRole("button", { name: /Motor/ })
  );

  await waitFor(() => {
    expect(obtenerRepuestos).toHaveBeenCalledWith(
      expect.objectContaining({ categoria: "Motor" })
    );
  });

  expect(screen.getByTestId("ruta-actual")).toHaveTextContent(
    "/catalogo"
  );
  expect(screen.getByTestId("ruta-actual")).not.toHaveTextContent(
    "?q=pastillas"
  );
});

it("shows free search results and activates the detected vehicle", async () => {
  const props = navigationProps();

  buscarTexto.mockResolvedValue({
    parts: [catalogProducts[0]],
    entities: { part: "pastillas de freno", brand: "Chevrolet", model: "Onix", year: 2020 },
  });

  render(
    <Catalogo {...props} esFavorito={() => false} />,
    { initialEntries: ["/catalogo?q=pastillas%20de%20freno%20onix%202020"] }
  );

  expect(
    await screen.findByText("Pastillas de Freno Delanteras Bosch")
  ).toBeInTheDocument();
  expect(buscarTexto).toHaveBeenCalledWith("pastillas de freno onix 2020");
  expect(await screen.findByText("Chevrolet Onix 2020")).toBeInTheDocument();
  expect(obtenerRepuestos).not.toHaveBeenCalled();
});

it("runs the server search from the catalog bar on Enter and hides the header search", async () => {
  const user = userEvent.setup();
  const props = navigationProps();
  buscarTexto.mockResolvedValue({
    parts: [catalogProducts[0]],
    entities: { part: "pastillas de freno" },
  });

  render(
    <>
      <Catalogo {...props} esFavorito={() => false} />
      <RutaActual />
    </>
  );

  expect(screen.queryByPlaceholderText("¿Qué repuesto estás buscando?")).not.toBeInTheDocument();

  await user.type(screen.getByPlaceholderText(/buscar repuesto/i), "pastillas de frenos{Enter}");

  await waitFor(() => expect(buscarTexto).toHaveBeenCalledWith("pastillas de frenos"));
  expect(screen.getByTestId("ruta-actual")).toHaveTextContent("?q=pastillas");
  expect(await screen.findByText("Pastillas de Freno Delanteras Bosch")).toBeInTheDocument();
});

it("opens with the manufacturer from the URL already checked", async () => {
  const props = navigationProps();

  render(
    <Catalogo {...props} esFavorito={() => false} />,
    { initialEntries: ["/catalogo?fabricante=Brembo"] }
  );

  expect(await screen.findByRole("checkbox", { name: /Brembo/ })).toBeChecked();
  expect(screen.getByText("Discos de Freno Delanteros")).toBeInTheDocument();
  expect(screen.queryByText("Pastillas de Freno Delanteras Bosch")).not.toBeInTheDocument();
});

it("opens with the car brand from the URL already checked", async () => {
  obtenerRepuestos.mockResolvedValue([
    { ...catalogProducts[0], marcas: ["Chevrolet"] },
    { ...catalogProducts[1], marcas: ["Ford"] },
  ]);

  render(
    <Catalogo {...navigationProps()} esFavorito={() => false} />,
    { initialEntries: ["/catalogo?marca=Ford"] }
  );

  expect(await screen.findByRole("checkbox", { name: /Ford/ })).toBeChecked();
  expect(screen.getByText("Discos de Freno Delanteros")).toBeInTheDocument();
  expect(screen.queryByText("Pastillas de Freno Delanteras Bosch")).not.toBeInTheDocument();
});

it("offers the server search for what was typed, also when nothing on screen matches", async () => {
  const user = userEvent.setup();
  buscarTexto.mockResolvedValue({
    parts: [catalogProducts[0]],
    entities: { part: "pastillas de freno" },
  });

  render(
    <>
      <Catalogo {...navigationProps()} esFavorito={() => false} />
      <RutaActual />
    </>
  );
  await screen.findByText("Pastillas de Freno Delanteras Bosch");

  await user.type(screen.getByPlaceholderText(/buscar repuesto/i), "pastilas");

  // Con errores no encuentra nada en pantalla: se ofrece en la barra y en grande.
  expect(screen.getByRole("status")).toHaveTextContent("pastilas");
  const ofertas = screen.getAllByRole("button", { name: /en todo el catálogo/ });
  expect(ofertas).toHaveLength(2);

  await user.click(ofertas[1]);

  await waitFor(() => expect(buscarTexto).toHaveBeenCalledWith("pastilas"));
  expect(screen.getByTestId("ruta-actual")).toHaveTextContent("?q=pastilas");
  expect(await screen.findByText("Pastillas de Freno Delanteras Bosch")).toBeInTheDocument();
  // Ya buscado: no se vuelve a ofrecer.
  expect(screen.queryByRole("button", { name: /en todo el catálogo/ })).not.toBeInTheDocument();
});

it("shows the manual filter message when the search cannot be interpreted", async () => {
  const props = navigationProps();

  buscarTexto.mockResolvedValue({
    parts: [],
    entities: { part: null, brand: null, model: null, year: null },
  });

  render(
    <Catalogo {...props} esFavorito={() => false} />,
    { initialEntries: ["/catalogo?q=xyz%20qwerty"] }
  );

  expect(
    await screen.findByText(
      "No pudimos entender tu búsqueda, por favor usa el filtro de compatibilidad manual"
    )
  ).toBeInTheDocument();
  expect(screen.queryByText("Pastillas de Freno Delanteras Bosch")).not.toBeInTheDocument();
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

describe("ActiveVehicleBanner", () => {
  it("confirms a new vehicle and updates the catalog banner", async () => {
    const user = userEvent.setup();
    obtenerMarcas.mockResolvedValue([
      { brand: "Chevrolet" },
      { brand: "Volkswagen" },
    ]);
    obtenerModelos.mockResolvedValue(["Onix"]);
    obtenerAnios.mockResolvedValue([2020]);
    render(
      <>
        <ActivarVehiculo vehiculo={{ brand: "Volkswagen", model: "Gol", year: "2021" }} />
        <ActiveVehicleBanner />
      </>
    );

    await user.click(screen.getByRole("button", { name: "Cambiar vehículo" }));
    await user.selectOptions(screen.getByLabelText("MARCA"), "Chevrolet");
    await user.selectOptions(await screen.findByLabelText("MODELO"), "Onix");
    await screen.findByRole("option", { name: "2020" });
    await user.selectOptions(screen.getByLabelText("AÑO"), "2020");
    await user.click(screen.getByRole("button", { name: "Confirmar vehículo" }));

    expect(screen.getByText("Chevrolet Onix 2020")).toBeInTheDocument();
  });

  it("edits the catalog vehicle locally and keeps the previous vehicle on cancel", async () => {
    const user = userEvent.setup();
    obtenerMarcas.mockResolvedValue([
      { brand: "Chevrolet" },
      { brand: "Volkswagen" },
    ]);
    render(
      <>
        <ActivarVehiculo vehiculo={{ brand: "Volkswagen", model: "Gol", year: "2021" }} />
        <ActiveVehicleBanner />
      </>
    );

    await user.click(screen.getByRole("button", { name: "Cambiar vehículo" }));
    expect(screen.getByLabelText("MARCA")).toHaveValue("Volkswagen");
    await user.selectOptions(screen.getByLabelText("MARCA"), "Chevrolet");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByLabelText("MARCA")).not.toBeInTheDocument();
    expect(screen.getByText("Volkswagen Gol 2021")).toBeInTheDocument();
  });
});

describe("DetalleProducto", () => {
  const repuestoCompatible = () => mapearRepuesto({
    id: 7,
    name: "Filtro compatible",
    manufacturer: "Bosch",
    part_code: "FIL-0007",
    category: "Filtros",
    price: 790,
    stock: 3,
    compatible_brands: ["Chevrolet", "Volkswagen"],
    compatibilities: [
      { brand: "Chevrolet", model: "Onix", engine_code: "1.4 8V", year_from: 2013, year_to: 2019 },
      { brand: "Volkswagen", model: "Gol", engine_code: "1.6 MSI", year_from: 2020, year_to: 2022 },
    ],
  });

  it("loads the requested product from the URL and follows back/forward history", async () => {
    const user = userEvent.setup();
    const primerRepuesto = repuestoCompatible();
    const segundoRepuesto = mapearRepuesto({
      id: 8,
      name: "Filtro de aire",
      manufacturer: "Mann-Filter",
      part_code: "AIR-0008",
      category: "Filtros",
      price: 500,
      stock: 2,
      compatibilities: [],
    });
    obtenerRepuesto.mockImplementation(async (id) => id === "7" ? primerRepuesto : segundoRepuesto);
    const props = navigationProps();

    render(
      <Routes>
        <Route path="/producto/:id" element={<><DetalleProducto {...props} /><ControlesHistorialDetalle /></>} />
      </Routes>,
      { initialEntries: ["/producto/filtro-compatible-7"] }
    );

    expect(screen.getByText("Cargando")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { level: 1, name: "Filtro compatible" })).toBeInTheDocument();
    expect(obtenerRepuesto).toHaveBeenCalledWith("7");

    await user.click(screen.getByRole("button", { name: "Abrir otro repuesto" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Filtro de aire" })).toBeInTheDocument();
    expect(obtenerRepuesto).toHaveBeenLastCalledWith("8");

    await user.click(screen.getByRole("button", { name: "Volver al repuesto anterior" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Filtro compatible" })).toBeInTheDocument();
    expect(obtenerRepuesto).toHaveBeenLastCalledWith("7");

    await user.click(screen.getByRole("button", { name: "Avanzar al repuesto siguiente" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Filtro de aire" })).toBeInTheDocument();
    expect(obtenerRepuesto).toHaveBeenLastCalledWith("8");
  });

  it("shows exactly Repuesto no encontrado for a missing URL product", async () => {
    const error = new Error("Repuesto no encontrado.");
    error.status = 404;
    obtenerRepuesto.mockRejectedValue(error);

    render(
      <Routes>
        <Route path="/producto/:id" element={<DetalleProducto {...navigationProps()} />} />
      </Routes>,
      { initialEntries: ["/producto/repuesto-inexistente-999999"] }
    );

    expect(await screen.findByText("Repuesto no encontrado", { exact: true })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  it("opens the selector in the header when no vehicle is selected", async () => {
    const user = userEvent.setup();
    render(<DetalleProducto {...navigationProps()} producto={repuestoCompatible()} />);
    expect(within(screen.getByTestId("vehicle-selection")).getByRole("button", { name: "Seleccionar vehículo" }))
      .toBeInTheDocument();
    expect(screen.getByTestId("vehicle-selection")).toHaveAttribute("data-compatibilidad", "sin-vehiculo");
    expect(screen.getByText("Elegí tu vehículo para verificar la compatibilidad")).toBeInTheDocument();
    expect(screen.getByTestId("vehicle-selection").lastElementChild).toHaveClass("grid-rows-[0fr]");
    expect(screen.queryByText("Compatibilidad de vehículo")).not.toBeInTheDocument();
    expect(screen.getByText("Chevrolet Onix")).toBeInTheDocument();
    expect(screen.getByText("Volkswagen Gol")).toBeInTheDocument();
    await user.click(within(screen.getByTestId("vehicle-selection")).getByRole("button", { name: "Seleccionar vehículo" }));
    expect(within(screen.getByTestId("vehicle-selection")).getByLabelText("MARCA")).toBeInTheDocument();
    expect(screen.getAllByLabelText("MARCA")).toHaveLength(1);
    const vehicleCard = screen.getByTestId("vehicle-selection");
    const selectorPanel = within(vehicleCard).getByRole("group", { name: "Controles del vehículo" });
    expect(within(vehicleCard).getByText("Seleccioná tu vehículo")).toBeInTheDocument();
    expect(selectorPanel.querySelector(".sm\\:grid-cols-3")).toBeInTheDocument();
    expect(vehicleCard).not.toHaveClass("relative", "absolute", "fixed");
    expect(selectorPanel).toHaveClass("border-t");
    expect(vehicleCard.lastElementChild).toHaveClass("grid-rows-[1fr]");
  });

  it("matches normalized brand and model and includes the first and last range years", () => {
    const repuesto = repuestoCompatible();
    const props = navigationProps();
    render(
      <>
        <ActivarVehiculo vehiculo={{ brand: "  CHEVROLET ", model: " Onix  ", year: "2013" }} />
        <DetalleProducto {...props} producto={repuesto} />
      </>
    );
    expect(screen.getByTestId("vehicle-selection")).toHaveAttribute("data-compatibilidad", "compatible");
    expect(screen.getByText("Compatible con tu vehículo")).toBeInTheDocument();
    expect(screen.getByText("CHEVROLET Onix 2013")).toBeInTheDocument();
  });

  it("includes the last year of a compatibility range", () => {
    render(
      <>
        <ActivarVehiculo vehiculo={{ brand: "Chevrolet", model: "Onix", year: "2019" }} />
        <DetalleProducto {...navigationProps()} producto={repuestoCompatible()} />
      </>
    );
    expect(screen.getByTestId("vehicle-selection")).toHaveAttribute("data-compatibilidad", "compatible");
  });

  it("shows incompatibility when the selected year is outside the inclusive range", () => {
    render(
      <>
        <ActivarVehiculo vehiculo={{ brand: "Chevrolet", model: "Onix", year: "2020" }} />
        <DetalleProducto {...navigationProps()} producto={repuestoCompatible()} />
      </>
    );
    expect(screen.getByTestId("vehicle-selection")).toHaveAttribute("data-compatibilidad", "incompatible");
    expect(screen.getByText("No es compatible con tu Chevrolet Onix 2020")).toBeInTheDocument();
  });

  it("accepts a matching brand when no model is selected", () => {
    render(
      <>
        <ActivarVehiculo vehiculo={{ brand: "chevrolet", model: "", year: "" }} />
        <DetalleProducto {...navigationProps()} producto={repuestoCompatible()} />
      </>
    );
    expect(screen.getByTestId("vehicle-selection")).toHaveAttribute("data-compatibilidad", "compatible");
  });

  it("shows unavailable when no compatibility records exist", () => {
    const productWithoutCompatibility = mapearRepuesto({
      id: 18,
      name: "Filtro sin aplicaciones",
      compatible_brands: ["Chevrolet"],
      compatibilities: [],
    });
    render(
      <>
        <ActivarVehiculo vehiculo={{ brand: "Chevrolet", model: "Onix", year: "2018" }} />
        <DetalleProducto {...navigationProps()} producto={productWithoutCompatibility} />
      </>
    );

    expect(screen.getByTestId("vehicle-selection")).toHaveAttribute("data-compatibilidad", "no-disponible");
    expect(screen.getByText("La información de compatibilidad no está disponible.")).toBeInTheDocument();
    expect(screen.queryByText("Compatible con tu vehículo")).not.toBeInTheDocument();
    expect(screen.queryByText(/No es compatible/)).not.toBeInTheDocument();
  });

  it("does not claim incompatibility when a matching application lacks the selected vehicle year range", () => {
    const productWithIncompleteRange = mapearRepuesto({
      id: 19,
      name: "Filtro con aplicación incompleta",
      compatible_brands: ["Chevrolet"],
      compatibilities: [
        { brand: "Chevrolet", model: "Onix", engine_code: "1.4", year_from: null, year_to: null },
      ],
    });
    render(
      <>
        <ActivarVehiculo vehiculo={{ brand: "Chevrolet", model: "Onix", year: "2018" }} />
        <DetalleProducto {...navigationProps()} producto={productWithIncompleteRange} />
      </>
    );

    expect(screen.getByTestId("vehicle-selection")).toHaveAttribute("data-compatibilidad", "no-verificable");
    expect(screen.queryByText("Compatible con tu vehículo")).not.toBeInTheDocument();
    expect(screen.queryByText(/No es compatible/)).not.toBeInTheDocument();
    expect(screen.getByText("Chevrolet Onix")).toBeInTheDocument();
  });

  it("keeps the compatibility card focused on applications and opens the existing header selector", async () => {
    const user = userEvent.setup();
    render(<DetalleProducto {...navigationProps()} producto={repuestoCompatible()} />);

    const card = within(screen.getByTestId("compatibility-card"));
    expect(card.getByText("Chevrolet Onix")).toBeInTheDocument();
    expect(card.getByText("Volkswagen Gol")).toBeInTheDocument();
    expect(card.queryByRole("button", { name: "Seleccionar vehículo" })).not.toBeInTheDocument();
    await user.click(within(screen.getByTestId("vehicle-selection")).getByRole("button", { name: /Seleccionar veh/ }));
    expect(within(screen.getByTestId("vehicle-selection")).getByLabelText("MARCA")).toBeInTheDocument();
    expect(screen.getAllByLabelText("MARCA")).toHaveLength(1);
  });
  it("opens the inline selector, confirms a new vehicle, and immediately updates compatibility", async () => {
    const user = userEvent.setup();
    const props = navigationProps();
    obtenerMarcas.mockResolvedValue([
      { brand: "Chevrolet" },
      { brand: "Volkswagen" },
    ]);
    obtenerModelos.mockImplementation((brand) =>
      Promise.resolve(brand === "Chevrolet" ? ["Onix"] : ["Gol"])
    );
    obtenerAnios.mockResolvedValue([2018, 2019, 2020]);
    render(
      <>
        <ActivarVehiculo vehiculo={{ brand: "Volkswagen", model: "Gol", year: "2021" }} />
        <DetalleProducto {...props} producto={repuestoCompatible()} />
      </>
    );

    expect(screen.getByTestId("vehicle-selection")).toHaveAttribute("data-compatibilidad", "compatible");
    await user.click(screen.getAllByRole("button", { name: "Cambiar" })[0]);
    const selector = within(screen.getByTestId("vehicle-selection"));
    expect(selector.getByLabelText("MARCA")).toBeInTheDocument();
    expect(selector.getByLabelText("MODELO")).toBeInTheDocument();
    expect(selector.getByLabelText("AÑO")).toBeInTheDocument();
    const vehicleCard = screen.getByTestId("vehicle-selection");
    const selectorPanel = selector.getByRole("group", { name: "Controles del vehículo" });
    expect(selectorPanel).toHaveClass("border-t");
    expect(vehicleCard.lastElementChild).toHaveClass("grid-rows-[1fr]");
    expect(selector.getByText("Volkswagen Gol 2021")).toBeInTheDocument();
    expect(selectorPanel.querySelector(".sm\\:grid-cols-3")).toBeInTheDocument();
    expect(selectorPanel.className).not.toMatch(/absolute|fixed/);
    expect(vehicleCard).not.toHaveClass("relative", "absolute", "fixed");
    expect(vehicleCard.closest("section")).toContainElement(screen.getByRole("heading", { level: 1 }));
    expect(screen.getAllByLabelText("MARCA")).toHaveLength(1);
    expect(screen.queryByText("Compatibilidad de vehículo")).not.toBeInTheDocument();

    await user.selectOptions(selector.getByLabelText("MARCA"), "Chevrolet");
    await user.selectOptions(await selector.findByLabelText("MODELO"), "Onix");
    await screen.findByRole("option", { name: "2020" });
    await user.selectOptions(selector.getByLabelText("AÑO"), "2020");
    await user.click(within(screen.getByTestId("vehicle-selection")).getByRole("button", { name: "Confirmar" }));

    expect(screen.getByTestId("vehicle-selection")).toHaveAttribute("data-compatibilidad", "incompatible");
    expect(screen.getByText("No es compatible con tu Chevrolet Onix 2020")).toBeInTheDocument();
    expect(screen.getByText("Chevrolet Onix 2020")).toBeInTheDocument();
    const collapsedControls = screen.getByTestId("vehicle-selection").lastElementChild;
    expect(collapsedControls).toHaveClass("grid-rows-[0fr]");
    expect(within(screen.getByTestId("vehicle-selection")).getByLabelText("MARCA")).toBeInTheDocument();
    fireEvent.transitionEnd(collapsedControls, { propertyName: "grid-template-rows" });
    expect(within(screen.getByTestId("vehicle-selection")).queryByLabelText("MARCA")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Filtro compatible" }))
      .toBeInTheDocument();
  });

  it("cancels vehicle changes without changing the active vehicle", async () => {
    const user = userEvent.setup();
    obtenerMarcas.mockResolvedValue([
      { brand: "Chevrolet" },
      { brand: "Volkswagen" },
    ]);
    render(
      <>
        <ActivarVehiculo vehiculo={{ brand: "Volkswagen", model: "Gol", year: "2021" }} />
        <DetalleProducto {...navigationProps()} producto={repuestoCompatible()} />
      </>
    );

    expect(screen.getByText("Volkswagen Gol 2021")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Cambiar" })[0]);
    await user.selectOptions(await screen.findByLabelText("MARCA"), "Chevrolet");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    const collapsedControls = screen.getByTestId("vehicle-selection").lastElementChild;
    expect(collapsedControls).toHaveClass("grid-rows-[0fr]");
    expect(within(screen.getByTestId("vehicle-selection")).getByLabelText("MARCA")).toBeInTheDocument();
    expect(screen.getByText("Volkswagen Gol 2021")).toBeInTheDocument();
    expect(screen.getByTestId("vehicle-selection")).toHaveAttribute("data-compatibilidad", "compatible");
    fireEvent.transitionEnd(collapsedControls, { propertyName: "grid-template-rows" });
    expect(within(screen.getByTestId("vehicle-selection")).queryByLabelText("MARCA")).not.toBeInTheDocument();
  });

  it("lists all structured applications in the compatibility card", () => {
    render(<DetalleProducto {...navigationProps()} producto={repuestoCompatible()} />);

    const card = within(screen.getByTestId("compatibility-card"));
    expect(card.getByText("Chevrolet Onix")).toBeInTheDocument();
    expect(card.getByText("Motor: 1.4 8V \u00b7 A\u00f1os: 2013\u20132019")).toBeInTheDocument();
    expect(card.getByText("Volkswagen Gol")).toBeInTheDocument();
    expect(card.getByText("Motor: 1.6 MSI \u00b7 A\u00f1os: 2020\u20132022")).toBeInTheDocument();
  });

  it("separates vehicle, engine, and years from text applications", () => {
    const productWithTextApplications = {
      ...repuestoCompatible(),
      compatibilidades: [],
      aplicaciones: ["Volkswagen Gol 2019 Highline 1.6 MSI"],
    };
    render(<DetalleProducto {...navigationProps()} producto={productWithTextApplications} />);

    const card = within(screen.getByTestId("compatibility-card"));
    expect(card.getByText("Volkswagen Gol")).toBeInTheDocument();
    expect(card.getByText("Motor: 1.6 MSI \u00b7 A\u00f1o: 2019")).toBeInTheDocument();
    expect(card.queryByText(/Highline/)).not.toBeInTheDocument();
  });

  it("shows the manufacturer above the name, never a compatible car brand, and the new details", async () => {
    const user = userEvent.setup();
    const props = navigationProps();
    props.onAlternarFavorito = jest.fn();
    props.esFavorito = jest.fn(() => false);
    const repuesto = mapearRepuesto({
      id: 7,
      name: "Filtro de aceite Mann-Filter 1.4 8V",
      manufacturer: "Mann-Filter",
      part_code: "FIL-0001",
      category: "Filtros",
      price: 790,
      stock: 3,
      compatible_brands: ["Chevrolet"],
      compatible_models: ["Onix"],
      description: "Filtro de aceite Mann-Filter 1.4 8V. Retiene las impurezas del aceite.",
      specifications: [["Rosca", "M20 x 1,5"]],
      warranty_months: 6,
      warranty_provider: "fabricante",
      compatibilities: [
        { brand: "Chevrolet", model: "Onix", engine_code: "1.4 8V", year_from: 2013, year_to: 2019 },
      ],
    });

    render(<DetalleProducto {...props} producto={repuesto} />);

    expect(screen.getByRole("heading", { level: 1, name: repuesto.nombre })).toBeInTheDocument();
    expect(screen.getByText("Mann-Filter", { selector: "p" })).toBeInTheDocument();
    expect(screen.queryByText("Chevrolet", { exact: true })).not.toBeInTheDocument();
    expect(screen.getByText(/Retiene las impurezas/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Descripción" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Especificaciones" })).toBeInTheDocument();
    expect(screen.getByText("M20 x 1,5")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Descripción" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Especificaciones" })).not.toBeInTheDocument();
    expect(screen.getByText("6 meses")).toBeInTheDocument();
    expect(screen.getByText("Fabricante")).toBeInTheDocument();
    const specificationsHeading = screen.getByRole("heading", { name: "Especificaciones" });
    const warrantyHeading = screen.getByRole("heading", { name: "Garantía" });
    expect(specificationsHeading.compareDocumentPosition(warrantyHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(screen.getByTestId("warranty-details")).getByText("6 meses")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Garantía" })).not.toBeInTheDocument();
    expect(screen.getAllByText("6 meses")).toHaveLength(1);

    expect(within(screen.getByTestId("compatibility-card")).getByText("Chevrolet Onix")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Opiniones/ })).not.toBeInTheDocument();
  });

  it("does not invent warranty data when the product has no warranty fields", async () => {
    const user = userEvent.setup();
    const repuestoSinGarantia = mapearRepuesto({
      id: 8,
      name: "Filtro sin garantía informada",
      price: 500,
      stock: 1,
      compatibilities: [],
    });

    render(<DetalleProducto {...navigationProps()} producto={repuestoSinGarantia} />);
    expect(within(screen.getByTestId("warranty-details")).getAllByText("No especificado")).toHaveLength(2);
    expect(within(screen.getByTestId("warranty-details")).getByText("Proveedor")).toBeInTheDocument();
    expect(within(screen.getByTestId("warranty-details")).queryByText("Condiciones")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Garantía" })).not.toBeInTheDocument();
    expect(screen.queryByText(/defectos de fabricación/i)).not.toBeInTheDocument();
  });

  it("shows warranty conditions only when the product has real condition data", () => {
    const repuesto = {
      ...repuestoCompatible(),
      garantiaMeses: 12,
      proveedorGarantia: "fabricante",
      condicionesGarantia: "Presentar comprobante de compra.",
    };

    render(<DetalleProducto {...navigationProps()} producto={repuesto} />);

    const warranty = screen.getByTestId("warranty-details");
    expect(within(warranty).getByText("12 meses")).toBeInTheDocument();
    expect(within(warranty).getByText("Fabricante")).toBeInTheDocument();
    expect(within(warranty).getByText("Presentar comprobante de compra.")).toBeInTheDocument();
  });

  it("shows the add notice with the chosen quantity and supports undo and cart navigation", async () => {
    const user = userEvent.setup();
    const props = navigationProps();
    buscarTexto.mockResolvedValue({
      parts: [],
      entities: { part: true },
    });
    props.onAlternarFavorito = jest.fn();
    props.esFavorito = jest.fn(() => false);

    startClientSession();
    render(<><DetalleProducto {...props} producto={product} /><RutaActual /></>);

    await user.click(screen.getByRole("button", { name: "Aumentar cantidad" }));
    await user.click(screen.getByRole("button", { name: /agregar al carrito/i }));

    await waitFor(() => expect(agregarItemCarrito).toHaveBeenCalledWith("TEST-001", 2));
    const aviso = (await screen.findByText("Agregado al carrito")).closest("[aria-live]");
    expect(within(aviso).getByText("Pastillas de prueba")).toBeInTheDocument();
    expect(within(aviso).getByText(/×2/)).toBeInTheDocument();

    await user.click(within(aviso).getByRole("button", { name: "Deshacer" }));
    await waitFor(() => expect(eliminarItemCarrito).toHaveBeenCalledWith("TEST-001"));
    expect(screen.queryByText("Agregado al carrito")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /agregar al carrito|^agregado$/i }));
    await user.click(await screen.findByRole("button", { name: "Ver carrito" }));
    expect(screen.getByTestId("ruta-actual")).toHaveTextContent("/carrito");
    expect(screen.queryByText("Agregado al carrito")).not.toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Especificaciones" })).toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: /Quitar .* del carrito/ }));

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

  it("makes the breadcrumb steps links, except the current page", async () => {
    const user = userEvent.setup();
    const props = navigationProps();

    render(<Favoritos {...props} favoritos={[]} />);

    await user.click(screen.getByRole("button", { name: "Inicio" }));
    expect(props.onHome).toHaveBeenCalled();
    // La página actual es texto, no link.
    expect(screen.getByText("Favoritos", { selector: "span" }).closest("button")).toBeNull();
  });

  it("renders favorites and supports remove, detail, and add actions", async () => {
    const user = userEvent.setup();
    const props = navigationProps();
    props.onAlternarFavorito = jest.fn();
    props.onDetalle = jest.fn();

    startClientSession();
    render(<Favoritos {...props} favoritos={[product]} />);
    const favoriteButtons = screen.getAllByRole("button", { name: "Quitar de favoritos" });
    await user.click(favoriteButtons[favoriteButtons.length - 1]);
    await user.click(screen.getByRole("button", { name: product.nombre }));
    await user.click(screen.getByRole("button", { name: /agregar al carrito/i }));

    expect(props.onAlternarFavorito).toHaveBeenCalledWith(product);
    expect(props.onDetalle).toHaveBeenCalledWith(product);
    await waitFor(() => expect(agregarItemCarrito).toHaveBeenCalledWith("TEST-001", 1));
  });

  it("confirms the add to cart with a notice that can undo it", async () => {
    const user = userEvent.setup();
    const props = navigationProps();
    startClientSession();
    render(<Favoritos {...props} favoritos={[product]} />);

    await user.click(screen.getByRole("button", { name: /agregar al carrito/i }));

    const aviso = (await screen.findByText("Agregado al carrito")).closest("[aria-live]");
    expect(within(aviso).getByText(product.nombre)).toBeInTheDocument();
    await user.click(within(aviso).getByRole("button", { name: "Deshacer" }));
    await waitFor(() => expect(eliminarItemCarrito).toHaveBeenCalledWith("TEST-001"));
    expect(screen.queryByText("Agregado al carrito")).not.toBeInTheDocument();
  });
});

describe("ConfirmacionAgregarCarrito", () => {
  afterEach(() => jest.useRealTimers());

  it("closes by itself after a few seconds, but waits while the mouse is over it", () => {
    jest.useFakeTimers();
    const onCerrar = jest.fn();
    renderBase(
      <ConfirmacionAgregarCarrito
        aviso={{ tipo: "agregado", producto: product, cantidadAgregada: 1 }}
        cantidadCarrito={1}
        total={1500}
        onDeshacer={jest.fn()}
        onCerrar={onCerrar}
        onVerCarrito={jest.fn()}
      />
    );
    const tarjeta = screen.getByText("Agregado al carrito").closest("[aria-live] > div");

    fireEvent.mouseEnter(tarjeta);
    act(() => jest.advanceTimersByTime(DURACION_AVISO_MS + 1000));
    expect(onCerrar).not.toHaveBeenCalled();

    fireEvent.mouseLeave(tarjeta);
    act(() => jest.advanceTimersByTime(DURACION_AVISO_MS - 1));
    expect(onCerrar).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(1));
    expect(onCerrar).toHaveBeenCalledTimes(1);
  });

  it("the next notice closes by itself even if the previous one was closed with the mouse over it", () => {
    jest.useFakeTimers();
    const onCerrar = jest.fn();
    const props = { cantidadCarrito: 1, total: 1500, onDeshacer: jest.fn(), onCerrar, onVerCarrito: jest.fn() };
    const aviso = () => ({ tipo: "agregado", producto: product, cantidadAgregada: 1 });
    const { rerender } = renderBase(<ConfirmacionAgregarCarrito {...props} aviso={aviso()} />);

    // Se cierra con el mouse encima: el mouseLeave nunca llega.
    fireEvent.mouseEnter(screen.getByText("Agregado al carrito").closest("[aria-live] > div"));
    rerender(<ConfirmacionAgregarCarrito {...props} aviso={null} />);
    rerender(<ConfirmacionAgregarCarrito {...props} aviso={aviso()} />);

    act(() => jest.advanceTimersByTime(DURACION_AVISO_MS));
    expect(onCerrar).toHaveBeenCalledTimes(1);
  });
});

describe("Login", () => {
  it("lleva a recuperar la contraseña", async () => {
    const user = userEvent.setup();
    const onOlvidePassword = jest.fn();
    render(<Login {...navigationProps()} onOlvidePassword={onOlvidePassword} />);

    await user.click(screen.getByRole("button", { name: "¿Olvidaste tu contraseña?" }));

    expect(onOlvidePassword).toHaveBeenCalled();
  });

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

  const loginConPerfil = async (perfil) => {
    const user = userEvent.setup();
    const props = navigationProps();
    props.onIniciarSesion = jest.fn();
    const payload = btoa(JSON.stringify({ sub: "7", user_type: "client" }));
    login.mockResolvedValue({ access_token: `h.${payload}.s`, token_type: "bearer" });
    perfil();

    render(<Login {...props} onRegistro={jest.fn()} />);
    await user.type(screen.getByPlaceholderText("tu@email.com"), "Lucia@Example.com");
    await user.type(screen.getByPlaceholderText("••••••••"), "secreto123");
    await user.click(screen.getByRole("button", { name: "INICIAR SESIÓN" }));
    return props;
  };

  it("loads name and phone from the backend profile into the session", async () => {
    const props = await loginConPerfil(() =>
      obtenerPerfil.mockResolvedValue({
        nombre: "Lucia Gomez",
        apellido: "",
        email: "lucia@example.com",
        telefono: "099 123 456",
      })
    );

    await waitFor(() => expect(props.onIniciarSesion).toHaveBeenCalled());
    expect(obtenerPerfil).toHaveBeenCalledWith(expect.stringMatching(/^h\./));
    expect(props.onIniciarSesion).toHaveBeenCalledWith(
      expect.objectContaining({
        token: expect.any(String),
        userId: "7",
        nombre: "Lucia Gomez",
        email: "lucia@example.com",
        telefono: "099 123 456",
      }),
      false
    );
  });

  it("still logs in when the profile cannot be loaded", async () => {
    const props = await loginConPerfil(() =>
      obtenerPerfil.mockRejectedValue(new Error("No pudimos cargar tu perfil."))
    );

    await waitFor(() => expect(props.onIniciarSesion).toHaveBeenCalled());
    expect(props.onIniciarSesion.mock.calls[0][0]).toEqual(
      expect.objectContaining({ userId: "7", email: "Lucia@Example.com" })
    );
    expect(props.onIniciarSesion.mock.calls[0][0].telefono).toBeUndefined();
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
    expect(screen.getByRole("img", { name: "Logo Volkswagen" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Volkswagen/i }));
    expect(props.onCatalogo).toHaveBeenCalledWith(null, null, { marca: "Volkswagen" });
  });
});

describe("App", () => {
  it("shows the footer on the store pages but not on login", async () => {
    const user = userEvent.setup();
    renderBase(
      <MemoryRouter>
        <CartProvider><VehicleProvider><PitProvider><App /></PitProvider></VehicleProvider></CartProvider>
      </MemoryRouter>
    );

    expect(screen.getByRole("contentinfo")).toHaveTextContent("Mis pedidos");
    await user.click(screen.getByTitle("Iniciar sesión"));
    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
  });

  it("starts on home and changes pages through the navbar", async () => {
    const user = userEvent.setup();
    renderBase(
      <MemoryRouter>
         <CartProvider><VehicleProvider><PitProvider><App /></PitProvider></VehicleProvider></CartProvider>
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
        <CartProvider><VehicleProvider><PitProvider><App /></PitProvider></VehicleProvider></CartProvider>
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

describe("App y Pit", () => {
  const payload = btoa(JSON.stringify({ sub: "1", user_type: "client", exp: 4102444800 }));

  const renderEn = (ruta) =>
    renderBase(
      <MemoryRouter initialEntries={[ruta]}>
        <CartProvider><VehicleProvider><PitProvider><App /></PitProvider></VehicleProvider></CartProvider>
      </MemoryRouter>
    );

  it("shows the floating Pit to a client on the store pages", () => {
    localStorage.setItem("autobought-sesion", JSON.stringify({ id: 1, nombre: "Ana", token: `x.${payload}.y` }));
    renderEn("/");

    expect(screen.getByRole("button", { name: "Abrir Pit, el asistente con IA" })).toBeInTheDocument();
  });

  it("does not show it without a session: the invitation asks to log in", async () => {
    const user = userEvent.setup();
    renderEn("/");

    expect(screen.queryByRole("button", { name: /Abrir Pit/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "HABLAR CON PIT" }));
    expect(screen.getByRole("heading", { name: "INICIAR SESIÓN" })).toBeInTheDocument();
  });

  it("opens Pit at the side from the home invitation, without a page of its own", async () => {
    const user = userEvent.setup();
    localStorage.setItem("autobought-sesion", JSON.stringify({ id: 1, nombre: "Ana", token: `x.${payload}.y` }));
    renderEn("/");

    await user.click(screen.getByRole("button", { name: "HABLAR CON PIT" }));

    expect(screen.getByRole("dialog", { name: "Pit, tu mecánico con IA" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /repuestos que te/i })).toBeInTheDocument();
  });
});

describe("Accesos a Pit", () => {
  const payload = btoa(JSON.stringify({ sub: "1", user_type: "client", exp: 4102444800 }));
  const conSesion = () =>
    localStorage.setItem("autobought-sesion", JSON.stringify({ id: 1, nombre: "Ana", token: `x.${payload}.y` }));

  it("opens Pit from the menu; without a session it asks to log in", async () => {
    const user = userEvent.setup();
    const onLogin = jest.fn();
    const { unmount } = render(<Navbar usuario={null} onLogin={onLogin} />);

    await user.click(screen.getByRole("button", { name: /Pit IA/ }));
    expect(onLogin).toHaveBeenCalled();
    unmount();

    conSesion();
    render(<><Navbar usuario={{ id: 1, nombre: "Ana" }} onLogin={onLogin} /><PanelPit /></>);
    await user.click(screen.getByRole("button", { name: /Pit IA/ }));
    expect(screen.getByRole("dialog", { name: "Pit, tu mecánico con IA" })).toBeInTheDocument();
  });

  it("does not show Pit in the menu to the seller", () => {
    render(<Navbar usuario={{ id: 1, nombre: "Vendedor", userType: TIPO_VENDEDOR }} onLogin={jest.fn()} />);

    expect(screen.queryByRole("button", { name: /Pit IA/ })).not.toBeInTheDocument();
  });

  it("suggests Pit when a catalog search finds nothing, with the search already written", async () => {
    const user = userEvent.setup();
    conSesion();
    render(<><InvitacionAsistente variante="sinResultados" termino="ruido al frenar" /><PanelPit /></>);

    expect(screen.getByText("¿Y si se lo contás a Pit?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Preguntarle a Pit" }));

    expect(screen.getByRole("dialog", { name: "Pit, tu mecánico con IA" })).toBeInTheDocument();
    expect(screen.getByLabelText("Mensaje para Pit")).toHaveValue("ruido al frenar");
  });
});

describe("App avisos de stock", () => {
  const payload = btoa(JSON.stringify({ sub: "1", user_type: "client", exp: 4102444800 }));
  const agotado = { ...catalogProducts[2], id: "FAR-77", partId: 77, nombre: "Faro Agotado", stock: 0 };

  const renderCatalogo = async () => {
    const user = userEvent.setup();
    obtenerRepuestos.mockResolvedValue([catalogProducts[0], agotado]);
    renderBase(
      <MemoryRouter initialEntries={["/catalogo"]}>
        <CartProvider><VehicleProvider><PitProvider><App /></PitProvider></VehicleProvider></CartProvider>
      </MemoryRouter>
    );
    await screen.findByText("Faro Agotado");
    return user;
  };

  const conSesion = () =>
    localStorage.setItem(
      "autobought-sesion",
      JSON.stringify({ id: 1, nombre: "Ana", token: `x.${payload}.y` })
    );

  it("solo los repuestos sin stock ofrecen el aviso", async () => {
    await renderCatalogo();

    expect(screen.getAllByRole("button", { name: /Avisame cuando haya/ })).toHaveLength(1);
  });

  it("pide y cancela el aviso de un repuesto agotado", async () => {
    conSesion();
    const user = await renderCatalogo();

    await user.click(screen.getByRole("button", { name: /Avisame cuando haya/ }));

    expect(agregarAvisoStock).toHaveBeenCalledWith(77);
    expect(toast.success).toHaveBeenCalled();
    const pedido = await screen.findByRole("button", { name: /Te vamos a avisar/ });
    expect(pedido).toHaveAttribute("aria-pressed", "true");

    await user.click(pedido);

    expect(quitarAvisoStock).toHaveBeenCalledWith(77);
    expect(await screen.findByRole("button", { name: /Avisame cuando haya/ })).toBeInTheDocument();
  });

  it("muestra los avisos que ya había pedido", async () => {
    conSesion();
    obtenerAvisosStock.mockResolvedValue([77]);
    await renderCatalogo();

    expect(await screen.findByRole("button", { name: /Te vamos a avisar/ })).toBeInTheDocument();
  });

  it("si falla, vuelve atrás y muestra el error", async () => {
    conSesion();
    agregarAvisoStock.mockRejectedValue(new Error("No pudimos actualizar el aviso."));
    const user = await renderCatalogo();

    await user.click(screen.getByRole("button", { name: /Avisame cuando haya/ }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("No pudimos actualizar el aviso."));
    expect(screen.getByRole("button", { name: /Avisame cuando haya/ })).toBeInTheDocument();
  });

  it("sin sesión lleva al login", async () => {
    const user = await renderCatalogo();

    await user.click(screen.getByRole("button", { name: /Avisame cuando haya/ }));

    expect(agregarAvisoStock).not.toHaveBeenCalled();
    expect(await screen.findByRole("heading", { name: "INICIAR SESIÓN" })).toBeInTheDocument();
  });
});

describe("App favoritos", () => {
  const tokenValido = () => {
    const payload = btoa(JSON.stringify({ sub: "1", user_type: "client", exp: 4102444800 }));
    return `x.${payload}.y`;
  };

  const corazon = async (nombre) => {
    const imagen = await screen.findByAltText(nombre);
    return within(imagen.parentElement).getByRole("button");
  };

  const renderApp = (ruta = "/") =>
    renderBase(
      <MemoryRouter initialEntries={[ruta]}>
        <CartProvider><VehicleProvider><PitProvider><App /><RutaActual /></PitProvider></VehicleProvider></CartProvider>
      </MemoryRouter>
    );

  beforeEach(() => {
    localStorage.setItem(
      "autobought-sesion",
      JSON.stringify({ id: 1, nombre: "Test User", token: tokenValido() })
    );
  });

  it("loads the saved favorites from the backend when there is a session", async () => {
    const user = userEvent.setup();
    obtenerFavoritos.mockResolvedValue([catalogProducts[1]]);
    renderApp();

    await waitFor(() => expect(obtenerFavoritos).toHaveBeenCalled());
    await user.click(screen.getByTitle("Favoritos"));

    expect(await screen.findByText("Discos de Freno Delanteros")).toBeInTheDocument();
  });

  it("opens a saved favorite using its backend ID in the URL", async () => {
    const user = userEvent.setup();
    const favorite = { ...catalogProducts[1], id: "22", partId: 22 };
    obtenerFavoritos.mockResolvedValue([favorite]);
    obtenerRepuesto.mockResolvedValue(favorite);
    renderApp();

    await user.click(screen.getByTitle("Favoritos"));
    await user.click(await screen.findByRole("button", { name: favorite.nombre }));

    expect(await screen.findByRole("heading", { level: 1, name: favorite.nombre })).toBeInTheDocument();
    expect(screen.getByTestId("ruta-actual")).toHaveTextContent("/producto/discos-de-freno-delanteros-22");
    expect(obtenerRepuesto).toHaveBeenCalledWith("22");
  });

  it("opens a cart suggestion using its backend ID in the URL", async () => {
    const user = userEvent.setup();
    const itemCarrito = { ...catalogProducts[0], id: "21", partId: 21, cantidad: 1 };
    const suggestion = { ...catalogProducts[1], id: "22", partId: 22 };
    obtenerCarrito.mockResolvedValue({ items: [itemCarrito], total: itemCarrito.precio });
    obtenerRecomendaciones.mockResolvedValue([suggestion]);
    obtenerRepuesto.mockResolvedValue(suggestion);
    renderApp("/carrito");

    await user.click(await screen.findByRole("button", { name: suggestion.nombre }));

    expect(await screen.findByRole("heading", { level: 1, name: suggestion.nombre })).toBeInTheDocument();
    expect(screen.getByTestId("ruta-actual")).toHaveTextContent("/producto/discos-de-freno-delanteros-22");
    expect(obtenerRepuesto).toHaveBeenCalledWith("22");
  });

  it("does not ask the backend for favorites without a session", () => {
    localStorage.clear();
    renderApp();

    expect(obtenerFavoritos).not.toHaveBeenCalled();
  });

  it("marks and unmarks a favorite from the catalog through the API", async () => {
    const user = userEvent.setup();
    renderApp();

    const nombre = "Pastillas de Freno Delanteras Bosch";
    await user.click(screen.getByRole("button", { name: "Repuestos" }));
    await user.click(await corazon(nombre));

    expect(agregarFavoritoAPI).toHaveBeenCalledWith("BP1234");
    expect(await corazon(nombre)).toHaveAttribute("aria-pressed", "true");

    await user.click(await corazon(nombre));

    expect(quitarFavoritoAPI).toHaveBeenCalledWith("BP1234");
    expect(await corazon(nombre)).toHaveAttribute("aria-pressed", "false");
  });

  it("reverts the heart and shows the error when the API fails", async () => {
    const user = userEvent.setup();
    agregarFavoritoAPI.mockRejectedValue(new Error("No pudimos actualizar tus favoritos."));
    renderApp();

    const nombre = "Pastillas de Freno Delanteras Bosch";
    await user.click(screen.getByRole("button", { name: "Repuestos" }));
    await user.click(await corazon(nombre));

    await waitFor(async () => expect(await corazon(nombre)).toHaveAttribute("aria-pressed", "false"));
    expect(toast.error).toHaveBeenCalledWith("No pudimos actualizar tus favoritos.");
  });
});

describe("App sesión", () => {
  it("does not restore the session when a save finishes after logging out", async () => {
    const user = userEvent.setup();
    const payload = btoa(JSON.stringify({ sub: "1", user_type: "client", exp: 4102444800 }));
    const token = `x.${payload}.y`;
    localStorage.setItem(
      "autobought-sesion",
      JSON.stringify({ id: 1, nombre: "Ana", email: "ana@example.com", token })
    );
    obtenerPerfil.mockResolvedValue({ nombre: "Ana", apellido: "", email: "ana@example.com", telefono: "" });
    let responder;
    actualizarPerfil.mockReturnValue(new Promise((resolve) => { responder = resolve; }));

    renderBase(
      <MemoryRouter initialEntries={["/perfil"]}>
        <CartProvider><VehicleProvider><PitProvider><App /></PitProvider></VehicleProvider></CartProvider>
      </MemoryRouter>
    );
    await user.click(await screen.findByRole("button", { name: "EDITAR" }));
    await user.click(screen.getByRole("button", { name: /guardar cambios/i }));
    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    responder({ nombre: "Ana", apellido: "", email: "ana@example.com", telefono: "" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(localStorage.getItem("autobought-sesion")).toBeNull();
    expect(sessionStorage.getItem("autobought-sesion")).toBeNull();
  });
});

describe("App verificación del correo", () => {
  const payload = btoa(JSON.stringify({ sub: "1", user_type: "client", exp: 4102444800 }));
  const sesionSinVerificar = {
    userId: "1", nombre: "Ana", email: "ana@example.com", token: `x.${payload}.y`, emailVerificado: false,
  };

  it("muestra el aviso a un cliente sin verificar", () => {
    localStorage.setItem("autobought-sesion", JSON.stringify(sesionSinVerificar));

    renderBase(
      <MemoryRouter>
        <CartProvider><VehicleProvider><PitProvider><App /></PitProvider></VehicleProvider></CartProvider>
      </MemoryRouter>
    );

    expect(screen.getByRole("region", { name: "Verificación del correo" })).toBeInTheDocument();
  });

  it("al abrir el enlace del mail con la sesión iniciada, saca el aviso", async () => {
    localStorage.setItem("autobought-sesion", JSON.stringify(sesionSinVerificar));
    verificarCorreo.mockResolvedValue();

    renderBase(
      <MemoryRouter initialEntries={["/verificar-correo?token=tok-mail"]}>
        <CartProvider><VehicleProvider><PitProvider><App /></PitProvider></VehicleProvider></CartProvider>
      </MemoryRouter>
    );

    expect(await screen.findByText(/Tu correo quedó verificado/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Verificación del correo" })).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("autobought-sesion")).emailVerificado).toBe(true);
  });

  it("el enlace del mail también funciona sin sesión", async () => {
    verificarCorreo.mockResolvedValue();

    renderBase(
      <MemoryRouter initialEntries={["/verificar-correo?token=tok-mail"]}>
        <CartProvider><VehicleProvider><PitProvider><App /></PitProvider></VehicleProvider></CartProvider>
      </MemoryRouter>
    );

    expect(await screen.findByText(/Tu correo quedó verificado/)).toBeInTheDocument();
    expect(localStorage.getItem("autobought-sesion")).toBeNull();
  });
});

describe("App rutas", () => {
  const renderEn = (ruta) =>
    renderBase(
      <MemoryRouter initialEntries={[ruta]}>
        <CartProvider><VehicleProvider><PitProvider><App /><RutaActual /></PitProvider></VehicleProvider></CartProvider>
      </MemoryRouter>
    );

  it("opens the catalog product using its backend ID in the URL", async () => {
    const user = userEvent.setup();
    const catalogProduct = { ...catalogProducts[0], id: "21", partId: 21 };
    obtenerRepuestos.mockResolvedValue([catalogProduct]);
    obtenerRepuesto.mockResolvedValue(catalogProduct);

    renderEn("/catalogo");
    await user.click(await screen.findByRole("button", { name: "Ver detalle" }));

    expect(await screen.findByRole("heading", { level: 1, name: catalogProduct.nombre })).toBeInTheDocument();
    expect(screen.getByTestId("ruta-actual")).toHaveTextContent("/producto/pastillas-de-freno-delanteras-bosch-21");
    expect(obtenerRepuesto).toHaveBeenCalledWith("21");
  });

  it.each(["/favoritos", "/perfil", "/direcciones", "/historial", "/pago?pedido=1"])(
    "sends anonymous users from %s to the login instead of a blank page",
    (ruta) => {
      renderEn(ruta);

      expect(screen.getByRole("heading", { name: "INICIAR SESIÓN" })).toBeInTheDocument();
    }
  );

  it("shows the not found page for an unknown address and goes back home", async () => {
    const user = userEvent.setup();
    renderEn("/no-existe");

    expect(screen.getByRole("heading", { name: "Esta página no existe" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "VOLVER AL INICIO" }));

    expect(screen.getByRole("heading", { name: /repuestos que te/i })).toBeInTheDocument();
  });
});

describe("App renovación de sesión", () => {
  const MIN = 60 * 1000;
  const sesionQueVenceEn = (minutos) => ({
    id: 1,
    userId: "1",
    nombre: "Ana",
    email: "ana@example.com",
    token: crearToken(Date.now() + minutos * MIN),
    tokenType: "bearer",
  });

  const renderApp = () =>
    renderBase(
      <MemoryRouter initialEntries={["/"]}>
        <CartProvider><VehicleProvider><PitProvider><App /></PitProvider></VehicleProvider></CartProvider>
      </MemoryRouter>
    );

  it("replaces the token of a remembered session before it expires, keeping the rest of the session", async () => {
    const sesion = sesionQueVenceEn(4);
    const nuevo = crearToken(Date.now() + 60 * MIN);
    localStorage.setItem("autobought-sesion", JSON.stringify(sesion));
    renovarToken.mockResolvedValueOnce({ access_token: nuevo, token_type: "bearer" });

    renderApp();

    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem("autobought-sesion")).token).toBe(nuevo)
    );
    expect(JSON.parse(localStorage.getItem("autobought-sesion"))).toEqual({ ...sesion, token: nuevo });
    expect(sessionStorage.getItem("autobought-sesion")).toBeNull();
    expect(renovarToken).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
    // Los favoritos no se vuelven a pedir por cambiar el token.
    expect(obtenerFavoritos).toHaveBeenCalledTimes(1);
  });

  it("keeps a non-remembered session in sessionStorage after renewing", async () => {
    const nuevo = crearToken(Date.now() + 60 * MIN);
    sessionStorage.setItem("autobought-sesion", JSON.stringify(sesionQueVenceEn(4)));
    renovarToken.mockResolvedValueOnce({ access_token: nuevo, token_type: "bearer" });

    renderApp();

    await waitFor(() =>
      expect(JSON.parse(sessionStorage.getItem("autobought-sesion")).token).toBe(nuevo)
    );
    expect(localStorage.getItem("autobought-sesion")).toBeNull();
  });

  it("does not ask for a new token while the current one is far from expiring", async () => {
    localStorage.setItem("autobought-sesion", JSON.stringify(sesionQueVenceEn(60)));

    renderApp();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(renovarToken).not.toHaveBeenCalled();
  });

  it("closes the session and warns the client when the API answers 401", async () => {
    localStorage.setItem("autobought-sesion", JSON.stringify(sesionQueVenceEn(4)));
    renovarToken.mockRejectedValueOnce(Object.assign(new Error("vencida"), { status: 401 }));

    renderApp();

    await waitFor(() => expect(localStorage.getItem("autobought-sesion")).toBeNull());
    expect(toast.error).toHaveBeenCalledWith("Tu sesión se cerró. Iniciá sesión de nuevo.");
  });
});

describe("App sesión inválida (401)", () => {
  const MIN = 60 * 1000;
  const sesion = {
    id: 1,
    userId: "1",
    nombre: "Ana",
    email: "ana@example.com",
    token: crearToken(Date.now() + 60 * MIN),
    tokenType: "bearer",
  };

  // Captura el manejador que App registra en api.js con alSesionInvalida.
  const renderApp = (ruta = "/favoritos") => {
    const desregistrar = jest.fn();
    alSesionInvalida.mockReturnValue(desregistrar);

    const vista = renderBase(
      <MemoryRouter initialEntries={[ruta]}>
        <CartProvider><VehicleProvider><PitProvider><App /><RutaActual /></PitProvider></VehicleProvider></CartProvider>
      </MemoryRouter>
    );

    return { ...vista, desregistrar, manejador: alSesionInvalida.mock.calls.at(-1)[0] };
  };

  it("closes the session, warns once and goes to the login when the handler fires", async () => {
    localStorage.setItem("autobought-sesion", JSON.stringify(sesion));
    const { manejador } = renderApp();

    act(() => manejador());

    await waitFor(() => expect(screen.getByTestId("ruta-actual")).toHaveTextContent("/login"));
    expect(localStorage.getItem("autobought-sesion")).toBeNull();
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith("Tu sesión se cerró. Iniciá sesión de nuevo.");
  });

  it("warns and navigates only once when several requests answer 401 at once", async () => {
    localStorage.setItem("autobought-sesion", JSON.stringify(sesion));
    const { manejador } = renderApp();

    act(() => {
      manejador();
      manejador();
      manejador();
    });

    await waitFor(() => expect(screen.getByTestId("ruta-actual")).toHaveTextContent("/login"));
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it("does nothing if there is no session left to close", () => {
    const { manejador } = renderApp("/");

    act(() => manejador());

    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.getByTestId("ruta-actual")).toHaveTextContent("/");
  });

  it("rolls back a favorite without a second toast when the API answers 401", async () => {
    const user = userEvent.setup();
    localStorage.setItem("autobought-sesion", JSON.stringify(sesion));
    agregarFavoritoAPI.mockRejectedValueOnce(Object.assign(new Error("Tu sesión venció."), { status: 401 }));
    renderApp("/");

    const nombre = "Pastillas de Freno Delanteras Bosch";
    const corazon = async () =>
      within((await screen.findByAltText(nombre)).parentElement).getByRole("button");
    await user.click(screen.getByRole("button", { name: "Repuestos" }));
    await user.click(await corazon());

    await waitFor(async () => expect(await corazon()).toHaveAttribute("aria-pressed", "false"));
    expect(agregarFavoritoAPI).toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.getByTestId("ruta-actual")).toHaveTextContent("/catalogo");
  });

  it("unregisters the handler when App unmounts", () => {
    const { unmount, desregistrar } = renderApp("/");

    unmount();

    expect(desregistrar).toHaveBeenCalled();
  });

  it("follows the token saved by another screen, so renewal works on the new token", async () => {
    localStorage.setItem("autobought-sesion", JSON.stringify(sesion));
    renderApp("/");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(renovarToken).not.toHaveBeenCalled();

    // Cambia la contraseña: CambiarPassword guarda el token nuevo. Si App no
    // lo siguiera, `usuario` conservaría el viejo (60 min de vida) y no se
    // programaría nada; con el nuevo (4 min) la renovación corre enseguida.
    renovarToken.mockResolvedValue({
      access_token: crearToken(Date.now() + 60 * MIN),
      token_type: "bearer",
    });
    act(() =>
      guardarSesion({ ...obtenerSesion(), token: crearToken(Date.now() + 4 * MIN) })
    );

    await waitFor(() => expect(renovarToken).toHaveBeenCalledTimes(1));
  });
});

describe("Direcciones ante un 401", () => {
  // El 401 ya lo maneja alSesionInvalida (cierra la sesión y va a /login):
  // las pantallas no tienen que sumar un alert propio.
  const error401 = () => Object.assign(new Error("Tu sesión venció. Iniciá sesión de nuevo."), { status: 401 });
  const direccion = {
    id: 1, nombre: "Casa", calle: "Av. Italia", numero: "1234", apartamento: "",
    ciudad: "Montevideo", departamento: "Montevideo", codigoPostal: "", principal: false,
  };
  let alertSpy;

  beforeEach(() => {
    alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
  });

  afterEach(() => alertSpy.mockRestore());

  it.each([
    ["ELIMINAR", () => eliminarDireccionAPI],
    ["MARCAR COMO PRINCIPAL", () => marcarDireccionPrincipal],
  ])("%s does not show an alert on 401", async (boton, accion) => {
    const user = userEvent.setup();
    obtenerDirecciones.mockResolvedValue([direccion]);
    render(<Direcciones {...navigationProps()} onPerfil={jest.fn()} />);
    accion().mockRejectedValueOnce(error401());

    await user.click(await screen.findByRole("button", { name: boton }));

    await waitFor(() => expect(accion()).toHaveBeenCalled());
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("still alerts other errors", async () => {
    const user = userEvent.setup();
    obtenerDirecciones.mockResolvedValue([direccion]);
    eliminarDireccionAPI.mockRejectedValueOnce(new Error("No encontramos esa dirección."));
    render(<Direcciones {...navigationProps()} onPerfil={jest.fn()} />);

    await user.click(await screen.findByRole("button", { name: "ELIMINAR" }));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("No encontramos esa dirección."));
  });
});

describe("Perfil", () => {
  it("edits personal information and exposes profile actions", async () => {
    const user = userEvent.setup();
    const props = navigationProps();
    props.onActualizarUsuario = jest.fn();
    props.onDirecciones = jest.fn();
    props.onHistorial = jest.fn();
    props.onCerrarSesion = jest.fn();
    const usuario = {
      id: 1,
      nombre: "Ana",
      apellido: "Perez",
      email: "ana@example.com",
      telefono: "099123456",
    };
    actualizarPerfil.mockResolvedValue({
      nombre: "Ana Maria Perez",
      apellido: "",
      email: "ana@example.com",
      telefono: "099 123 456",
    });

    render(<Perfil {...props} usuario={usuario} />);
    expect(screen.getByRole("heading", { name: "Información personal" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "EDITAR" }));
    expect(screen.queryByText("APELLIDO")).not.toBeInTheDocument();
    const nameInput = screen.getByDisplayValue("Ana Perez");
    await user.clear(nameInput);
    await user.type(nameInput, "Ana Maria Perez");
    await user.click(screen.getByRole("button", { name: /guardar cambios/i }));
    await user.click(screen.getByRole("button", { name: /direcciones/i }));
    await user.click(screen.getByRole("button", { name: /historial de compra/i }));
    await user.click(screen.getByRole("button", { name: /cerrar sesión/i }));

    expect(actualizarPerfil).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: "Ana Maria Perez", apellido: "" })
    );
    expect(props.onActualizarUsuario).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, nombre: "Ana Maria Perez" })
    );
    expect(props.onDirecciones).toHaveBeenCalled();
    expect(props.onHistorial).toHaveBeenCalled();
    expect(props.onCerrarSesion).toHaveBeenCalled();
  });

  it("keeps editing and shows the error when saving fails", async () => {
    const user = userEvent.setup();
    const props = navigationProps();
    props.onActualizarUsuario = jest.fn();
    actualizarPerfil.mockRejectedValue(
      new Error("Revisá el nombre y el teléfono (ej: 099 123 456).")
    );

    render(<Perfil {...props} usuario={{ nombre: "Ana", email: "ana@example.com", telefono: "099 123 456" }} />);
    await user.click(screen.getByRole("button", { name: "EDITAR" }));
    await user.click(screen.getByRole("button", { name: /guardar cambios/i }));

    expect(
      await screen.findByText("Revisá el nombre y el teléfono (ej: 099 123 456).")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /guardar cambios/i })).toBeInTheDocument();
    expect(props.onActualizarUsuario).not.toHaveBeenCalled();
  });

  it("does not let the user remove the phone, only change it", async () => {
    const user = userEvent.setup();
    render(<Perfil {...navigationProps()} usuario={{ nombre: "Ana", email: "ana@example.com", telefono: "099 123 456" }} />);

    await user.click(screen.getByRole("button", { name: "EDITAR" }));
    await user.clear(screen.getByDisplayValue("099 123 456"));
    await user.click(screen.getByRole("button", { name: /guardar cambios/i }));

    expect(screen.getByText("Ingresá tu teléfono.")).toBeInTheDocument();
    expect(actualizarPerfil).not.toHaveBeenCalled();
  });

  it("ignores a late profile response once the user started editing", async () => {
    const user = userEvent.setup();
    const props = navigationProps();
    props.onActualizarUsuario = jest.fn();
    let responder;
    obtenerPerfil.mockReturnValue(new Promise((resolve) => { responder = resolve; }));

    render(<Perfil {...props} usuario={{ token: "t", nombre: "Ana", email: "ana@example.com" }} />);
    await user.click(screen.getByRole("button", { name: "EDITAR" }));
    await user.type(screen.getByDisplayValue("Ana"), " Maria");
    responder({ nombre: "Ana vieja", apellido: "", email: "ana@example.com", telefono: "" });
    await waitFor(() => expect(obtenerPerfil).toHaveBeenCalled());

    expect(props.onActualizarUsuario).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("Ana Maria")).toBeInTheDocument();
  });

  it("warns when the saved profile could not be loaded", async () => {
    obtenerPerfil.mockRejectedValue(new Error("No pudimos cargar tu perfil."));

    render(<Perfil {...navigationProps()} usuario={{ token: "t", nombre: "Ana", email: "ana@example.com" }} />);

    expect(
      await screen.findByText("No pudimos actualizar tus datos, puede que no estén al día.")
    ).toBeInTheDocument();
  });

  it("clears the save error when the user edits the data again", async () => {
    const user = userEvent.setup();
    actualizarPerfil.mockRejectedValue(new Error("Revisá el nombre y el teléfono (ej: 099 123 456)."));
    render(<Perfil {...navigationProps()} usuario={{ nombre: "Ana", email: "ana@example.com", telefono: "099 123 456" }} />);

    await user.click(screen.getByRole("button", { name: "EDITAR" }));
    await user.click(screen.getByRole("button", { name: /guardar cambios/i }));
    expect(await screen.findByText("Revisá el nombre y el teléfono (ej: 099 123 456).")).toBeInTheDocument();

    await user.type(screen.getByDisplayValue("Ana"), "a");

    expect(screen.queryByText("Revisá el nombre y el teléfono (ej: 099 123 456).")).not.toBeInTheDocument();
  });

  it("refreshes the session with the profile from the backend", async () => {
    const props = navigationProps();
    props.onActualizarUsuario = jest.fn();
    obtenerPerfil.mockResolvedValue({
      nombre: "Ana desde otro dispositivo",
      apellido: "",
      email: "ana@example.com",
      telefono: "",
    });

    render(<Perfil {...props} usuario={{ token: "t", nombre: "Ana", email: "ana@example.com" }} />);

    await waitFor(() =>
      expect(props.onActualizarUsuario).toHaveBeenCalledWith(
        expect.objectContaining({ token: "t", nombre: "Ana desde otro dispositivo" })
      )
    );
    expect(obtenerPerfil).toHaveBeenCalledWith("t");
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

describe("CambiarPassword", () => {
  const completar = async (user, { actual, nueva, repetir }) => {
    await user.click(screen.getByRole("button", { name: "CAMBIAR CONTRASEÑA" }));
    if (actual) await user.type(screen.getByLabelText("CONTRASEÑA ACTUAL"), actual);
    if (nueva) await user.type(screen.getByLabelText("NUEVA CONTRASEÑA"), nueva);
    if (repetir) await user.type(screen.getByLabelText("REPETIR NUEVA CONTRASEÑA"), repetir);
    await user.click(screen.getByRole("button", { name: "GUARDAR CONTRASEÑA" }));
  };

  const respuesta = { access_token: "jwt-nuevo", token_type: "bearer" };

  it("changes the password and shows a confirmation", async () => {
    const user = userEvent.setup();
    cambiarPassword.mockResolvedValue(respuesta);
    render(<CambiarPassword />);

    await completar(user, { actual: "secreto123", nueva: "nueva-clave-1", repetir: "nueva-clave-1" });

    expect(cambiarPassword).toHaveBeenCalledWith("secreto123", "nueva-clave-1");
    expect(await screen.findByText("Tu contraseña se actualizó correctamente.")).toBeInTheDocument();
    expect(screen.queryByLabelText("CONTRASEÑA ACTUAL")).not.toBeInTheDocument();
  });

  it("saves the new token in the session, keeping the rest of it, before showing the success", async () => {
    const user = userEvent.setup();
    const sesion = { id: 1, nombre: "Ana", email: "ana@example.com", token: "jwt-viejo", tokenType: "bearer" };
    localStorage.setItem("autobought-sesion", JSON.stringify(sesion));
    cambiarPassword.mockResolvedValue(respuesta);
    render(<CambiarPassword />);

    await completar(user, { actual: "secreto123", nueva: "nueva-clave-1", repetir: "nueva-clave-1" });

    expect(await screen.findByText("Tu contraseña se actualizó correctamente.")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("autobought-sesion"))).toEqual({
      ...sesion,
      token: "jwt-nuevo",
      tokenType: "bearer",
    });
    expect(sessionStorage.getItem("autobought-sesion")).toBeNull();
  });

  it("keeps a non-remembered session in sessionStorage when saving the new token", async () => {
    const user = userEvent.setup();
    sessionStorage.setItem("autobought-sesion", JSON.stringify({ id: 1, token: "jwt-viejo" }));
    cambiarPassword.mockResolvedValue(respuesta);
    render(<CambiarPassword />);

    await completar(user, { actual: "secreto123", nueva: "nueva-clave-1", repetir: "nueva-clave-1" });

    await screen.findByText("Tu contraseña se actualizó correctamente.");
    expect(JSON.parse(sessionStorage.getItem("autobought-sesion")).token).toBe("jwt-nuevo");
    expect(localStorage.getItem("autobought-sesion")).toBeNull();
  });

  it("warns that the session is no longer valid when the response has no new token", async () => {
    const user = userEvent.setup();
    localStorage.setItem("autobought-sesion", JSON.stringify({ id: 1, token: "jwt-viejo" }));
    cambiarPassword.mockResolvedValue(null);
    render(<CambiarPassword />);

    await completar(user, { actual: "secreto123", nueva: "nueva-clave-1", repetir: "nueva-clave-1" });

    expect(await screen.findByRole("alert")).toHaveTextContent(/iniciá sesión de nuevo/i);
    expect(screen.queryByText("Tu contraseña se actualizó correctamente.")).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("autobought-sesion")).token).toBe("jwt-viejo");
  });

  it("does not touch the session when the password change fails", async () => {
    const user = userEvent.setup();
    localStorage.setItem("autobought-sesion", JSON.stringify({ id: 1, token: "jwt-viejo" }));
    cambiarPassword.mockRejectedValue(new Error("La contraseña actual es incorrecta."));
    render(<CambiarPassword />);

    await completar(user, { actual: "mal", nueva: "nueva-clave-1", repetir: "nueva-clave-1" });

    await screen.findByText("La contraseña actual es incorrecta.");
    expect(JSON.parse(localStorage.getItem("autobought-sesion")).token).toBe("jwt-viejo");
  });

  it("shows an error under each empty field before calling the API", async () => {
    const user = userEvent.setup();
    render(<CambiarPassword />);

    await completar(user, {});

    expect(screen.getByText("Ingresá tu contraseña actual.")).toBeInTheDocument();
    expect(screen.getByText("La contraseña tiene que tener al menos 8 caracteres.")).toBeInTheDocument();
    expect(cambiarPassword).not.toHaveBeenCalled();
  });

  it.each([
    ["too short", "corta1", "corta1", "La contraseña tiene que tener al menos 8 caracteres."],
    ["without numbers", "solotexto", "solotexto", "La contraseña tiene que tener al menos una letra y un número."],
    ["too common", "qwerty123", "qwerty123", "Esa contraseña es muy común. Elegí otra."],
    ["equal to the current one", "secreto123", "secreto123", "La nueva contraseña tiene que ser distinta de la actual."],
    ["containing the email", "lucia2026", "lucia2026", "La contraseña no puede contener tu correo."],
    ["not repeated", "nueva-clave-1", "otra-clave-1", "Las contraseñas no coinciden."],
  ])("rejects a new password %s", async (_caso, nueva, repetir, mensaje) => {
    const user = userEvent.setup();
    render(<CambiarPassword email="lucia@example.com" />);

    await completar(user, { actual: "secreto123", nueva, repetir });

    expect(screen.getByText(mensaje)).toBeInTheDocument();
    expect(cambiarPassword).not.toHaveBeenCalled();
  });

  it("shows the backend error and keeps the form open", async () => {
    const user = userEvent.setup();
    cambiarPassword.mockRejectedValue(new Error("La contraseña actual es incorrecta."));
    render(<CambiarPassword />);

    await completar(user, { actual: "mal", nueva: "nueva-clave-1", repetir: "nueva-clave-1" });

    expect(await screen.findByText("La contraseña actual es incorrecta.")).toBeInTheDocument();
    expect(screen.getByLabelText("CONTRASEÑA ACTUAL")).toBeInTheDocument();
  });

  it("clears the error when the user edits a field", async () => {
    const user = userEvent.setup();
    cambiarPassword.mockRejectedValue(new Error("La contraseña actual es incorrecta."));
    render(<CambiarPassword />);

    await completar(user, { actual: "mal", nueva: "nueva-clave-1", repetir: "nueva-clave-1" });
    expect(await screen.findByText("La contraseña actual es incorrecta.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("CONTRASEÑA ACTUAL"), "x");

    expect(screen.queryByText("La contraseña actual es incorrecta.")).not.toBeInTheDocument();
  });

  it("clears the form when cancelling", async () => {
    const user = userEvent.setup();
    render(<CambiarPassword />);

    await user.click(screen.getByRole("button", { name: "CAMBIAR CONTRASEÑA" }));
    await user.type(screen.getByLabelText("CONTRASEÑA ACTUAL"), "secreto123");
    await user.click(screen.getByRole("button", { name: "CANCELAR" }));
    await user.click(screen.getByRole("button", { name: "CAMBIAR CONTRASEÑA" }));

    expect(screen.getByLabelText("CONTRASEÑA ACTUAL")).toHaveValue("");
  });
});

describe("Registro", () => {
  // JWT mínimo (header.payload.firma) para que decodeToken lo pueda leer.
  const fakeToken = () => {
    const payload = btoa(JSON.stringify({ sub: "7", user_type: "client" }));
    return `x.${payload}.y`;
  };

  const renderRegistro = () => {
    const user = userEvent.setup();
    const props = navigationProps();
    props.onRegistroExitoso = jest.fn();
    render(<Registro {...props} />);
    return { user, props };
  };

  const completar = async (user, datos = {}) => {
    const d = {
      nombre: "Lucia",
      apellido: "Gomez",
      email: "Lucia@Example.com",
      telefono: "099123456",
      password: "secreto123",
      confirmar: "secreto123",
      terminos: true,
      ...datos,
    };
    await user.type(screen.getByPlaceholderText("Tu nombre"), d.nombre);
    await user.type(screen.getByPlaceholderText("Tu apellido"), d.apellido);
    await user.type(screen.getByPlaceholderText("tu@email.com"), d.email);
    await user.type(screen.getByPlaceholderText("099 123 456"), d.telefono);
    await user.type(screen.getByPlaceholderText("Mínimo 8 caracteres"), d.password);
    await user.type(screen.getByPlaceholderText("Repetí tu contraseña"), d.confirmar);
    if (d.terminos) await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /crear cuenta/i }));
  };

  it("registers against the API and starts the session with the returned token", async () => {
    registrar.mockResolvedValue({ access_token: fakeToken(), token_type: "bearer" });
    const { user, props } = renderRegistro();

    await completar(user);

    await waitFor(() => expect(props.onRegistroExitoso).toHaveBeenCalled());
    expect(registrar).toHaveBeenCalledWith({
      nombre: "Lucia",
      apellido: "Gomez",
      email: "Lucia@Example.com",
      telefono: "099123456",
      password: "secreto123",
    });
    expect(props.onRegistroExitoso).toHaveBeenCalledWith(
      expect.objectContaining({
        token: expect.any(String),
        userId: "7",
        userType: "client",
        email: "lucia@example.com",
        nombre: "Lucia Gomez",
        apellido: "",
        telefono: "099 123 456",
      })
    );
    // Ya no se guardan usuarios (y menos contraseñas) en el navegador.
    expect(localStorage.getItem("autobought-usuarios")).toBeNull();
  });

  it("shows the server message when the email is already in use", async () => {
    registrar.mockRejectedValue(new Error("El correo ya está en uso."));
    const { user, props } = renderRegistro();

    await completar(user, { email: "test@autobought.com" });

    expect(await screen.findByText("El correo ya está en uso.")).toBeInTheDocument();
    expect(props.onRegistroExitoso).not.toHaveBeenCalled();
  });

  it("shows an error under each field of an empty form", async () => {
    const { user, props } = renderRegistro();

    await user.click(screen.getByRole("button", { name: /crear cuenta/i }));

    expect(screen.getByText("El nombre no puede estar vacío.")).toBeInTheDocument();
    expect(screen.getByText("El apellido no puede estar vacío.")).toBeInTheDocument();
    expect(screen.getByText("Ingresá tu correo electrónico.")).toBeInTheDocument();
    expect(screen.getByText("Ingresá tu teléfono.")).toBeInTheDocument();
    expect(screen.getByText("La contraseña tiene que tener al menos 8 caracteres.")).toBeInTheDocument();
    expect(screen.getByText("Repetí la contraseña.")).toBeInTheDocument();
    expect(screen.getByText("Tenés que aceptar los términos y condiciones.")).toBeInTheDocument();
    expect(registrar).not.toHaveBeenCalled();
    expect(props.onRegistroExitoso).not.toHaveBeenCalled();
  });

  it.each([
    ["a name with numbers", { nombre: "Lucia2" }, "El nombre solo puede tener letras, espacios, apóstrofos y guiones."],
    ["a one letter surname", { apellido: "G" }, "El apellido tiene que tener al menos 2 letras."],
    ["a malformed email", { email: "no-es-un-correo" }, "Ingresá un correo electrónico válido."],
    ["a non-Uruguayan phone", { telefono: "+54 9 11 1234 5678" }, "Ingresá un teléfono uruguayo válido (ej: 099 123 456)."],
    ["a too short phone", { telefono: "099 12" }, "Ingresá un teléfono uruguayo válido (ej: 099 123 456)."],
    [
      "a password shorter than 8 characters",
      { password: "clave12", confirmar: "clave12" },
      "La contraseña tiene que tener al menos 8 caracteres.",
    ],
    [
      "a password without numbers",
      { password: "solotexto", confirmar: "solotexto" },
      "La contraseña tiene que tener al menos una letra y un número.",
    ],
    [
      "a password that contains the email",
      { password: "lucia2026", confirmar: "lucia2026" },
      "La contraseña no puede contener tu correo.",
    ],
    [
      "passwords that do not match",
      { confirmar: "otra-cosa-123" },
      "Las contraseñas no coinciden.",
    ],
    ["unaccepted terms", { terminos: false }, "Tenés que aceptar los términos y condiciones."],
  ])("does not call the API with %s", async (_caso, datos, mensaje) => {
    const { user, props } = renderRegistro();

    await completar(user, datos);

    expect(screen.getByText(mensaje)).toBeInTheDocument();
    expect(registrar).not.toHaveBeenCalled();
    expect(props.onRegistroExitoso).not.toHaveBeenCalled();
  });

  it("shows backend validation errors under their field", async () => {
    registrar.mockRejectedValue(
      Object.assign(new Error("Revisá los datos ingresados."), {
        campos: { password: "Esa contraseña es muy común. Elegí otra." },
      })
    );
    const { user } = renderRegistro();

    await completar(user);

    expect(await screen.findByText("Esa contraseña es muy común. Elegí otra.")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Mínimo 8 caracteres")).toHaveAttribute("aria-invalid", "true");
  });

  it("disables the button while the request is in flight", async () => {
    let resolver;
    registrar.mockReturnValue(new Promise((resolve) => (resolver = resolve)));
    const { user } = renderRegistro();

    await completar(user);

    expect(await screen.findByRole("button", { name: /creando cuenta/i })).toBeDisabled();
    resolver({ access_token: fakeToken(), token_type: "bearer" });
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
    await user.type(screen.getByPlaceholderText("Ej: 1234 o S/N"), "1234");
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

  const completarDireccion = async (user, d = {}) => {
    const datos = { nombre: "Casa", ciudad: "Montevideo", calle: "Av. Italia", numero: "1234", departamento: "Montevideo", ...d };
    await user.click(await screen.findByRole("button", { name: /agregar dirección/i }));
    if (datos.nombre) await user.type(screen.getByPlaceholderText("Ej: Casa"), datos.nombre);
    if (datos.ciudad) await user.type(screen.getByPlaceholderText("Ej: Montevideo"), datos.ciudad);
    if (datos.calle) await user.type(screen.getByPlaceholderText("Ej: Av. Italia"), datos.calle);
    if (datos.numero) await user.type(screen.getByPlaceholderText("Ej: 1234 o S/N"), datos.numero);
    if (datos.codigoPostal) await user.type(screen.getByPlaceholderText("Opcional (ej: 11300)"), datos.codigoPostal);
    if (datos.departamento) await user.selectOptions(screen.getByRole("combobox"), datos.departamento);
    await user.click(screen.getByRole("button", { name: /guardar dirección/i }));
  };

  it("shows an error under each required field", async () => {
    const user = userEvent.setup();
    render(<Direcciones {...navigationProps()} onPerfil={jest.fn()} />);

    await completarDireccion(user, { nombre: "", ciudad: "", calle: "", numero: "", departamento: "" });

    expect(screen.getByText("Poné un nombre para la dirección (ej: Casa).")).toBeInTheDocument();
    expect(screen.getByText("La calle no puede estar vacía.")).toBeInTheDocument();
    expect(screen.getByText("El número de puerta no puede estar vacío.")).toBeInTheDocument();
    expect(screen.getByText("La ciudad no puede estar vacía.")).toBeInTheDocument();
    expect(screen.getByText("Seleccioná un departamento.")).toBeInTheDocument();
    expect(crearDireccion).not.toHaveBeenCalled();
  });

  it.each([
    ["a city of another department", { ciudad: "Montevideo", departamento: "Artigas" }, "Montevideo no está en el departamento de Artigas."],
    ["a door number with letters only", { numero: "abc" }, "Ingresá un número de puerta válido (ej: 1234, 1234B, 1234 bis o S/N)."],
    ["a street without letters", { calle: "1234" }, "Ingresá un nombre de calle válido (ej: Av. Italia, 18 de Julio)."],
    ["a postal code that is not 5 digits", { codigoPostal: "113" }, "El código postal tiene que tener 5 dígitos."],
  ])("rejects %s", async (_caso, datos, mensaje) => {
    const user = userEvent.setup();
    render(<Direcciones {...navigationProps()} onPerfil={jest.fn()} />);

    await completarDireccion(user, datos);

    expect(screen.getByText(mensaje)).toBeInTheDocument();
    expect(crearDireccion).not.toHaveBeenCalled();
  });

  it("shows a duplicated address error from the API", async () => {
    const user = userEvent.setup();
    crearDireccion.mockRejectedValue(Object.assign(new Error("Ya tenés guardada esta dirección."), { campos: {} }));
    render(<Direcciones {...navigationProps()} onPerfil={jest.fn()} />);

    await completarDireccion(user);

    expect(await screen.findByRole("alert")).toHaveTextContent("Ya tenés guardada esta dirección.");
  });

  it("shows the account menu with the current section marked and a log out", async () => {
    const user = userEvent.setup();
    const props = { ...navigationProps(), onHistorial: jest.fn(), onCerrarSesion: jest.fn() };
    obtenerDirecciones.mockResolvedValue([]);

    render(<Direcciones {...props} usuario={{ nombre: "Ana Pérez" }} />);

    const menu = screen.getByRole("navigation", { name: "Mi cuenta" });
    expect(within(menu).getByRole("button", { name: "Direcciones" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Hola, Ana")).toBeInTheDocument();

    expect(within(menu).queryByRole("button", { name: "Métodos de pago" })).not.toBeInTheDocument();
    await user.click(within(menu).getByRole("button", { name: "Historial de compras" }));
    await user.click(within(menu).getByRole("button", { name: "Cerrar sesión" }));

    expect(props.onHistorial).toHaveBeenCalled();
    expect(props.onCerrarSesion).toHaveBeenCalled();
  });

  it("opens the account menu from the navbar also inside the account pages", async () => {
    const user = userEvent.setup();
    const props = { ...navigationProps(), onHistorial: jest.fn() };
    obtenerDirecciones.mockResolvedValue([]);

    render(<Direcciones {...props} usuario={{ nombre: "Ana", email: "ana@example.com" }} />);

    await user.click(screen.getByTitle("Mi cuenta"));
    // "Mi perfil" está solo en el menú desplegable (el menú de la
    // izquierda dice "Información personal").
    const desplegable = screen.getByRole("button", { name: "Mi perfil" }).closest("div.absolute");
    await user.click(within(desplegable).getByRole("button", { name: "Historial de compras" }));

    expect(props.onHistorial).toHaveBeenCalled();
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
    // El menú de la cuenta reemplaza al viejo "Volver a mi perfil".
    await user.click(screen.getByRole("button", { name: "Información personal" }));
    expect(onPerfil).toHaveBeenCalled();
    expect(marcarDireccionPrincipal).toHaveBeenCalledWith(2);
  });
});

describe("HistorialCompras", () => {
  it("renders an empty state and API-provided purchase details", async () => {
    const props = navigationProps();
    render(<HistorialCompras {...props} onPerfil={jest.fn()} />);
    expect(
      await screen.findByText("Todavía no realizaste ninguna compra.")
    ).toBeInTheDocument();

    obtenerHistorialCompras.mockResolvedValue([
      {
        id: "ORD-1",
        fecha: "2026-01-15T00:00:00.000Z",
        total: 2500,
        items: [],
      },
    ]);
    render(<HistorialCompras {...props} onPerfil={jest.fn()} />);

    expect(await screen.findByText("#ORD-1")).toBeInTheDocument();
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

    const repuestos = [
      { nombre: "Bujía 1.4", fabricante: "NGK" },
      { nombre: "Bujía 1.4", fabricante: "Bosch" },
      { nombre: "Filtro 1.4", fabricante: "Mann-Filter" },
    ];
    expect(filtrarRepuestos(repuestos, { fabricantes: ["NGK", "Mann-Filter"] }))
      .toEqual([repuestos[0], repuestos[2]]);
    expect(filtrarRepuestos(repuestos, { busqueda: "bosch" })).toEqual([repuestos[1]]);
    // Por palabras, en cualquier orden y sin importar las tildes.
    expect(filtrarRepuestos(repuestos, { busqueda: "ngk bujia" })).toEqual([repuestos[0]]);
    // El auto no está en el nombre: se encuentra por los modelos compatibles.
    const radiadores = [
      { nombre: "Radiador Valeo", marcas: ["Chevrolet"], modelos: ["Onix"] },
      { nombre: "Radiador Valeo", marcas: ["Fiat"], modelos: ["Cronos"] },
    ];
    expect(filtrarRepuestos(radiadores, { busqueda: "radiador onix" })).toEqual([radiadores[0]]);

    const conPrecio = [
      { nombre: "Faro", precio: 6900, stock: 0, marcas: ["Ford"] },
      { nombre: "Bujía", precio: 620, stock: 4, marcas: ["Fiat", "Ford"] },
      { nombre: "Aceite", precio: 2600, stock: 9, marcas: ["Fiat"] },
    ];
    const nombres = (lista) => lista.map((p) => p.nombre);
    expect(nombres(filtrarRepuestos(conPrecio, { precioMin: "600", precioMax: "3000" })))
      .toEqual(["Bujía", "Aceite"]);
    expect(nombres(filtrarRepuestos(conPrecio, { precioMax: "", soloConStock: true })))
      .toEqual(["Bujía", "Aceite"]);
    expect(nombres(filtrarRepuestos(conPrecio, { marcasAuto: ["Ford"] }))).toEqual(["Faro", "Bujía"]);
    expect(nombres(filtrarRepuestos(conPrecio, { orden: "Nombre A-Z" })))
      .toEqual(["Aceite", "Bujía", "Faro"]);
  });

  it("renders the no-results message", () => {
    render(<SinResultadosBusqueda termino="bujía" />);
    expect(screen.getByRole("status")).toHaveTextContent("bujía");
  });
});

describe("BusquedaCabecera", () => {
  it("no navega ni consulta la API cuando la búsqueda está vacía", async () => {
    const user = userEvent.setup();

    render(
      <>
        <BusquedaCabecera />
        <RutaActual />
      </>
    );

    await user.click(screen.getByRole("button", { name: "Buscar" }));

    expect(screen.getByTestId("ruta-actual")).not.toHaveTextContent(
      "/catalogo"
    );
    expect(buscarTexto).not.toHaveBeenCalled();
  });

  it("navega al catálogo al presionar Enter", async () => {
  const user = userEvent.setup();

  render(
    <>
      <BusquedaCabecera />
      <RutaActual />
    </>
  );

  const input = screen.getByPlaceholderText(
    "¿Qué repuesto estás buscando?"
  );

  await user.type(input, "pastillas de freno onix 2020");
  await user.keyboard("{Enter}");

  expect(screen.getByTestId("ruta-actual")).toHaveTextContent(
    "/catalogo?q=pastillas%20de%20freno%20onix%202020"
  );
  expect(buscarTexto).not.toHaveBeenCalled();
});

});
