import { fireEvent, render as renderBase, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

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
  obtenerMetodosPago: jest.fn(),
  crearMetodoPago: jest.fn(),
  marcarMetodoPagoPrincipal: jest.fn(),
  eliminarMetodoPagoAPI: jest.fn(),
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
import BrandDropdown from "./BrandDropdown";
import BusquedaCabecera from "./BusquedaCabecera";
import CambiarPassword from "./CambiarPassword";
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
import { crearToken } from "./testTokens";
import SearchBar from "./SearchBar";
import SinResultadosBusqueda from "./SinResultadosBusqueda";
import { CartProvider } from "./context/CartContext";
import { VehicleProvider } from "./context/VehicleContext";

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
  crearMetodoPago,
  eliminarDireccionAPI,
  eliminarItemCarrito,
  eliminarMetodoPagoAPI,
  login,
  marcarDireccionPrincipal,
  marcarMetodoPagoPrincipal,
  obtenerCarrito,
  obtenerCategorias,
  obtenerMasVendidos,
  obtenerDirecciones,
  obtenerFavoritos,
  obtenerHistorialCompras,
  obtenerDetalleCompra,
  obtenerMarcas,
  obtenerMetodosPago,
  obtenerModelos,
  obtenerAnios,
  obtenerRepuestos,
  obtenerPerfil,
  obtenerRecomendaciones,
  quitarFavoritoAPI,
  registrar,
  vaciarCarritoAPI,
  renovarToken,
  verificarCorreo,
  obtenerAvisosStock,
  agregarAvisoStock,
  quitarAvisoStock,
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

function render(ui, options = {}) {
  const { initialEntries = ["/"], ...renderOptions } = options;

  return renderBase(
    <MemoryRouter initialEntries={initialEntries}>
      <CartProvider>
        <VehicleProvider>{ui}</VehicleProvider>
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
  obtenerMetodosPago.mockResolvedValue([]);
  crearMetodoPago.mockResolvedValue({});
  marcarMetodoPagoPrincipal.mockResolvedValue({});
  eliminarMetodoPagoAPI.mockResolvedValue({});
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

    expect(props.onCatalogo).toHaveBeenCalledWith();

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

  it("shows the real best sellers and opens the detail of the one clicked", async () => {
    const user = userEvent.setup();
    const props = { ...navigationProps(), onDetalle: jest.fn() };
    obtenerMasVendidos.mockResolvedValue([catalogProducts[0]]);

    render(<Home {...props} />);

    expect(await screen.findByText(catalogProducts[0].nombre)).toBeInTheDocument();
    expect(screen.getByText(`$${catalogProducts[0].precio.toLocaleString("es-UY")}`))
      .toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "VER REPUESTO" }));

    expect(props.onDetalle).toHaveBeenCalledWith(catalogProducts[0]);
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

  it("shows the add confirmation and supports undo, dismissal, and cart navigation", async () => {
    const user = userEvent.setup();
    const props = navigationProps();
    props.onAlternarFavorito = jest.fn();
    props.onDetalle = jest.fn();
    props.esFavorito = jest.fn(() => false);
    startClientSession();
    agregarItemCarrito.mockResolvedValue({
      items: [{
        part_id: "BP1234",
        name: "Pastillas de Freno Delanteras Bosch",
        price: 1500,
        amount: 1,
        subtotal: 1500,
        stock: 5,
        category: "Frenos",
      }],
      total: 1500,
    });

    render(<Catalogo {...props} categoriaInicial="Frenos" />);
    await user.click((await screen.findAllByRole("button", { name: /agregar/i }))[0]);

    let dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Repuesto agregado al carrito.")).toBeInTheDocument();
    expect(within(dialog).getAllByRole("button").map((button) => button.textContent))
      .toEqual(["Deshacer", "Ok", "Ver carrito"]);

    fireEvent.click(dialog.parentElement);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: /agregar/i })[0]);
    dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Ok" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: /agregar/i })[0]);
    dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Deshacer" }));
    await waitFor(() => expect(eliminarItemCarrito).toHaveBeenCalledWith("BP1234"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: /agregar/i })[0]);
    dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Ver carrito" }));
    expect(props.onCarrito).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("undo only removes the quantity that was just added", async () => {
    const user = userEvent.setup();
    const props = navigationProps();
    props.onAlternarFavorito = jest.fn();
    props.onDetalle = jest.fn();
    props.esFavorito = jest.fn(() => false);
    startClientSession();
    // El carrito ya tenía 2 unidades: después de agregar 1 quedan 3.
    agregarItemCarrito.mockResolvedValue({
      items: [{ id: "BP1234", partId: "BP1234", nombre: "Pastillas de Freno Delanteras Bosch", precio: 1500, cantidad: 3 }],
      total: 4500,
    });

    render(<Catalogo {...props} categoriaInicial="Frenos" />);
    await user.click((await screen.findAllByRole("button", { name: /agregar/i }))[0]);

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Deshacer" }));

    await waitFor(() => expect(actualizarItemCarrito).toHaveBeenCalledWith("BP1234", 2));
    expect(eliminarItemCarrito).not.toHaveBeenCalled();
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

describe("DetalleProducto", () => {
  it("shows the add confirmation and supports undo and cart navigation", async () => {
    const user = userEvent.setup();
    const props = navigationProps();
    buscarTexto.mockResolvedValue({
      parts: [],
      entities: { part: true },
    });
    props.onAlternarFavorito = jest.fn();
    props.esFavorito = jest.fn(() => false);

    startClientSession();
    render(<DetalleProducto {...props} producto={product} />);

    await user.click(screen.getByRole("button", { name: "+" }));
    await user.click(screen.getByRole("button", { name: /agregar al carrito/i }));

    await waitFor(() => expect(agregarItemCarrito).toHaveBeenCalledWith("TEST-001", 2));
    let dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Repuesto agregado al carrito.")).toBeInTheDocument();
    expect(within(dialog).getAllByRole("button").map((button) => button.textContent))
      .toEqual(["Deshacer", "Ok", "Ver carrito"]);

    await user.click(within(dialog).getByRole("button", { name: "Deshacer" }));
    await waitFor(() => expect(eliminarItemCarrito).toHaveBeenCalledWith("TEST-001"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /agregar al carrito/i }));
    dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Ver carrito" }));
    expect(props.onCarrito).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Especificaciones" }));
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
    expect(screen.getByText("Volkswagen")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Volkswagen/i }));
    expect(props.onCatalogo).toHaveBeenCalledWith(null, { brand: "Volkswagen", model: "", year: "" });
  });
});

describe("App", () => {
  it("starts on home and changes pages through the navbar", async () => {
    const user = userEvent.setup();
    renderBase(
      <MemoryRouter>
         <CartProvider><VehicleProvider><App /></VehicleProvider></CartProvider>
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
        <CartProvider><VehicleProvider><App /></VehicleProvider></CartProvider>
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

describe("App avisos de stock", () => {
  const payload = btoa(JSON.stringify({ sub: "1", user_type: "client", exp: 4102444800 }));
  const agotado = { ...catalogProducts[2], id: "FAR-77", partId: 77, nombre: "Faro Agotado", stock: 0 };

  const renderCatalogo = async () => {
    const user = userEvent.setup();
    obtenerRepuestos.mockResolvedValue([catalogProducts[0], agotado]);
    renderBase(
      <MemoryRouter initialEntries={["/catalogo"]}>
        <CartProvider><VehicleProvider><App /></VehicleProvider></CartProvider>
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

  const renderApp = () =>
    renderBase(
      <MemoryRouter>
        <CartProvider><VehicleProvider><App /></VehicleProvider></CartProvider>
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
    expect(await corazon(nombre)).toHaveTextContent("♥");

    await user.click(await corazon(nombre));

    expect(quitarFavoritoAPI).toHaveBeenCalledWith("BP1234");
    expect(await corazon(nombre)).toHaveTextContent("♡");
  });

  it("reverts the heart and shows the error when the API fails", async () => {
    const user = userEvent.setup();
    agregarFavoritoAPI.mockRejectedValue(new Error("No pudimos actualizar tus favoritos."));
    renderApp();

    const nombre = "Pastillas de Freno Delanteras Bosch";
    await user.click(screen.getByRole("button", { name: "Repuestos" }));
    await user.click(await corazon(nombre));

    await waitFor(async () => expect(await corazon(nombre)).toHaveTextContent("♡"));
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
        <CartProvider><VehicleProvider><App /></VehicleProvider></CartProvider>
      </MemoryRouter>
    );
    await user.click(await screen.findByRole("button", { name: "EDITAR" }));
    await user.click(screen.getByRole("button", { name: /guardar cambios/i }));
    await user.click(screen.getByRole("button", { name: "CERRAR SESIÓN" }));
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
        <CartProvider><VehicleProvider><App /></VehicleProvider></CartProvider>
      </MemoryRouter>
    );

    expect(screen.getByRole("region", { name: "Verificación del correo" })).toBeInTheDocument();
  });

  it("al abrir el enlace del mail con la sesión iniciada, saca el aviso", async () => {
    localStorage.setItem("autobought-sesion", JSON.stringify(sesionSinVerificar));
    verificarCorreo.mockResolvedValue();

    renderBase(
      <MemoryRouter initialEntries={["/verificar-correo?token=tok-mail"]}>
        <CartProvider><VehicleProvider><App /></VehicleProvider></CartProvider>
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
        <CartProvider><VehicleProvider><App /></VehicleProvider></CartProvider>
      </MemoryRouter>
    );

    expect(await screen.findByText(/Tu correo quedó verificado/)).toBeInTheDocument();
    expect(localStorage.getItem("autobought-sesion")).toBeNull();
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
        <CartProvider><VehicleProvider><App /></VehicleProvider></CartProvider>
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
    expect(toast.error).toHaveBeenCalledWith("Tu sesión venció. Iniciá sesión de nuevo.");
  });
});

describe("MetodosPago", () => {
  // Vencimientos relativos a hoy, para que los tests no venzan con el tiempo.
  const anio = (suma) => String((new Date().getFullYear() + suma) % 100).padStart(2, "0");
  const VIGENTE = `12/${anio(3)}`;

  const abrirFormulario = async (user) => {
    render(<MetodosPago {...navigationProps()} onPerfil={jest.fn()} />);
    await user.click(await screen.findByRole("button", { name: /agregar tarjeta/i }));
  };

  const completarTarjeta = async (user, d = {}) => {
    const datos = { numero: "4111111111111111", titular: "Ana Perez", vencimiento: VIGENTE.replace("/", ""), cvv: "123", ...d };
    if (datos.numero) await user.type(screen.getByLabelText("NÚMERO DE TARJETA *"), datos.numero);
    if (datos.titular) await user.type(screen.getByLabelText("TITULAR *"), datos.titular);
    if (datos.vencimiento) await user.type(screen.getByLabelText("VENCIMIENTO *"), datos.vencimiento);
    if (datos.cvv) await user.type(screen.getByLabelText("CÓDIGO DE SEGURIDAD *"), datos.cvv);
  };

  const guardar = (user) => user.click(screen.getByRole("button", { name: /guardar tarjeta/i }));

  it("detects the brand and only sends brand, last four digits and expiry to the API", async () => {
    const user = userEvent.setup();
    let savedCards = [];
    obtenerMetodosPago.mockImplementation(() => Promise.resolve(savedCards));
    crearMetodoPago.mockImplementation(async ({ tarjeta, titular }) => {
      savedCards = [{
        id: 1, tipo: tarjeta.marca, titular, numero: tarjeta.ultimosCuatro,
        vencimiento: tarjeta.vencimiento, principal: true, vencida: false,
      }];
    });
    await abrirFormulario(user);

    await completarTarjeta(user);
    expect(screen.getByLabelText("TIPO DE TARJETA")).toHaveValue("Visa");
    expect(screen.getByLabelText("TIPO DE TARJETA")).toBeDisabled();
    expect(screen.getByLabelText("NÚMERO DE TARJETA *")).toHaveValue("4111 1111 1111 1111");
    expect(screen.getByLabelText("VENCIMIENTO *")).toHaveValue(VIGENTE);
    await guardar(user);

    expect(await screen.findByText("•••• •••• •••• 1111")).toBeInTheDocument();
    expect(crearMetodoPago).toHaveBeenCalledWith({
      tarjeta: { marca: "Visa", ultimosCuatro: "1111", vencimiento: VIGENTE },
      titular: "Ana Perez",
      principal: false,
    });
    // Ni el número completo ni el CVV llegan a la API.
    expect(JSON.stringify(crearMetodoPago.mock.calls)).not.toMatch(/4111111111111111|"123"/);
  });

  it("shows an error under each empty field", async () => {
    const user = userEvent.setup();
    await abrirFormulario(user);

    await guardar(user);

    expect(screen.getByText("Ingresá el número de la tarjeta.")).toBeInTheDocument();
    expect(screen.getByText("El nombre del titular no puede estar vacío.")).toBeInTheDocument();
    expect(screen.getByText("El vencimiento tiene que tener el formato MM/AA.")).toBeInTheDocument();
    expect(screen.getByText("Ingresá el código de seguridad.")).toBeInTheDocument();
    expect(screen.getByLabelText("TITULAR *")).toHaveAttribute("aria-invalid", "true");
    expect(crearMetodoPago).not.toHaveBeenCalled();
  });

  it.each([
    ["an invalid number (Luhn)", { numero: "4111111111111112" }, "El número de tarjeta no es válido. Revisalo."],
    ["an expired card", { vencimiento: "0120" }, "La tarjeta está vencida."],
    ["a far away expiry", { vencimiento: `12${anio(30)}` }, "Revisá el vencimiento: es demasiado lejano."],
    ["a holder with numbers", { titular: "Ana 123" }, "El nombre del titular solo puede tener letras, espacios, apóstrofos y guiones."],
    ["a short CVV", { cvv: "12" }, "El código de seguridad tiene 3 dígitos."],
  ])("rejects %s", async (_caso, datos, mensaje) => {
    const user = userEvent.setup();
    await abrirFormulario(user);

    await completarTarjeta(user, datos);
    await guardar(user);

    expect(screen.getByText(mensaje)).toBeInTheDocument();
    expect(crearMetodoPago).not.toHaveBeenCalled();
  });

  it("formats American Express 4-6-5 and asks for a 4 digit CVV", async () => {
    const user = userEvent.setup();
    await abrirFormulario(user);

    await completarTarjeta(user, { numero: "378282246310005", cvv: "123" });
    await guardar(user);

    expect(screen.getByLabelText("TIPO DE TARJETA")).toHaveValue("American Express");
    expect(screen.getByLabelText("NÚMERO DE TARJETA *")).toHaveValue("3782 822463 10005");
    expect(screen.getByText("El código de seguridad tiene 4 dígitos.")).toBeInTheDocument();
  });

  it("accepts OCA only when chosen by hand for a number of no other brand", async () => {
    const user = userEvent.setup();
    crearMetodoPago.mockResolvedValue({});
    await abrirFormulario(user);

    await completarTarjeta(user, { numero: "5899123412341234" });
    await guardar(user);
    expect(screen.getByText("Ese número no es de una tarjeta Visa.")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("TIPO DE TARJETA"), "OCA");
    await guardar(user);

    await waitFor(() => expect(crearMetodoPago).toHaveBeenCalledWith(
      expect.objectContaining({ tarjeta: expect.objectContaining({ marca: "OCA", ultimosCuatro: "1234" }) })
    ));
  });

  it("shows backend field errors and conflicts in the form", async () => {
    const user = userEvent.setup();
    const errorCampo = Object.assign(new Error("Revisá los datos de la tarjeta."), {
      campos: { holder: "El nombre del titular tiene que tener al menos 2 letras." },
    });
    crearMetodoPago
      .mockRejectedValueOnce(errorCampo)
      .mockRejectedValueOnce(Object.assign(new Error("Ya tenés guardada esta tarjeta."), { campos: {} }));
    await abrirFormulario(user);
    await completarTarjeta(user);

    await guardar(user);
    expect(await screen.findByText("El nombre del titular tiene que tener al menos 2 letras.")).toBeInTheDocument();

    await guardar(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Ya tenés guardada esta tarjeta.");
  });

  it("marks expired cards and does not offer them as primary", async () => {
    obtenerMetodosPago.mockResolvedValue([
      { id: 1, tipo: "Visa", titular: "Ana", numero: "1111", vencimiento: VIGENTE, principal: true, vencida: false },
      { id: 2, tipo: "OCA", titular: "Ana", numero: "2222", vencimiento: "01/20", principal: false, vencida: true },
    ]);
    render(<MetodosPago {...navigationProps()} onPerfil={jest.fn()} />);

    expect(await screen.findByText("VENCIDA")).toBeInTheDocument();
    expect(screen.getByText("Venció: 01/20")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "MARCAR PRINCIPAL" })).not.toBeInTheDocument();
  });

  it("marks and deletes saved cards", async () => {
    const user = userEvent.setup();
    let savedCards = [
      { id: 1, tipo: "Visa", titular: "Ana", numero: "1111", vencimiento: VIGENTE, principal: true, vencida: false },
      { id: 2, tipo: "Mastercard", titular: "Luis", numero: "2222", vencimiento: VIGENTE, principal: false, vencida: false },
    ];
    obtenerMetodosPago.mockImplementation(() => Promise.resolve(savedCards));
    marcarMetodoPagoPrincipal.mockImplementation(async (id) => {
      savedCards = savedCards.map((card) => ({ ...card, principal: card.id === id }));
    });
    eliminarMetodoPagoAPI.mockImplementation(async (id) => {
      savedCards = savedCards.filter((card) => card.id !== id);
    });
    render(<MetodosPago {...navigationProps()} onPerfil={jest.fn()} />);

    await user.click(await screen.findByRole("button", { name: "MARCAR PRINCIPAL" }));
    expect(await screen.findAllByText("PRINCIPAL")).toHaveLength(1);
    await user.click(screen.getAllByRole("button", { name: "ELIMINAR" })[1]);
    await waitFor(() => expect(screen.queryByText("Luis")).not.toBeInTheDocument());
    expect(marcarMetodoPagoPrincipal).toHaveBeenCalledWith(2);
    expect(eliminarMetodoPagoAPI).toHaveBeenCalledWith(2);
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
    };
    actualizarPerfil.mockResolvedValue({
      nombre: "Ana Maria Perez",
      apellido: "",
      email: "ana@example.com",
      telefono: "099 123 456",
    });

    render(<Perfil {...props} usuario={usuario} />);
    expect(screen.getByRole("heading", { name: "MI PERFIL" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "EDITAR" }));
    expect(screen.queryByText("APELLIDO")).not.toBeInTheDocument();
    const nameInput = screen.getByDisplayValue("Ana Perez");
    await user.clear(nameInput);
    await user.type(nameInput, "Ana Maria Perez");
    await user.click(screen.getByRole("button", { name: /guardar cambios/i }));
    await user.click(screen.getByRole("button", { name: /direcciones/i }));
    await user.click(screen.getByRole("button", { name: /métodos de pago/i }));
    await user.click(screen.getByRole("button", { name: /historial de compra/i }));
    await user.click(screen.getByRole("button", { name: /cerrar sesión/i }));

    expect(actualizarPerfil).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: "Ana Maria Perez", apellido: "" })
    );
    expect(props.onActualizarUsuario).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, nombre: "Ana Maria Perez" })
    );
    expect(props.onDirecciones).toHaveBeenCalled();
    expect(props.onMetodosPago).toHaveBeenCalled();
    expect(props.onHistorialCompras).toHaveBeenCalled();
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

  it("changes the password and shows a confirmation", async () => {
    const user = userEvent.setup();
    cambiarPassword.mockResolvedValue();
    render(<CambiarPassword />);

    await completar(user, { actual: "secreto123", nueva: "nueva-clave-1", repetir: "nueva-clave-1" });

    expect(cambiarPassword).toHaveBeenCalledWith("secreto123", "nueva-clave-1");
    expect(await screen.findByText("Tu contraseña se actualizó correctamente.")).toBeInTheDocument();
    expect(screen.queryByLabelText("CONTRASEÑA ACTUAL")).not.toBeInTheDocument();
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
