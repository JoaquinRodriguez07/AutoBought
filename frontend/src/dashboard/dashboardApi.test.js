// Tests de las llamadas al backend del dashboard.

jest.mock("../api", () => ({ API_BASE_URL: "http://api", notifyInvalidSession: jest.fn() }));
jest.mock("../auth", () => ({ getSession: () => ({ token: "token-vendedor" }) }));

import { notifyInvalidSession } from "../api";
import {
  addSeller,
  adjustStock,
  createPart,
  removeSeller,
  getSalesTrend,
  getStock,
  getSellers,
} from "./dashboardApi";

const responder = (status, body) =>
  jest.fn().mockResolvedValue({ ok: status < 400, status, json: () => Promise.resolve(body) });

afterEach(() => {
  delete global.fetch;
  jest.clearAllMocks();
});

it("sends the seller token and skips the empty filters", async () => {
  global.fetch = responder(200, {
    months: [{ month: "2026-10", units: 5, revenue: 500, in_progress: true }],
    projection: { month: "2026-11", units: 6.5 },
  });

  const info = await getSalesTrend({ categoria: "Frenos", search: "", months: 3 });

  const [url, opciones] = global.fetch.mock.calls[0];
  expect(url).toBe("http://api/api/v1/analytics/sales-by-month?category=Frenos&months=3");
  expect(opciones.headers.Authorization).toBe("Bearer token-vendedor");
  expect(info).toEqual({
    months: [{ month: "2026-10", units: 5, revenue: 500, inProgress: true }],
    forecast: { month: "2026-11", units: 6.5 },
  });
});

it("maps the stock to the UI shape", async () => {
  global.fetch = responder(200, {
    low_stock_threshold: 5,
    parts: [{ id: 1, part_code: "FRE-001", name: "Pastillas", manufacturer: "Bosch", category: "Frenos", stock: 2, low_stock: true }],
  });

  expect(await getStock()).toEqual({
    thresholdStockLow: 5,
    repuestos: [{ id: 1, code: "FRE-001", displayName: "Pastillas", fabricante: "Bosch", categoria: "Frenos", stock: 2, stockLow: true }],
  });
});

it("ends the session on a 401", async () => {
  global.fetch = responder(401, { detail: "Token inválido o expirado." });

  await expect(getStock()).rejects.toMatchObject({ status: 401, message: "Token inválido o expirado." });
  expect(notifyInvalidSession).toHaveBeenCalledWith("token-vendedor");
});

it("explains a 403 without detail and a network failure", async () => {
  global.fetch = responder(403, {});
  await expect(adjustStock(1, 5)).rejects.toThrow("Esta sección es solo para vendedores.");

  global.fetch = jest.fn().mockRejectedValue(new TypeError("Failed to fetch"));
  await expect(adjustStock(1, 5)).rejects.toThrow("No pudimos ajustar el stock.");
});

it("sends a new part with its compatible vehicles", async () => {
  global.fetch = responder(201, { id: 9, part_code: "FRE-100", name: "Discos", manufacturer: "Fremax", category: "Frenos", stock: 12 });

  await createPart({
    code: "FRE-100",
    displayName: "Discos",
    fabricante: "Fremax",
    categoria: "Frenos",
    price: "4200",
    stock: "12",
    color: "",
    description: "",
    monthsWarranty: "",
    compatibilidades: [{ idVehicle: 2, from: 2015, until: 2022 }],
  });

  const [url, opciones] = global.fetch.mock.calls[0];
  expect(url).toBe("http://api/api/v1/parts");
  expect(opciones.method).toBe("POST");
  expect(JSON.parse(opciones.body)).toEqual({
    part_code: "FRE-100",
    name: "Discos",
    manufacturer: "Fremax",
    category: "Frenos",
    price: 4200,
    stock: 12,
    color: null,
    description: null,
    warranty_months: null,
    compatibilities: [{ car_model_id: 2, year_from: 2015, year_to: 2022 }],
  });
});

describe("equipo (SCRUM-175)", () => {
  it("lists the sellers in the UI shape", async () => {
    global.fetch = responder(200, { employees: [{ id: 1, name: "Ana", email: "ana@example.com", is_admin: true }] });

    expect(await getSellers()).toEqual([{ id: 1, displayName: "Ana", email: "ana@example.com", isAdmin: true }]);
    expect(global.fetch.mock.calls[0][0]).toBe("http://api/api/v1/employees");
  });

  it("adds a seller with the name and mail trimmed", async () => {
    global.fetch = responder(201, { id: 3, name: "Caro", email: "caro@example.com", is_admin: false });

    expect(await addSeller({ displayName: " Caro ", email: " caro@example.com " })).toEqual({
      id: 3,
      displayName: "Caro",
      email: "caro@example.com",
      isAdmin: false,
    });
    const [, opciones] = global.fetch.mock.calls[0];
    expect(opciones.method).toBe("POST");
    expect(JSON.parse(opciones.body)).toEqual({ name: "Caro", email: "caro@example.com" });
  });

  it("uses the backend message when the mail is taken", async () => {
    global.fetch = responder(409, { detail: "Ya hay una cuenta con ese correo." });

    await expect(addSeller({ displayName: "Beto", email: "beto@example.com" })).rejects.toThrow(
      "Ya hay una cuenta con ese correo."
    );
  });

  it("drops a seller (the 204 has no body)", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 204, json: () => Promise.reject(new Error("sin body")) });

    await expect(removeSeller(2)).resolves.toBeUndefined();
    const [url, opciones] = global.fetch.mock.calls[0];
    expect(url).toBe("http://api/api/v1/employees/2");
    expect(opciones.method).toBe("DELETE");
  });
});

