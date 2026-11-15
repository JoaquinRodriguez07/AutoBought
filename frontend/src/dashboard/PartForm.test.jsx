// Tests del formulario de repuestos.

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("./dashboardApi");

import PartForm from "./PartForm";
import { createPart, updatePart, getPartForEdit, getVehicles } from "./dashboardApi";

const VEHICLES = [
  { id: 1, marca: "Chevrolet", modelo: "Onix", engine: "1.4 8V" },
  { id: 2, marca: "Volkswagen", modelo: "Gol", engine: "1.6" },
];

beforeEach(() => {
  getVehicles.mockResolvedValue(VEHICLES);
});

afterEach(() => jest.clearAllMocks());

function renderForm(props = {}) {
  const onSaved = jest.fn();
  render(<PartForm isOpen onChange={jest.fn()} categories={["Frenos"]} onSaved={onSaved} {...props} />);
  return onSaved;
}

async function complete(user, fields) {
  for (const [label, rawValue] of Object.entries(fields)) {
    const field = screen.getByLabelText(label);
    // Pega el valor entero: tipearlo tecla por tecla redibuja el formulario
    // en cada letra y, con la suite en paralelo, el test pasaba los 5 s.
    await user.clear(field);
    await user.paste(rawValue);
  }
}

it("creates a part with its data, stock and compatible vehicles", async () => {
  const user = userEvent.setup();
  createPart.mockResolvedValue({ id: 99 });
  const onSaved = renderForm();

  await screen.findByRole("dialog", { name: "Nuevo repuesto" });
  await screen.findByLabelText("Código");
  await complete(user, {
    Código: "FRE-100",
    Nombre: "Discos de freno",
    Fabricante: "Fremax",
    Categoría: "Frenos",
    "Precio ($)": "4200",
    "Stock inicial": "12",
  });

  await user.selectOptions(await screen.findByLabelText("Vehículo"), "Volkswagen Gol 1.6");
  await complete(user, { Desde: "2015", Hasta: "2022" });
  await user.click(screen.getByRole("button", { name: "Agregar" }));
  expect(within(screen.getByRole("list", { name: "Vehículos elegidos" })).getByText("Volkswagen Gol 1.6 (2015–2022)")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Dar de alta" }));

  expect(createPart).toHaveBeenCalledWith(
    expect.objectContaining({
      code: "FRE-100",
      displayName: "Discos de freno",
      fabricante: "Fremax",
      categoria: "Frenos",
      price: "4200",
      stock: "12",
      compatibilidades: [{ idVehicle: 2, from: 2015, until: 2022 }],
    })
  );
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ id: 99 }));
});

it("asks for the required data and at least one vehicle before sending", async () => {
  const user = userEvent.setup();
  renderForm();

  await user.click(await screen.findByRole("button", { name: "Dar de alta" }));

  expect(screen.getByText("Ingresá el código.")).toBeInTheDocument();
  expect(screen.getByText("Ingresá el nombre.")).toBeInTheDocument();
  expect(screen.getByText("El precio es un número entero mayor que 0.")).toBeInTheDocument();
  expect(screen.getByText("Agregá al menos un vehículo compatible.")).toBeInTheDocument();
  expect(screen.getByLabelText("Código")).toHaveAttribute("aria-invalid", "true");
  expect(createPart).not.toHaveBeenCalled();
});

it("does not add a vehicle with the years reversed", async () => {
  const user = userEvent.setup();
  renderForm();

  await user.selectOptions(await screen.findByLabelText("Vehículo"), "Chevrolet Onix 1.4 8V");
  await complete(user, { Desde: "2022", Hasta: "2015" });
  await user.click(screen.getByRole("button", { name: "Agregar" }));

  expect(screen.getByText(/el año hasta no puede ser anterior/)).toBeInTheDocument();
  expect(screen.queryByRole("list", { name: "Vehículos elegidos" })).not.toBeInTheDocument();
});

it("shows the API error, for example a repeated code", async () => {
  const user = userEvent.setup();
  createPart.mockRejectedValue(new Error("Ya existe un repuesto con ese código."));
  const onSaved = renderForm();

  await screen.findByLabelText("Vehículo");
  await complete(user, { Código: "FRE-001", Nombre: "X", Fabricante: "Y", Categoría: "Frenos", "Precio ($)": "10" });
  await user.selectOptions(screen.getByLabelText("Vehículo"), "Chevrolet Onix 1.4 8V");
  await user.click(screen.getByRole("button", { name: "Agregar" }));
  await user.click(screen.getByRole("button", { name: "Dar de alta" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Ya existe un repuesto con ese código.");
  expect(onSaved).not.toHaveBeenCalled();
});

it("loads the part to edit it, matching its vehicles, without a stock field", async () => {
  const user = userEvent.setup();
  getPartForEdit.mockResolvedValue({
    id: 7,
    code: "FRE-007",
    displayName: "Pastillas",
    fabricante: "Bosch",
    categoria: "Frenos",
    stock: 38,
    price: 2500,
    color: "",
    description: "",
    monthsWarranty: "",
    compatibilidades: [{ marca: "Chevrolet", modelo: "Onix", engine: "1.4 8V", from: 2013, until: 2019 }],
  });
  updatePart.mockResolvedValue({ id: 7 });
  const onSaved = renderForm({ idPart: 7 });

  await screen.findByRole("dialog", { name: "Editar repuesto" });
  expect(await screen.findByLabelText("Nombre")).toHaveValue("Pastillas");
  expect(screen.queryByLabelText("Stock inicial")).not.toBeInTheDocument();
  expect(screen.getByText("Chevrolet Onix 1.4 8V (2013–2019)")).toBeInTheDocument();

  await complete(user, { "Precio ($)": "2000" });
  await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

  expect(updatePart).toHaveBeenCalledWith(
    7,
    expect.objectContaining({ price: "2000", compatibilidades: [{ idVehicle: 1, from: 2013, until: 2019 }] })
  );
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
});
