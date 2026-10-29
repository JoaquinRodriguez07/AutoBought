jest.mock("../api", () => ({ API_BASE_URL: "http://api", avisarSesionInvalida: jest.fn() }));
jest.mock("../auth", () => ({ obtenerSesion: () => ({ token: "token-vendedor" }) }));

import { avisarSesionInvalida } from "../api";
import { ajustarStock, crearRepuesto, obtenerEvolucionVentas, obtenerStock } from "./apiDashboard";

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

  const datos = await obtenerEvolucionVentas({ categoria: "Frenos", busqueda: "", meses: 3 });

  const [url, opciones] = global.fetch.mock.calls[0];
  expect(url).toBe("http://api/api/v1/analytics/sales-by-month?category=Frenos&months=3");
  expect(opciones.headers.Authorization).toBe("Bearer token-vendedor");
  expect(datos).toEqual({
    meses: [{ mes: "2026-10", unidades: 5, facturacion: 500, enCurso: true }],
    proyeccion: { mes: "2026-11", unidades: 6.5 },
  });
});

it("maps the stock to the UI shape", async () => {
  global.fetch = responder(200, {
    low_stock_threshold: 5,
    parts: [{ id: 1, part_code: "FRE-001", name: "Pastillas", manufacturer: "Bosch", category: "Frenos", stock: 2, low_stock: true }],
  });

  expect(await obtenerStock()).toEqual({
    umbralStockBajo: 5,
    repuestos: [{ id: 1, codigo: "FRE-001", nombre: "Pastillas", fabricante: "Bosch", categoria: "Frenos", stock: 2, stockBajo: true }],
  });
});

it("ends the session on a 401", async () => {
  global.fetch = responder(401, { detail: "Token inválido o expirado." });

  await expect(obtenerStock()).rejects.toMatchObject({ status: 401, message: "Token inválido o expirado." });
  expect(avisarSesionInvalida).toHaveBeenCalledWith("token-vendedor");
});

it("explains a 403 without detail and a network failure", async () => {
  global.fetch = responder(403, {});
  await expect(ajustarStock(1, 5)).rejects.toThrow("Esta sección es solo para vendedores.");

  global.fetch = jest.fn().mockRejectedValue(new TypeError("Failed to fetch"));
  await expect(ajustarStock(1, 5)).rejects.toThrow("No pudimos ajustar el stock.");
});

it("sends a new part with its compatible vehicles", async () => {
  global.fetch = responder(201, { id: 9, part_code: "FRE-100", name: "Discos", manufacturer: "Fremax", category: "Frenos", stock: 12 });

  await crearRepuesto({
    codigo: "FRE-100",
    nombre: "Discos",
    fabricante: "Fremax",
    categoria: "Frenos",
    precio: "4200",
    stock: "12",
    color: "",
    descripcion: "",
    garantiaMeses: "",
    compatibilidades: [{ vehiculoId: 2, desde: 2015, hasta: 2022 }],
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
