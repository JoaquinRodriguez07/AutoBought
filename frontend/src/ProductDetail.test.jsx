import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";

import ProductDetail from "./ProductDetail";
import { getPart } from "./api";
import { isSeller } from "./auth";
import { useVehicle } from "./context/VehicleContext";

jest.mock("./api", () => ({ getPart: jest.fn() }));
jest.mock("./auth", () => ({ isSeller: jest.fn() }));
jest.mock("./context/VehicleContext", () => ({ useVehicle: jest.fn() }));

// Las piezas de alrededor tienen sus propios tests. La lógica de
// compatibilidad está en compatibility.test.js.
jest.mock("./Navbar", () => () => <nav aria-label="Navegación" />);
jest.mock("./VehicleSelector", () => () => null);
jest.mock("./AddToCartButton", () => ({ quantity, onTerminar }) => (
  <button onClick={onTerminar}>Agregar {quantity}</button>
));
jest.mock("./StockAlertButton", () => () => null);
jest.mock("./BoughtTogether", () => () => null);
jest.mock("./PageHeader", () => ({ fin }) => <header>{fin}</header>);

const repuesto = {
  id: 7,
  displayName: "Discos de freno",
  fabricante: "Fremax",
  categoria: "Frenos",
  price: 4200,
  stock: 3,
  image: "a.jpg",
  imagesExtra: [],
  compatibilidades: [],
  fitments: [],
};

function renderDetalle(product, props = {}) {
  return render(
    <ProductDetail
      product={product}
      isFavorite={() => false}
      onToggleFavorite={jest.fn()}
      onCatalogo={jest.fn()}
      {...props}
    />
  );
}

function renderDesdeUrl(id = "7") {
  return render(
    <MemoryRouter initialEntries={[`/producto/${id}`]}>
      <Routes>
        <Route path="/producto/:id" element={<ProductDetail isFavorite={() => false} />} />
      </Routes>
    </MemoryRouter>
  );
}

// El detalle con un enlace a otro repuesto, para cambiar de página sin desmontarlo.
function renderConEnlaceAOtroRepuesto() {
  return render(
    <MemoryRouter initialEntries={["/producto/7"]}>
      <Link to="/producto/8">Otro repuesto</Link>
      <Routes>
        <Route path="/producto/:id" element={<ProductDetail isFavorite={() => false} />} />
      </Routes>
    </MemoryRouter>
  );
}

const conVehiculo = (vehiculo) => useVehicle.mockReturnValue({ activeVehicle: vehiculo, activateVehicle: jest.fn() });
const tarjeta = () => within(screen.getByTestId("compatibility-card"));

beforeEach(() => {
  jest.clearAllMocks();
  isSeller.mockReturnValue(false);
  conVehiculo(null);
});

describe("loading from the URL", () => {
  it("shows the part once it loads", async () => {
    getPart.mockResolvedValue(repuesto);

    renderDesdeUrl();

    expect(screen.getByRole("status")).toHaveTextContent("Cargando");
    expect(await screen.findByRole("heading", { name: "Discos de freno" })).toBeInTheDocument();
    expect(getPart).toHaveBeenCalledWith("7");
  });

  it("says when the part does not exist", async () => {
    getPart.mockRejectedValue(Object.assign(new Error("x"), { status: 404 }));

    renderDesdeUrl();

    expect(await screen.findByRole("alert")).toHaveTextContent("Repuesto no encontrado");
  });

  it("tells a server failure apart from a missing part", async () => {
    getPart.mockRejectedValue(Object.assign(new Error("x"), { status: 500 }));

    renderDesdeUrl();

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cargar el repuesto.");
  });

  it("says the part was not found without an id or a product", () => {
    renderDetalle(null);

    expect(screen.getByRole("alert")).toHaveTextContent("Repuesto no encontrado");
  });

  describe("when the previous part answers after moving to another one", () => {
    const otroRepuesto = { ...repuesto, id: 8, displayName: "Pastillas de freno" };

    async function irAlOtroRepuesto() {
      let primera;
      getPart
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
});

describe("compatibility card", () => {
  it("asks for the vehicle before giving a verdict", () => {
    renderDetalle({ ...repuesto, fitments: ["Fiat Cronos"] });

    expect(tarjeta().getByText("Elegí tu vehículo para verificar la compatibilidad")).toBeInTheDocument();
  });

  it("says when the part fits the vehicle", () => {
    conVehiculo({ brand: "Fiat", model: "Cronos" });

    renderDetalle({ ...repuesto, fitments: ["Fiat Cronos"] });

    expect(tarjeta().getByText("Compatible con tu vehículo")).toBeInTheDocument();
  });

  it("names the vehicle the part does not fit", () => {
    conVehiculo({ brand: "Toyota", model: "Hilux", year: "2020" });

    renderDetalle({ ...repuesto, fitments: ["Fiat Cronos"] });

    expect(tarjeta().getByText("No es compatible con tu Toyota Hilux 2020")).toBeInTheDocument();
  });

  it("gives no verdict when it cannot be checked", () => {
    conVehiculo({ brand: "Chevrolet" });

    renderDetalle({ ...repuesto, compatibilidades: [{ brand: "" }] });

    expect(screen.getByTestId("vehicle-selection")).toHaveAttribute("data-compatibilidad", "no-verificable");
    expect(tarjeta().queryByText("Compatible con tu vehículo")).not.toBeInTheDocument();
    expect(tarjeta().queryByText(/No es compatible/)).not.toBeInTheDocument();
  });

  it("says when there is no compatibility data", () => {
    renderDetalle(repuesto);

    expect(tarjeta().getByText("La información de compatibilidad no está disponible.")).toBeInTheDocument();
  });

  it("shows the first six vehicles and the rest on request", async () => {
    const user = userEvent.setup();
    const compatibilidades = Array.from({ length: 8 }, (_, i) => ({ brand: "Fiat", model: `Modelo ${i + 1}` }));
    renderDetalle({ ...repuesto, compatibilidades });

    expect(tarjeta().getByText("Fiat Modelo 6")).toBeInTheDocument();
    expect(tarjeta().queryByText("Fiat Modelo 7")).not.toBeInTheDocument();

    await user.click(tarjeta().getByRole("button", { name: "Ver los 8 autos compatibles" }));
    expect(tarjeta().getByText("Fiat Modelo 8")).toBeInTheDocument();

    await user.click(tarjeta().getByRole("button", { name: "Ver menos" }));
    expect(tarjeta().queryByText("Fiat Modelo 8")).not.toBeInTheDocument();
  });
});

describe("how each fitment reads", () => {
  it.each([
    ["Fiat Cronos 1.3 2018", "Fiat Cronos", "Motor: 1.3 · Año: 2018"],
    ["Fiat Cronos 2018 2020", "Fiat Cronos", "Años: 2018–2020"],
    ["Fiat Cronos 1.3", "Fiat Cronos", "Motor: 1.3"],
    ["2018 Fiat Cronos", "2018 Fiat Cronos", "Año: 2018"],
  ])("splits %s", (texto, auto, detalle) => {
    renderDetalle({ ...repuesto, fitments: [texto] });

    expect(tarjeta().getByText(auto)).toBeInTheDocument();
    expect(tarjeta().getByText(detalle)).toBeInTheDocument();
  });

  it("shows only the name of a fitment without engine or year", () => {
    renderDetalle({ ...repuesto, fitments: ["Fiat Cronos"] });

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
  ])("names the provider %s", (warrantyProvider, texto) => {
    renderDetalle({ ...repuesto, monthsWarranty: 12, warrantyProvider });

    expect(garantia().getByText("12 meses")).toBeInTheDocument();
    expect(garantia().getByText(texto)).toBeInTheDocument();
  });

  it("does not invent a duration", () => {
    renderDetalle({ ...repuesto, warrantyProvider: "fabricante" });

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

    expect(screen.getByText("0", { selector: "span" })).toBeInTheDocument();
    expect(aumentar()).toBeDisabled();
    expect(disminuir()).toBeDisabled();
  });

  it("hides the buying controls from a seller", () => {
    isSeller.mockReturnValue(true);

    renderDetalle(repuesto);

    expect(screen.queryByRole("button", { name: "Aumentar cantidad" })).not.toBeInTheDocument();
    expect(screen.queryByText("Agregar a favoritos")).not.toBeInTheDocument();
  });

  it("toggles a favorite", async () => {
    const user = userEvent.setup();
    const onToggleFavorite = jest.fn();
    renderDetalle(repuesto, { onToggleFavorite });

    await user.click(screen.getByRole("button", { name: "Agregar a favoritos" }));

    expect(onToggleFavorite).toHaveBeenCalledWith(repuesto);
  });

  it("marks a part already in the favorites", () => {
    renderDetalle(repuesto, { isFavorite: () => true });

    expect(screen.getByRole("button", { name: "Guardado en favoritos" })).toBeInTheDocument();
  });
});

describe("images, description and specifications", () => {
  it("has no thumbnails when every view is the same image", () => {
    renderDetalle({ ...repuesto, imagesExtra: ["a.jpg", "a.jpg"] });

    expect(screen.queryByRole("button", { name: "Ver imagen 1" })).not.toBeInTheDocument();
  });

  it("changes the main image from a thumbnail", async () => {
    const user = userEvent.setup();
    renderDetalle({ ...repuesto, imagesExtra: ["b.jpg"] });

    await user.click(screen.getByRole("button", { name: "Ver imagen 2" }));

    expect(screen.getByRole("img", { name: "Discos de freno" })).toHaveAttribute("src", "b.jpg");
  });

  it("says what is missing for a part without extra images, description or specifications", () => {
    const { imagesExtra: _imagenes, ...sinExtras } = repuesto;

    renderDetalle(sinExtras);

    expect(screen.getByText("Este repuesto todavía no tiene una descripción cargada.")).toBeInTheDocument();
    expect(screen.getByText("Este repuesto no tiene especificaciones cargadas.")).toBeInTheDocument();
  });

  it("lists the description and the specifications", () => {
    renderDetalle({ ...repuesto, description: "Ventilados", specifications: [["Diámetro", "280 mm"]] });

    expect(screen.getByText("Ventilados")).toBeInTheDocument();
    expect(screen.getByText("Diámetro")).toBeInTheDocument();
    expect(screen.getByText("280 mm")).toBeInTheDocument();
    expect(screen.queryByText("Este repuesto no tiene especificaciones cargadas.")).not.toBeInTheDocument();
  });
});
