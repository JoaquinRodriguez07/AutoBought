// Tests del selector de vehículo: la carga de los años.

import { render, screen } from "@testing-library/react";

import VehicleSelector from "./VehicleSelector";
import { getYears } from "./api";

jest.mock("./api", () => ({
  getBrands: jest.fn().mockResolvedValue(["Toyota"]),
  getModels: jest.fn().mockResolvedValue(["Corolla"]),
  getYears: jest.fn(),
}));

const vehicle = { brand: "Toyota", model: "Corolla", year: "" };

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("VehicleSelector: los años", () => {
  test("lists the years of the chosen model", async () => {
    getYears.mockResolvedValue([2020, 2021]);
    render(<VehicleSelector vehicle={vehicle} onConfirm={jest.fn()} />);

    expect(await screen.findByRole("option", { name: "2021" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Seleccioná un año" })).toBeInTheDocument();
    expect(getYears).toHaveBeenCalledWith("Toyota", "Corolla");
  });

  test("if the years can't be loaded, says so instead of staying empty", async () => {
    getYears.mockRejectedValue(new Error("Sin conexión"));
    render(<VehicleSelector vehicle={vehicle} onConfirm={jest.fn()} />);

    expect(await screen.findByRole("option", { name: "No pudimos cargar los años" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Seleccioná un año" })).not.toBeInTheDocument();
  });
});
