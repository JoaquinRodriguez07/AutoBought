import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";

import DetalleProducto from "./DetalleProducto";
import { obtenerRepuesto } from "./api";
import { esVendedor } from "./auth";
import { useVehicle } from "./context/VehicleContext";

jest.mock("./api", () => ({ obtenerRepuesto: jest.fn() }));
jest.mock("./auth", () => ({ esVendedor: jest.fn() }));
jest.mock("./context/VehicleContext", () => ({ useVehicle: jest.fn() }));

// Las piezas de alrededor tienen sus propios tests (components.test.jsx).
jest.mock("./Navbar", () => () => <nav aria-label="Navegación" />);
jest.mock("./VehicleSelector", () => () => null);
jest.mock("./BotonAgregarCarrito", () => ({ cantidad, onTerminar }) => (
  <button onClick={onTerminar}>Agregar {cantidad}</button>
));
jest.mock("./BotonAvisoStock", () => () => null);
jest.mock("./SuelenComprarseJuntos", () => () => null);
jest.mock("./EncabezadoPagina", () => ({ titulo, fin }) => (
  <header>
    <h1>{titulo}</h1>
    {fin}
  </header>
));

const repuesto = {
  id: 7,
  nombre: "Discos de freno",
  fabricante: "Fremax",
  categoria: "Frenos",
  precio: 4200,
  stock: 3,
  imagen: "a.jpg",
  imagenesExtra: [],
  compatibilidades: [],
  aplicaciones: [],
};

function renderDetalle(producto, props = {}) {
  return render(
    <DetalleProducto
      producto={producto}
      esFavorito={() => false}
      onAlternarFavorito={jest.fn()}
      onCatalogo={jest.fn()}
      {...props}
    />
  );
}

// El detalle con un enlace a otro repuesto, para cambiar de página sin desmontarlo.
function renderConEnlaceAOtroRepuesto() {
  return render(
    <MemoryRouter initialEntries={["/producto/7"]}>
      <Link to="/producto/8">Otro repuesto</Link>
      <Routes>
        <Route path="/producto/:id" element={<DetalleProducto esFavorito={() => false} />} />
      </Routes>
    </MemoryRouter>
  );
}

function renderDesdeUrl(id = "7") {
  return render(
    <MemoryRouter initialEntries={[`/producto/${id}`]}>
      <Routes>
        <Route path="/producto/:id" element={<DetalleProducto esFavorito={() => false} />} />
      </Routes>
    </MemoryRouter>
  );
}

const conVehiculo = (vehiculo) => useVehicle.mockReturnValue({ vehiculoActivo: vehiculo, activarVehiculo: jest.fn() });
const veredicto = () => screen.getByTestId("vehicle-selection").dataset.compatibilidad;
const tarjeta = () => within(screen.getByTestId("compatibility-card"));

beforeEach(() => {
  jest.clearAllMocks();
  esVendedor.mockReturnValue(false);
  conVehiculo(null);
});

describe("loading from the URL", () => {
  it("shows the part once it loads", async () => {
    obtenerRepuesto.mockResolvedValue(repuesto);

    renderDesdeUrl();

    expect(screen.getByRole("status")).toHaveTextContent("Cargando");
    expect(await screen.findByRole("heading", { name: "Discos de freno" })).toBeInTheDocument();
    expect(obtenerRepuesto).toHaveBeenCalledWith("7");
  });

  it("says when the part does not exist", async () => {
    obtenerRepuesto.mockRejectedValue(Object.assign(new Error("x"), { status: 404 }));

    renderDesdeUrl();

    expect(await screen.findByRole("alert")).toHaveTextContent("Repuesto no encontrado");
  });

  it("tells a server failure apart from a missing part", async () => {
    obtenerRepuesto.mockRejectedValue(Object.assign(new Error("x"), { status: 500 }));

    renderDesdeUrl();

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cargar el repuesto.");
  });

  describe("when the previous part answers after moving to another one", () => {
    const otroRepuesto = { ...repuesto, id: 8, nombre: "Pastillas de freno" };

    async function irAlOtroRepuesto() {
      let primera;
      obtenerRepuesto
        .mockReturnValueOnce(new Promise((resolve, reject) => (primera = { resolve, reject })))
        .mockResolvedValueOnce(otroRepuesto);
      renderConEnlaceAOtroRepuesto();
      await userEvent.click(screen.getByRole("link", { name: "Otro repuesto" }));
      await screen.findByRole("heading", { name: "Pastillas de freno" });
      return primera;
    }

    it("keeps the current part when the late answer is a success", async () => {
      const primera = await irAlOtroRepuesto();

      await act(async () => primera.resolve(repuesto));

      expect(screen.getByRole("heading", { name: "Pastillas de freno" })).toBeInTheDocument();
    });

    it("keeps the current part when the late answer is a failure", async () => {
      const primera = await irAlOtroRepuesto();

      await act(async () => primera.reject(new Error("x")));

      expect(screen.getByRole("heading", { name: "Pastillas de freno" })).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  it("says the part was not found without an id or a product", () => {
    renderDetalle(null);

    expect(screen.getByRole("alert")).toHaveTextContent("Repuesto no encontrado");
  });
});

describe("compatibility with text applications", () => {
  const aplicaciones = ["Fiat Cronos 2018", "Fiat Palio"];

  it.each([
    ["another brand", { brand: "Toyota" }, "incompatible"],
    ["only the brand", { brand: "Fiat" }, "compatible"],
    ["brand and model without a year", { brand: "Fiat", model: "Cronos" }, "compatible"],
    ["another model", { brand: "Fiat", model: "Uno" }, "incompatible"],
    ["the year in the text", { brand: "Fiat", model: "Cronos", year: "2018" }, "compatible"],
    ["a year other than the one in the text", { brand: "Fiat", model: "Cronos", year: "2019" }, "incompatible"],
    ["a text that names no year", { brand: "Fiat", model: "Palio", year: "2010" }, "no-verificable"],
  ])("gives the right verdict for %s", (_caso, vehiculo, esperado) => {
    conVehiculo(vehiculo);

    renderDetalle({ ...repuesto, aplicaciones });

    expect(veredicto()).toBe(esperado);
  });

  it("ignores blank or non-text applications", () => {
    renderDetalle({ ...repuesto, aplicaciones: ["   ", 5, null] });

    expect(veredicto()).toBe("no-disponible");
  });

  it("treats compatibility data that is not a list as unavailable", () => {
    conVehiculo({ brand: "Fiat" });

    renderDetalle({ ...repuesto, compatibilidades: null, aplicaciones: "Fiat Cronos" });

    expect(veredicto()).toBe("no-disponible");
  });

  it("prefers the structured compatibilities over the text", () => {
    conVehiculo({ brand: "Fiat" });

    renderDetalle({ ...repuesto, compatibilidades: [{ brand: "Toyota" }], aplicaciones });

    expect(veredicto()).toBe("incompatible");
  });
});

describe("compatibility with structured data", () => {
  const onix = { brand: "Chevrolet", model: "Onix", year_from: 2013, year_to: 2019 };

  it.each([
    ["no brand in the data", [{ brand: "" }], { brand: "Chevrolet" }, "no-verificable"],
    ["another brand", [onix], { brand: "Fiat" }, "incompatible"],
    ["only the brand", [onix], { brand: "Chevrolet" }, "compatible"],
    ["no model in the data", [{ brand: "Chevrolet" }], { brand: "Chevrolet", model: "Onix" }, "no-verificable"],
    ["another model", [onix], { brand: "Chevrolet", model: "Prisma" }, "incompatible"],
    ["brand and model without a year", [onix], { brand: "Chevrolet", model: "Onix" }, "compatible"],
    ["a year in range", [onix], { brand: "Chevrolet", model: "Onix", year: "2015" }, "compatible"],
    ["a year out of range", [onix], { brand: "Chevrolet", model: "Onix", year: "2012" }, "incompatible"],
    ["no years in the data", [{ ...onix, year_from: null }], { brand: "Chevrolet", model: "Onix", year: "2015" }, "no-verificable"],
    ["years that are not numbers", [{ ...onix, year_from: "x" }], { brand: "Chevrolet", model: "Onix", year: "2015" }, "no-verificable"],
    ["a reversed range", [{ ...onix, year_from: 2019, year_to: 2013 }], { brand: "Chevrolet", model: "Onix", year: "2015" }, "no-verificable"],
    ["a second row that matches", [{ ...onix, year_to: 2014 }, { ...onix, year_from: 2015 }], { brand: "Chevrolet", model: "Onix", year: "2016" }, "compatible"],
  ])("gives the right verdict for %s", (_caso, compatibilidades, vehiculo, esperado) => {
    conVehiculo(vehiculo);

    renderDetalle({ ...repuesto, compatibilidades });

    expect(veredicto()).toBe(esperado);
  });

  it("does not claim compatibility or the opposite when it cannot be checked", () => {
    conVehiculo({ brand: "Chevrolet" });

    renderDetalle({ ...repuesto, compatibilidades: [{ brand: "" }] });

    expect(tarjeta().queryByText("Compatible con tu vehículo")).not.toBeInTheDocument();
    expect(tarjeta().queryByText(/No es compatible/)).not.toBeInTheDocument();
  });
});

describe("how each application reads", () => {
  it.each([
    ["Fiat Cronos 1.3 2018", "Fiat Cronos", "Motor: 1.3 · Año: 2018"],
    ["Fiat Cronos 2018 2020", "Fiat Cronos", "Años: 2018–2020"],
    ["Fiat Cronos 1.3", "Fiat Cronos", "Motor: 1.3"],
  ])("splits %s", (texto, auto, detalle) => {
    renderDetalle({ ...repuesto, aplicaciones: [texto] });

    expect(tarjeta().getByText(auto)).toBeInTheDocument();
    expect(tarjeta().getByText(detalle)).toBeInTheDocument();
  });

  it("keeps the whole text of an application that starts with its year", () => {
    renderDetalle({ ...repuesto, aplicaciones: ["2018 Fiat Cronos"] });

    expect(tarjeta().getByText("2018 Fiat Cronos")).toBeInTheDocument();
    expect(tarjeta().getByText("Año: 2018")).toBeInTheDocument();
  });

  it("shows only the name of an application without engine or year", () => {
    renderDetalle({ ...repuesto, aplicaciones: ["Fiat Cronos"] });

    expect(tarjeta().getByText("Fiat Cronos")).toBeInTheDocument();
    expect(tarjeta().queryByText(/Motor|Año/)).not.toBeInTheDocument();
  });

  it.each([
    [{ year_from: 2015, year_to: 2015 }, "Año: 2015"],
    [{ year_from: 2015, year_to: 2018 }, "Años: 2015–2018"],
    [{ year_from: 2015 }, "Desde 2015"],
    [{ year_to: 2018 }, "Hasta 2018"],
    [{ engine_code: "1.4", year_from: 2015 }, "Motor: 1.4 · Desde 2015"],
    [{ engine_code: "1.4" }, "Motor: 1.4"],
  ])("describes the years of %j", (datos, texto) => {
    renderDetalle({ ...repuesto, compatibilidades: [{ brand: "Fiat", model: "Uno", ...datos }] });

    expect(tarjeta().getByText("Fiat Uno")).toBeInTheDocument();
    expect(tarjeta().getByText(texto)).toBeInTheDocument();
  });

  it("names a vehicle with no data", () => {
    renderDetalle({ ...repuesto, compatibilidades: [{}] });

    expect(tarjeta().getByText("Vehículo sin identificar")).toBeInTheDocument();
  });
});

describe("warranty", () => {
  const garantia = () => within(screen.getByTestId("warranty-details"));

  it.each([
    ["fabricante", "Fabricante"],
    ["vendedor", "Vendedor (AutoBought)"],
    ["Bosch Uruguay", "Bosch Uruguay"],
    [null, "No especificado"],
  ])("names the provider %s", (proveedorGarantia, texto) => {
    renderDetalle({ ...repuesto, garantiaMeses: 12, proveedorGarantia });

    expect(garantia().getByText("12 meses")).toBeInTheDocument();
    expect(garantia().getByText(texto)).toBeInTheDocument();
  });

  it("does not invent a duration", () => {
    renderDetalle({ ...repuesto, proveedorGarantia: "fabricante" });

    expect(garantia().getByText("No especificado")).toBeInTheDocument();
  });
});

describe("buying", () => {
  const aumentar = () => screen.getByRole("button", { name: "Aumentar cantidad" });
  const disminuir = () => screen.getByRole("button", { name: "Disminuir cantidad" });

  it("does not let the quantity go over the stock", async () => {
    const user = userEvent.setup();
    renderDetalle({ ...repuesto, stock: 2 });

    await user.click(aumentar());

    expect(screen.getByRole("button", { name: "Agregar 2" })).toBeInTheDocument();
    expect(aumentar()).toBeDisabled();
  });

  it("does not let the quantity go under one", async () => {
    const user = userEvent.setup();
    renderDetalle(repuesto);

    await user.click(disminuir());

    expect(screen.getByRole("button", { name: "Agregar 1" })).toBeInTheDocument();
  });

  it("goes back to one unit after adding", async () => {
    const user = userEvent.setup();
    renderDetalle(repuesto);

    await user.click(aumentar());
    await user.click(screen.getByRole("button", { name: "Agregar 2" }));

    expect(screen.getByRole("button", { name: "Agregar 1" })).toBeInTheDocument();
  });

  it("shows zero and blocks the quantity without stock", () => {
    renderDetalle({ ...repuesto, stock: 0 });

    expect(aumentar().previousElementSibling).toHaveTextContent("0");
    expect(aumentar()).toBeDisabled();
    expect(disminuir()).toBeDisabled();
  });

  it("hides the buying controls from a seller", () => {
    esVendedor.mockReturnValue(true);

    renderDetalle(repuesto);

    expect(screen.queryByRole("button", { name: "Aumentar cantidad" })).not.toBeInTheDocument();
    expect(screen.queryByText("Agregar a favoritos")).not.toBeInTheDocument();
  });

  it("toggles a favorite from the button with the text", async () => {
    const user = userEvent.setup();
    const onAlternarFavorito = jest.fn();
    renderDetalle(repuesto, { onAlternarFavorito });

    await user.click(screen.getByRole("button", { name: "Agregar a favoritos" }));

    expect(onAlternarFavorito).toHaveBeenCalledWith(repuesto);
  });

  it("marks a part already in the favorites", () => {
    renderDetalle(repuesto, { esFavorito: () => true });

    expect(screen.getByRole("button", { name: "Agregado a favoritos" })).toBeInTheDocument();
  });
});

describe("images and specifications", () => {
  it("has no thumbnails when every view is the same image", () => {
    renderDetalle({ ...repuesto, imagenesExtra: ["a.jpg", "a.jpg"] });

    expect(screen.queryByRole("button", { name: "Ver imagen 1" })).not.toBeInTheDocument();
  });

  it("changes the main image from a thumbnail", async () => {
    const user = userEvent.setup();
    renderDetalle({ ...repuesto, imagenesExtra: ["b.jpg"] });

    await user.click(screen.getByRole("button", { name: "Ver imagen 2" }));

    expect(screen.getByRole("img", { name: "Discos de freno" })).toHaveAttribute("src", "b.jpg");
  });

  it("tolerates a part without extra images or specifications", () => {
    const { imagenesExtra: _imagenes, ...sinExtras } = repuesto;

    renderDetalle(sinExtras);

    expect(screen.getByText("Este repuesto no tiene especificaciones cargadas.")).toBeInTheDocument();
  });

  it("lists the specifications", () => {
    renderDetalle({ ...repuesto, especificaciones: [["Diámetro", "280 mm"]] });

    expect(screen.getByText("Diámetro")).toBeInTheDocument();
    expect(screen.getByText("280 mm")).toBeInTheDocument();
    expect(screen.queryByText("Este repuesto no tiene especificaciones cargadas.")).not.toBeInTheDocument();
  });
});
