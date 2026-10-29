import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("./apiDashboard");

import FormularioRepuesto from "./FormularioRepuesto";
import { crearRepuesto, editarRepuesto, obtenerRepuestoParaEditar, obtenerVehiculos } from "./apiDashboard";

const VEHICULOS = [
  { id: 1, marca: "Chevrolet", modelo: "Onix", motor: "1.4 8V" },
  { id: 2, marca: "Volkswagen", modelo: "Gol", motor: "1.6" },
];

beforeEach(() => {
  obtenerVehiculos.mockResolvedValue(VEHICULOS);
});

afterEach(() => jest.clearAllMocks());

function renderFormulario(props = {}) {
  const onGuardado = jest.fn();
  render(<FormularioRepuesto abierto onCambiar={jest.fn()} categorias={["Frenos"]} onGuardado={onGuardado} {...props} />);
  return onGuardado;
}

async function completar(user, campos) {
  for (const [etiqueta, valor] of Object.entries(campos)) {
    const campo = screen.getByLabelText(etiqueta);
    await user.clear(campo);
    await user.type(campo, valor);
  }
}

it("creates a part with its data, stock and compatible vehicles", async () => {
  const user = userEvent.setup();
  crearRepuesto.mockResolvedValue({ id: 99 });
  const onGuardado = renderFormulario();

  await screen.findByRole("dialog", { name: "Nuevo repuesto" });
  await screen.findByLabelText("Código");
  await completar(user, {
    Código: "FRE-100",
    Nombre: "Discos de freno",
    Fabricante: "Fremax",
    Categoría: "Frenos",
    "Precio ($)": "4200",
    "Stock inicial": "12",
  });

  await user.selectOptions(await screen.findByLabelText("Vehículo"), "Volkswagen Gol 1.6");
  await completar(user, { Desde: "2015", Hasta: "2022" });
  await user.click(screen.getByRole("button", { name: "Agregar" }));
  expect(within(screen.getByRole("list", { name: "Vehículos elegidos" })).getByText("Volkswagen Gol 1.6 (2015–2022)")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Dar de alta" }));

  expect(crearRepuesto).toHaveBeenCalledWith(
    expect.objectContaining({
      codigo: "FRE-100",
      nombre: "Discos de freno",
      fabricante: "Fremax",
      categoria: "Frenos",
      precio: "4200",
      stock: "12",
      compatibilidades: [{ vehiculoId: 2, desde: 2015, hasta: 2022 }],
    })
  );
  await waitFor(() => expect(onGuardado).toHaveBeenCalledWith({ id: 99 }));
});

it("asks for the required data and at least one vehicle before sending", async () => {
  const user = userEvent.setup();
  renderFormulario();

  await user.click(await screen.findByRole("button", { name: "Dar de alta" }));

  expect(screen.getByText("Ingresá el código.")).toBeInTheDocument();
  expect(screen.getByText("Ingresá el nombre.")).toBeInTheDocument();
  expect(screen.getByText("El precio es un número entero mayor que 0.")).toBeInTheDocument();
  expect(screen.getByText("Agregá al menos un vehículo compatible.")).toBeInTheDocument();
  expect(screen.getByLabelText("Código")).toHaveAttribute("aria-invalid", "true");
  expect(crearRepuesto).not.toHaveBeenCalled();
});

it("does not add a vehicle with the years reversed", async () => {
  const user = userEvent.setup();
  renderFormulario();

  await user.selectOptions(await screen.findByLabelText("Vehículo"), "Chevrolet Onix 1.4 8V");
  await completar(user, { Desde: "2022", Hasta: "2015" });
  await user.click(screen.getByRole("button", { name: "Agregar" }));

  expect(screen.getByText(/el año hasta no puede ser anterior/)).toBeInTheDocument();
  expect(screen.queryByRole("list", { name: "Vehículos elegidos" })).not.toBeInTheDocument();
});

it("shows the API error, for example a repeated code", async () => {
  const user = userEvent.setup();
  crearRepuesto.mockRejectedValue(new Error("Ya existe un repuesto con ese código."));
  const onGuardado = renderFormulario();

  await screen.findByLabelText("Vehículo");
  await completar(user, { Código: "FRE-001", Nombre: "X", Fabricante: "Y", Categoría: "Frenos", "Precio ($)": "10" });
  await user.selectOptions(screen.getByLabelText("Vehículo"), "Chevrolet Onix 1.4 8V");
  await user.click(screen.getByRole("button", { name: "Agregar" }));
  await user.click(screen.getByRole("button", { name: "Dar de alta" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Ya existe un repuesto con ese código.");
  expect(onGuardado).not.toHaveBeenCalled();
});

it("loads the part to edit it, matching its vehicles, without a stock field", async () => {
  const user = userEvent.setup();
  obtenerRepuestoParaEditar.mockResolvedValue({
    id: 7,
    codigo: "FRE-007",
    nombre: "Pastillas",
    fabricante: "Bosch",
    categoria: "Frenos",
    stock: 38,
    precio: 2500,
    color: "",
    descripcion: "",
    garantiaMeses: "",
    compatibilidades: [{ marca: "Chevrolet", modelo: "Onix", motor: "1.4 8V", desde: 2013, hasta: 2019 }],
  });
  editarRepuesto.mockResolvedValue({ id: 7 });
  const onGuardado = renderFormulario({ repuestoId: 7 });

  await screen.findByRole("dialog", { name: "Editar repuesto" });
  expect(await screen.findByLabelText("Nombre")).toHaveValue("Pastillas");
  expect(screen.queryByLabelText("Stock inicial")).not.toBeInTheDocument();
  expect(screen.getByText("Chevrolet Onix 1.4 8V (2013–2019)")).toBeInTheDocument();

  await completar(user, { "Precio ($)": "2000" });
  await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

  expect(editarRepuesto).toHaveBeenCalledWith(
    7,
    expect.objectContaining({ precio: "2000", compatibilidades: [{ vehiculoId: 1, desde: 2013, hasta: 2019 }] })
  );
  await waitFor(() => expect(onGuardado).toHaveBeenCalled());
});
