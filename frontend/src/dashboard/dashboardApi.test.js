// Tests de las llamadas al backend del dashboard.

jest.mock("../api", () => ({ API_BASE_URL: "http://api", notifyInvalidSession: jest.fn() }));
jest.mock("../auth", () => ({ getSession: jest.fn(() => ({ token: "token-vendedor" })) }));

import { notifyInvalidSession } from "../api";
import { getSession } from "../auth";
import {
  addSeller,
  adjustStock,
  askDashboard,
  changeOrderStatus,
  createPart,
  getAISummary,
  getAISummaryHistory,
  getBestSellers,
  getDemandForecast,
  getOrder,
  getOrders,
  getPartDetail,
  getPartForEdit,
  getSalesTrend,
  getSellers,
  getStock,
  getStockoutRisk,
  getVehicles,
  refreshAISummary,
  removeSeller,
  unpublishedFeature,
  updateOrder,
  updatePart,
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


it("maps the summary history from the API", async () => {
  global.fetch = responder(200, {
    days: 7,
    summaries: [{ points: ["Uno.", "Dos.", "Tres."], generated_at: "2026-11-07T13:00:00Z" }],
  });

  const history = await getAISummaryHistory();

  expect(global.fetch.mock.calls[0][0]).toBe("http://api/api/v1/analytics/summary/history");
  expect(history).toEqual({
    days: 7,
    summaries: [{ puntos: ["Uno.", "Dos.", "Tres."], generated: "2026-11-07T13:00:00Z" }],
  });
});

const part = { id: 7, part_code: "FRE-007", name: "Discos", manufacturer: "Fremax", category: "Frenos", stock: 3 };
const repuesto = { id: 7, code: "FRE-007", displayName: "Discos", fabricante: "Fremax", categoria: "Frenos", stock: 3 };
const urlPedida = () => global.fetch.mock.calls[0][0];
const opcionesEnviadas = () => global.fetch.mock.calls[0][1];
const cuerpoEnviado = () => JSON.parse(opcionesEnviadas().body);

describe("request errors", () => {
  it("sends no Authorization header without a session", async () => {
    getSession.mockReturnValueOnce(null);
    global.fetch = responder(200, { low_stock_threshold: 5, parts: [] });

    await getStock();

    expect(opcionesEnviadas().headers.Authorization).toBeUndefined();
  });

  it("explains a 404 without detail", async () => {
    global.fetch = responder(404, {});
    await expect(getPartDetail(99)).rejects.toMatchObject({ status: 404, message: "No encontramos ese repuesto." });
  });

  it("falls back to the screen message when detail is not a string", async () => {
    global.fetch = responder(422, { detail: [{ msg: "dato inválido" }] });
    await expect(getVehicles()).rejects.toMatchObject({ status: 422, message: "No pudimos cargar los vehículos." });
  });

  it("does not end the session on errors other than a 401", async () => {
    global.fetch = responder(500, {});
    await expect(getStock()).rejects.toThrow("No pudimos cargar el stock.");
    expect(notifyInvalidSession).not.toHaveBeenCalled();
  });

  it("rejects a successful response whose body is not JSON", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.reject(new SyntaxError("vacío")) });
    await expect(getStock()).rejects.toThrow("No pudimos cargar el stock.");
  });
});

describe("analytics", () => {
  it("asks for 10 best sellers by default and maps the units sold", async () => {
    global.fetch = responder(200, { parts: [{ ...part, units_sold: 12 }] });

    expect(await getBestSellers({ months: 6 })).toEqual([{ ...repuesto, unitsSold: 12 }]);
    expect(urlPedida()).toBe("http://api/api/v1/analytics/best-sellers?months=6&limit=10");
  });

  it("asks for the best sellers without arguments", async () => {
    global.fetch = responder(200, { parts: [] });

    expect(await getBestSellers()).toEqual([]);
    expect(urlPedida()).toBe("http://api/api/v1/analytics/best-sellers?limit=10");
  });

  it("filters the sales trend by part", async () => {
    global.fetch = responder(200, { months: [], projection: { month: "2026-11", units: 0 } });

    await getSalesTrend({ idPart: 7 });

    expect(urlPedida()).toBe("http://api/api/v1/analytics/sales-by-month?part_id=7");
  });

  it("marks a closed month as not in progress", async () => {
    global.fetch = responder(200, {
      months: [{ month: "2026-09", units: 1, revenue: 10 }],
      projection: { month: "2026-11", units: 2 },
    });

    expect((await getSalesTrend()).months[0].inProgress).toBe(false);
  });

  it("maps the demand forecast with a default limit of 20", async () => {
    global.fetch = responder(200, {
      month: "2026-11",
      parts: [{ ...part, units_last_12_months: 40, projected_units: 4 }],
    });

    expect(await getDemandForecast()).toEqual({
      month: "2026-11",
      repuestos: [{ ...repuesto, unitsLastYear: 40, projectedDemand: 4 }],
    });
    expect(urlPedida()).toBe("http://api/api/v1/analytics/demand-forecast?limit=20");
  });

  it("honours an explicit forecast limit and filters", async () => {
    global.fetch = responder(200, { month: "2026-11", parts: [] });

    await getDemandForecast({ limit: 5, categoria: "Frenos" });

    expect(urlPedida()).toBe("http://api/api/v1/analytics/demand-forecast?category=Frenos&limit=5");
  });

  const riesgo = {
    month: "2026-11",
    thresholds: { high_below: 15, medium_up_to: 30 },
    parts: [{ ...part, projected_units: 9, daily_demand: 0.3, coverage_days: 10, risk: "alto" }],
  };

  it("maps the stockout risk and omits the filter by default", async () => {
    global.fetch = responder(200, riesgo);

    expect(await getStockoutRisk()).toEqual({
      month: "2026-11",
      umbrales: { high: 15, medium: 30 },
      repuestos: [{ ...repuesto, projectedDemand: 9, dailyDemand: 0.3, coverageDays: 10, risk: "alto" }],
    });
    expect(urlPedida()).toBe("http://api/api/v1/analytics/stockout-risk");
  });

  it("asks only for the parts at risk when requested", async () => {
    global.fetch = responder(200, { ...riesgo, parts: [] });

    await getStockoutRisk({ onlyInRisk: true });

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

    expect(await getPartDetail("7/8")).toEqual({
      ...repuesto,
      projectedDemand: 3,
      dailyDemand: 0.1,
      coverageDays: 30,
      risk: "bajo",
      price: 4200,
      stockLow: true,
      unitsSold: 8,
      months: [{ month: "2026-10", units: 2, revenue: 8400, inProgress: false }],
      forecast: { month: "2026-11", units: 3 },
    });
    expect(urlPedida()).toBe("http://api/api/v1/analytics/parts/7%2F8");
  });
});

describe("part forms", () => {
  const datos = {
    code: "FRE-007",
    displayName: "Discos",
    fabricante: "Fremax",
    categoria: "Frenos",
    price: "4200",
    color: "Gris",
    description: "Ventilados",
    monthsWarranty: "12",
    compatibilidades: [{ idVehicle: 3, from: "2015", until: "2020" }],
  };

  it("maps the vehicles to choose from", async () => {
    global.fetch = responder(200, { car_models: [{ id: 3, brand: "Chevrolet", model: "Onix", engine_code: "1.4" }] });

    expect(await getVehicles()).toEqual([{ id: 3, marca: "Chevrolet", modelo: "Onix", engine: "1.4" }]);
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

    expect(await getPartForEdit(7)).toEqual({
      ...repuesto,
      price: 4200,
      color: "Gris",
      description: "Ventilados",
      monthsWarranty: 0,
      compatibilidades: [{ marca: "Chevrolet", modelo: "Onix", engine: "1.4", from: 2015, until: 2020 }],
    });
  });

  it("leaves the optional fields of a part to edit empty", async () => {
    global.fetch = responder(200, { ...part, price: 4200, color: null, description: null, warranty_months: null });

    expect(await getPartForEdit(7)).toMatchObject({
      color: "",
      description: "",
      monthsWarranty: "",
      compatibilidades: [],
    });
  });

  it("converts the numbers of a new part and keeps the optional fields", async () => {
    global.fetch = responder(201, part);

    await createPart({ ...datos, stock: "3" });

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

    await createPart({ ...datos, monthsWarranty: undefined });

    expect(cuerpoEnviado().warranty_months).toBeNull();
  });

  it("does not change the stock when editing a part", async () => {
    global.fetch = responder(200, part);

    expect(await updatePart(7, { ...datos, stock: 99 })).toEqual(repuesto);

    expect(opcionesEnviadas().method).toBe("PUT");
    expect(urlPedida()).toBe("http://api/api/v1/parts/7");
    expect(cuerpoEnviado()).not.toHaveProperty("stock");
  });
});

describe("seller orders", () => {
  const pedidoApi = {
    order_id: 42,
    created_at: "2026-11-01T10:00:00Z",
    status: "confirmed",
    payment_status: "approved",
    total: 4900,
    payment_method: "mercado_pago",
    mp_payment_id: "mp-1",
    refunded_at: null,
    refund_pending: true,
    client_name: "Ana Pérez",
    client_email: "ana@test.com",
    client_phone: "099123456",
    shipping_address: {
      personal_name: "Ana Pérez",
      street: "18 de Julio",
      number: "1234",
      apartment: "5B",
      city: "Montevideo",
      department: "Montevideo",
      postal_code: "11200",
    },
    items: [{ part_id: 21, part_code: "DF-21", name: "Disco", quantity: 2, frozen_price: 2450 }],
    next_status: "packing",
    previous_status: null,
    can_cancel: true,
    can_edit_shipping: true,
    cancellation_reason: null,
    internal_note: "Llamar antes",
    status_history: [],
    payment_due_at: null,
    cancel_reason: null,
  };
  const pedido = {
    id: 42,
    date: "2026-11-01T10:00:00Z",
    estado: "confirmed",
    paymentStatus: "approved",
    total: 4900,
    paymentMethod: "mercado_pago",
    idPaymentMP: "mp-1",
    refunded: null,
    faltaDevolver: true,
    customer: { displayName: "Ana Pérez", email: "ana@test.com", phone: "099123456" },
    shipping: {
      addressName: "Ana Pérez",
      street: "18 de Julio",
      number: "1234",
      apartamento: "5B",
      city: "Montevideo",
      department: "Montevideo",
      codePostal: "11200",
    },
    items: [{ idPart: 21, code: "DF-21", displayName: "Disco", quantity: 2, price: 2450 }],
    nextStatus: "packing",
    previousStatus: null,
    canCancel: true,
    canEditShipping: true,
    reasonCancellation: null,
    internalNote: "Llamar antes",
  };

  it("lists the orders with their counts, 50 at a time by default", async () => {
    global.fetch = responder(200, { orders: [pedidoApi], total: 1, counts: { confirmed: 1 }, to_prepare: 1 });

    expect(await getOrders()).toEqual({ orders: [pedido], total: 1, byStatus: { confirmed: 1 }, forPrepare: 1 });
    expect(urlPedida()).toBe("http://api/api/v1/orders/seller?limit=50&offset=0");
  });

  it("filters the orders by status, page, payment and order", async () => {
    global.fetch = responder(200, { orders: [], total: 0, counts: {}, to_prepare: 0 });

    await getOrders({ estado: "confirmed", limit: 10, from: 20, onlyPaid: true, sort: "oldest" });

    expect(urlPedida()).toBe(
      "http://api/api/v1/orders/seller?status=confirmed&limit=10&offset=20&paid_only=true&sort=oldest"
    );
  });

  it("tolerates an order that comes without its optional data", async () => {
    const { payment_status: _p, mp_payment_id: _m, refunded_at: _r, client_phone: _c, next_status: _n,
      previous_status: _s, cancellation_reason: _x, internal_note: _i, refund_pending: _f, can_cancel: _cc,
      can_edit_shipping: _ce, ...minimo } = pedidoApi;
    global.fetch = responder(200, {
      ...minimo,
      shipping_address: { ...pedidoApi.shipping_address, apartment: null, postal_code: null },
    });

    expect(await getOrder(42)).toMatchObject({
      paymentStatus: null,
      idPaymentMP: null,
      refunded: null,
      faltaDevolver: false,
      customer: { phone: null },
      shipping: { apartamento: null, codePostal: null },
      nextStatus: null,
      previousStatus: null,
      canCancel: false,
      canEditShipping: false,
      reasonCancellation: null,
      internalNote: null,
    });
    expect(urlPedida()).toBe("http://api/api/v1/orders/seller/42");
  });

  it("sends the reason only when the order is cancelled", async () => {
    global.fetch = responder(200, pedidoApi);

    await changeOrderStatus(42, "cancelled", "Sin stock");

    expect(opcionesEnviadas().method).toBe("PATCH");
    expect(urlPedida()).toBe("http://api/api/v1/orders/42/status");
    expect(cuerpoEnviado()).toEqual({ status: "cancelled", reason: "Sin stock" });
  });

  it("does not send a reason for any other status", async () => {
    global.fetch = responder(200, pedidoApi);

    await changeOrderStatus(42, "shipped", "ignorado");

    expect(cuerpoEnviado()).toEqual({ status: "shipped" });
  });

  it("sends only the shipping address when that is what changed", async () => {
    global.fetch = responder(200, pedidoApi);

    await updateOrder(42, { shipping: { ...pedido.shipping, apartamento: "", codePostal: "" } });

    expect(urlPedida()).toBe("http://api/api/v1/orders/seller/42");
    expect(cuerpoEnviado()).toEqual({
      shipping_address: {
        personal_name: "Ana Pérez",
        street: "18 de Julio",
        number: "1234",
        apartment: null,
        city: "Montevideo",
        department: "Montevideo",
        postal_code: null,
      },
    });
  });

  it("can clear the internal note without touching the address", async () => {
    global.fetch = responder(200, pedidoApi);

    await updateOrder(42, { internalNote: "" });

    expect(cuerpoEnviado()).toEqual({ internal_note: "" });
  });

  it("sends an empty change when called without data", async () => {
    global.fetch = responder(200, pedidoApi);

    await updateOrder(42);

    expect(cuerpoEnviado()).toEqual({});
  });
});

describe("AI dashboard", () => {
  it("treats 404 and 501 as an unpublished feature", () => {
    expect(unpublishedFeature({ status: 404 })).toBe(true);
    expect(unpublishedFeature({ status: 501 })).toBe(true);
    expect(unpublishedFeature({ status: 500 })).toBe(false);
    expect(unpublishedFeature(undefined)).toBe(false);
  });

  it("maps the stored summary", async () => {
    global.fetch = responder(200, { points: ["Subieron las ventas"], generated_at: "2026-11-04T10:00:00Z" });

    expect(await getAISummary()).toEqual({ puntos: ["Subieron las ventas"], generated: "2026-11-04T10:00:00Z" });
  });

  it("generates a new summary with a POST", async () => {
    global.fetch = responder(200, { points: [], generated_at: "2026-11-04T10:00:00Z" });

    await refreshAISummary();

    expect(opcionesEnviadas().method).toBe("POST");
  });

  it("returns the answer with the data used to reach it", async () => {
    global.fetch = responder(200, { answer: "Discos", data: { columns: ["nombre"], rows: [["Discos"]] } });

    expect(await askDashboard("¿Qué se vende más?")).toEqual({
      response: "Discos",
      info: { columnas: ["nombre"], rows: [["Discos"]] },
    });
    expect(cuerpoEnviado()).toEqual({ question: "¿Qué se vende más?" });
  });

  it("returns no data when the answer has none", async () => {
    global.fetch = responder(200, { answer: "No sé", data: null });

    expect((await askDashboard("¿Hola?")).info).toBeNull();
  });
});

it("treats a team without a list as empty", async () => {
  global.fetch = responder(200, {});

  expect(await getSellers()).toEqual([]);
});
