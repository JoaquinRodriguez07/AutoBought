jest.mock("../api", () => ({ API_BASE_URL: "http://api", avisarSesionInvalida: jest.fn() }));
jest.mock("../auth", () => ({ obtenerSesion: jest.fn(() => ({ token: "token-vendedor" })) }));

import { avisarSesionInvalida } from "../api";
import { obtenerSesion } from "../auth";
import {
  actualizarResumenIA,
  ajustarStock,
  crearRepuesto,
  editarRepuesto,
  funcionSinPublicar,
  obtenerDetalleRepuesto,
  obtenerEvolucionVentas,
  obtenerMasVendidos,
  obtenerProyeccionDemanda,
  obtenerRepuestoParaEditar,
  obtenerResumenIA,
  obtenerRiesgoAgotamiento,
  obtenerStock,
  obtenerVehiculos,
  preguntarAlDashboard,
} from "./apiDashboard";

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

const part = { id: 7, part_code: "FRE-007", name: "Discos", manufacturer: "Fremax", category: "Frenos", stock: 3 };
const repuesto = { id: 7, codigo: "FRE-007", nombre: "Discos", fabricante: "Fremax", categoria: "Frenos", stock: 3 };
const urlPedida = () => global.fetch.mock.calls[0][0];
const cuerpoEnviado = () => JSON.parse(global.fetch.mock.calls[0][1].body);

describe("request errors", () => {
  it("sends no Authorization header without a session", async () => {
    obtenerSesion.mockReturnValueOnce(null);
    global.fetch = responder(200, { low_stock_threshold: 5, parts: [] });

    await obtenerStock();

    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it("explains a 404 without detail", async () => {
    global.fetch = responder(404, {});
    await expect(obtenerDetalleRepuesto(99)).rejects.toMatchObject({ status: 404, message: "No encontramos ese repuesto." });
  });

  it("falls back to the screen message when detail is not a string", async () => {
    global.fetch = responder(422, { detail: [{ msg: "dato inválido" }] });
    await expect(obtenerVehiculos()).rejects.toMatchObject({ status: 422, message: "No pudimos cargar los vehículos." });
  });

  it("does not end the session on errors other than a 401", async () => {
    global.fetch = responder(500, {});
    await expect(obtenerStock()).rejects.toThrow("No pudimos cargar el stock.");
    expect(avisarSesionInvalida).not.toHaveBeenCalled();
  });

  it("rejects a successful response whose body is not JSON", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.reject(new SyntaxError("vacío")) });
    await expect(obtenerStock()).rejects.toThrow("No pudimos cargar el stock.");
  });
});

describe("analytics", () => {
  it("asks for 10 best sellers by default and maps the units sold", async () => {
    global.fetch = responder(200, { parts: [{ ...part, units_sold: 12 }] });

    expect(await obtenerMasVendidos({ meses: 6 })).toEqual([{ ...repuesto, unidadesVendidas: 12 }]);
    expect(urlPedida()).toBe("http://api/api/v1/analytics/best-sellers?months=6&limit=10");
  });

  it("asks for the best sellers without arguments", async () => {
    global.fetch = responder(200, { parts: [] });

    expect(await obtenerMasVendidos()).toEqual([]);
    expect(urlPedida()).toBe("http://api/api/v1/analytics/best-sellers?limit=10");
  });

  it("filters the sales evolution by part", async () => {
    global.fetch = responder(200, { months: [], projection: { month: "2026-11", units: 0 } });

    await obtenerEvolucionVentas({ repuestoId: 7 });

    expect(urlPedida()).toBe("http://api/api/v1/analytics/sales-by-month?part_id=7");
  });

  it("marks a closed month as not in progress", async () => {
    global.fetch = responder(200, {
      months: [{ month: "2026-09", units: 1, revenue: 10 }],
      projection: { month: "2026-11", units: 2 },
    });

    expect((await obtenerEvolucionVentas()).meses[0].enCurso).toBe(false);
  });

  it("maps the demand forecast with a default limit of 20", async () => {
    global.fetch = responder(200, {
      month: "2026-11",
      parts: [{ ...part, units_last_12_months: 40, projected_units: 4 }],
    });

    expect(await obtenerProyeccionDemanda()).toEqual({
      mes: "2026-11",
      repuestos: [{ ...repuesto, unidadesUltimoAnio: 40, demandaProyectada: 4 }],
    });
    expect(urlPedida()).toBe("http://api/api/v1/analytics/demand-forecast?limit=20");
  });

  it("honours an explicit forecast limit and filters", async () => {
    global.fetch = responder(200, { month: "2026-11", parts: [] });

    await obtenerProyeccionDemanda({ limite: 5, categoria: "Frenos" });

    expect(urlPedida()).toBe("http://api/api/v1/analytics/demand-forecast?category=Frenos&limit=5");
  });

  const riesgo = {
    month: "2026-11",
    thresholds: { high_below: 15, medium_up_to: 30 },
    parts: [{ ...part, projected_units: 9, daily_demand: 0.3, coverage_days: 10, risk: "alto" }],
  };

  it("maps the stockout risk and omits the filter by default", async () => {
    global.fetch = responder(200, riesgo);

    expect(await obtenerRiesgoAgotamiento()).toEqual({
      mes: "2026-11",
      umbrales: { alto: 15, medio: 30 },
      repuestos: [{ ...repuesto, demandaProyectada: 9, demandaDiaria: 0.3, diasCobertura: 10, riesgo: "alto" }],
    });
    expect(urlPedida()).toBe("http://api/api/v1/analytics/stockout-risk");
  });

  it("asks only for the parts at risk when requested", async () => {
    global.fetch = responder(200, { ...riesgo, parts: [] });

    await obtenerRiesgoAgotamiento({ soloEnRiesgo: true });

    expect(urlPedida()).toBe("http://api/api/v1/analytics/stockout-risk?at_risk_only=true");
  });

  it("maps a part detail and takes the projected units from its projection", async () => {
    global.fetch = responder(200, {
      ...part,
      daily_demand: 0.1,
      coverage_days: 30,
      risk: "bajo",
      price: 4200,
      low_stock: true,
      units_sold: 8,
      months: [{ month: "2026-10", units: 2, revenue: 8400, in_progress: false }],
      projection: { month: "2026-11", units: 3 },
    });

    expect(await obtenerDetalleRepuesto("7/8")).toEqual({
      ...repuesto,
      demandaProyectada: 3,
      demandaDiaria: 0.1,
      diasCobertura: 30,
      riesgo: "bajo",
      precio: 4200,
      stockBajo: true,
      unidadesVendidas: 8,
      meses: [{ mes: "2026-10", unidades: 2, facturacion: 8400, enCurso: false }],
      proyeccion: { mes: "2026-11", unidades: 3 },
    });
    expect(urlPedida()).toBe("http://api/api/v1/analytics/parts/7%2F8");
  });
});

describe("part forms", () => {
  const datos = {
    codigo: "FRE-007",
    nombre: "Discos",
    fabricante: "Fremax",
    categoria: "Frenos",
    precio: "4200",
    color: "Gris",
    descripcion: "Ventilados",
    garantiaMeses: "12",
    compatibilidades: [{ vehiculoId: 3, desde: "2015", hasta: "2020" }],
  };

  it("maps the vehicles to choose from", async () => {
    global.fetch = responder(200, { car_models: [{ id: 3, brand: "Chevrolet", model: "Onix", engine_code: "1.4" }] });

    expect(await obtenerVehiculos()).toEqual([{ id: 3, marca: "Chevrolet", modelo: "Onix", motor: "1.4" }]);
  });

  it("preloads every field of a part to edit", async () => {
    global.fetch = responder(200, {
      ...part,
      price: 4200,
      color: "Gris",
      description: "Ventilados",
      warranty_months: 0,
      compatibilities: [{ brand: "Chevrolet", model: "Onix", engine_code: "1.4", year_from: 2015, year_to: 2020 }],
    });

    expect(await obtenerRepuestoParaEditar(7)).toEqual({
      ...repuesto,
      precio: 4200,
      color: "Gris",
      descripcion: "Ventilados",
      garantiaMeses: 0,
      compatibilidades: [{ marca: "Chevrolet", modelo: "Onix", motor: "1.4", desde: 2015, hasta: 2020 }],
    });
  });

  it("leaves the optional fields of a part to edit empty", async () => {
    global.fetch = responder(200, { ...part, price: 4200, color: null, description: null, warranty_months: null });

    expect(await obtenerRepuestoParaEditar(7)).toMatchObject({
      color: "",
      descripcion: "",
      garantiaMeses: "",
      compatibilidades: [],
    });
  });

  it("converts the numbers of a new part and keeps the optional fields", async () => {
    global.fetch = responder(201, part);

    await crearRepuesto({ ...datos, stock: "3" });

    expect(cuerpoEnviado()).toMatchObject({
      price: 4200,
      stock: 3,
      color: "Gris",
      description: "Ventilados",
      warranty_months: 12,
      compatibilities: [{ car_model_id: 3, year_from: 2015, year_to: 2020 }],
    });
  });

  it("sends no warranty when it is missing", async () => {
    global.fetch = responder(201, part);

    await crearRepuesto({ ...datos, garantiaMeses: undefined });

    expect(cuerpoEnviado().warranty_months).toBeNull();
  });

  it("does not change the stock when editing a part", async () => {
    global.fetch = responder(200, part);

    expect(await editarRepuesto(7, { ...datos, stock: 99 })).toEqual(repuesto);

    expect(global.fetch.mock.calls[0][1].method).toBe("PUT");
    expect(urlPedida()).toBe("http://api/api/v1/parts/7");
    expect(cuerpoEnviado()).not.toHaveProperty("stock");
  });
});

describe("AI dashboard", () => {
  it("treats 404 and 501 as an unpublished feature", () => {
    expect(funcionSinPublicar({ status: 404 })).toBe(true);
    expect(funcionSinPublicar({ status: 501 })).toBe(true);
    expect(funcionSinPublicar({ status: 500 })).toBe(false);
    expect(funcionSinPublicar(undefined)).toBe(false);
  });

  it("maps the stored summary", async () => {
    global.fetch = responder(200, { points: ["Subieron las ventas"], generated_at: "2026-11-04T10:00:00Z" });

    expect(await obtenerResumenIA()).toEqual({ puntos: ["Subieron las ventas"], generado: "2026-11-04T10:00:00Z" });
  });

  it("generates a new summary with a POST", async () => {
    global.fetch = responder(200, { points: [], generated_at: "2026-11-04T10:00:00Z" });

    await actualizarResumenIA();

    expect(global.fetch.mock.calls[0][1].method).toBe("POST");
  });

  it("returns the answer with the data used to reach it", async () => {
    global.fetch = responder(200, { answer: "Discos", data: { columns: ["nombre"], rows: [["Discos"]] } });

    expect(await preguntarAlDashboard("¿Qué se vende más?")).toEqual({
      respuesta: "Discos",
      datos: { columnas: ["nombre"], filas: [["Discos"]] },
    });
    expect(cuerpoEnviado()).toEqual({ question: "¿Qué se vende más?" });
  });

  it("returns no data when the answer has none", async () => {
    global.fetch = responder(200, { answer: "No sé", data: null });

    expect((await preguntarAlDashboard("¿Hola?")).datos).toBeNull();
  });
});
