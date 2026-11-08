import { API_BASE_URL, notifyInvalidSession } from "../api";
import { getSession } from "../auth";

/* =====================================================
   API DEL DASHBOARD DEL VENDEDOR
   Todas las rutas van con el token del vendedor: /analytics
   y las de alta y edición de repuestos le responden 403 a un
   cliente. Como en api.js, las pantallas reciben los datos ya
   traducidos al shape de la UI.
====================================================== */

const MESSAGES_BY_STATUS = {
  401: "Tu sesión venció. Iniciá sesión de nuevo.",
  403: "Esta sección es solo para vendedores.",
  404: "No encontramos ese repuesto.",
};

async function request(route, { params, errorMessage, ...opciones } = {}) {
  const session = getSession();
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, rawValue]) => {
    if (rawValue !== undefined && rawValue !== null && rawValue !== "") query.set(key, rawValue);
  });
  const texto = query.toString();
  const url = `${API_BASE_URL}/api/v1${route}${texto ? `?${texto}` : ""}`;

  let response;
  try {
    response = await fetch(url, {
      ...opciones,
      headers: {
        "Content-Type": "application/json",
        ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
      },
    });
  } catch {
    throw new Error(errorMessage);
  }

  // 204 (ej. dar de baja a un vendedor): no hay nada que leer.
  if (response.status === 204) return null;

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    if (response.status === 401) notifyInvalidSession(session?.token);
    const error = new Error(
      (typeof data?.detail === "string" && data.detail) ||
        MESSAGES_BY_STATUS[response.status] ||
        errorMessage
    );
    error.status = response.status;
    throw error;
  }

  if (data === null) throw new Error(errorMessage);
  return data;
}

// Quitar filtros = no mandarlos: `pedir` saltea los vacíos.
const filtersFrom = ({ categoria, search } = {}) => ({ category: categoria, search: search });

function mapPart(part) {
  return {
    id: part.id,
    code: part.part_code,
    displayName: part.name,
    fabricante: part.manufacturer,
    categoria: part.category,
    stock: part.stock,
  };
}

function mapMonth(month) {
  return {
    month: month.month,
    units: month.units,
    revenue: month.revenue,
    inProgress: Boolean(month.in_progress),
  };
}

const mapForecast = (forecast) => ({ month: forecast.month, units: forecast.units });

function mapRisk(part) {
  return {
    ...mapPart(part),
    projectedDemand: part.projected_units,
    dailyDemand: part.daily_demand,
    coverageDays: part.coverage_days,
    risk: part.risk,
  };
}

/** GET /analytics/stock (HU 5.2) */
export async function getStock(filters) {
  const data = await request("/analytics/stock", {
    params: filtersFrom(filters),
    errorMessage: "No pudimos cargar el stock.",
  });
  return {
    thresholdStockLow: data.low_stock_threshold,
    repuestos: data.parts.map((part) => ({ ...mapPart(part), stockLow: part.low_stock })),
  };
}

/** GET /analytics/best-sellers (HU 5.3), por meses calendario. */
export async function getBestSellers({ months, limit = 10, ...filters } = {}) {
  const data = await request("/analytics/best-sellers", {
    params: { ...filtersFrom(filters), months: months, limit: limit },
    errorMessage: "No pudimos cargar los más vendidos.",
  });
  return data.parts.map((part) => ({ ...mapPart(part), unitsSold: part.units_sold }));
}

/** GET /analytics/sales-by-month (HU 5.4 y 5.5) */
export async function getSalesTrend({ months, idPart, ...filters } = {}) {
  const data = await request("/analytics/sales-by-month", {
    params: { ...filtersFrom(filters), months: months, part_id: idPart },
    errorMessage: "No pudimos cargar la evolución de ventas.",
  });
  return { months: data.months.map(mapMonth), forecast: mapForecast(data.projection) };
}

/** GET /analytics/demand-forecast (HU 5.5) */
export async function getDemandForecast({ limit = 20, ...filters } = {}) {
  const data = await request("/analytics/demand-forecast", {
    params: { ...filtersFrom(filters), limit: limit },
    errorMessage: "No pudimos cargar la proyección de demanda.",
  });
  return {
    month: data.month,
    repuestos: data.parts.map((part) => ({
      ...mapPart(part),
      unitsLastYear: part.units_last_12_months,
      projectedDemand: part.projected_units,
    })),
  };
}

/** GET /analytics/stockout-risk (HU 5.6; con soloEnRiesgo, las alertas de la HU 5.7) */
export async function getStockoutRisk({ onlyInRisk = false, ...filters } = {}) {
  const data = await request("/analytics/stockout-risk", {
    params: { ...filtersFrom(filters), at_risk_only: onlyInRisk ? "true" : undefined },
    errorMessage: "No pudimos calcular el riesgo de agotamiento.",
  });
  return {
    month: data.month,
    umbrales: { high: data.thresholds.high_below, medium: data.thresholds.medium_up_to },
    repuestos: data.parts.map(mapRisk),
  };
}

/** GET /analytics/parts/{id} (HU 5.8) */
export async function getPartDetail(id) {
  const data = await request(`/analytics/parts/${encodeURIComponent(id)}`, {
    errorMessage: "No pudimos cargar el repuesto.",
  });
  return {
    ...mapRisk({ ...data, projected_units: data.projection.units }),
    price: data.price,
    stockLow: data.low_stock,
    unitsSold: data.units_sold,
    months: data.months.map(mapMonth),
    forecast: mapForecast(data.projection),
  };
}

/* =====================================================
   ALTA Y EDICIÓN DE REPUESTOS (HU 5.10)
====================================================== */

/** GET /analytics/car-models: los vehículos para elegir los compatibles. */
export async function getVehicles() {
  const data = await request("/analytics/car-models", { errorMessage: "No pudimos cargar los vehículos." });
  return data.car_models.map((m) => ({ id: m.id, marca: m.brand, modelo: m.model, engine: m.engine_code }));
}

/** GET /parts/{id}: los datos completos, para precargar el formulario de edición. */
export async function getPartForEdit(id) {
  const part = await request(`/parts/${encodeURIComponent(id)}`, { errorMessage: "No pudimos cargar el repuesto." });
  return {
    ...mapPart(part),
    price: part.price,
    color: part.color || "",
    description: part.description || "",
    monthsWarranty: part.warranty_months ?? "",
    compatibilidades: (part.compatibilities || []).map((c) => ({
      marca: c.brand,
      modelo: c.model,
      engine: c.engine_code,
      from: c.year_from,
      until: c.year_to,
    })),
  };
}

function partBody(info) {
  return JSON.stringify({
    part_code: info.code,
    name: info.displayName,
    manufacturer: info.fabricante,
    category: info.categoria,
    price: Number(info.price),
    ...(info.stock !== undefined ? { stock: Number(info.stock) } : {}),
    color: info.color || null,
    description: info.description || null,
    warranty_months: info.monthsWarranty === "" || info.monthsWarranty == null ? null : Number(info.monthsWarranty),
    compatibilities: info.compatibilidades.map((c) => ({
      car_model_id: c.idVehicle,
      year_from: Number(c.from),
      year_to: Number(c.until),
    })),
  });
}

/** POST /parts */
export async function createPart(info) {
  const part = await request("/parts", {
    method: "POST",
    body: partBody(info),
    errorMessage: "No pudimos dar de alta el repuesto.",
  });
  return mapPart(part);
}

/** PUT /parts/{id}: no cambia el stock (se ajusta aparte). */
export async function updatePart(id, info) {
  const part = await request(`/parts/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: partBody({ ...info, stock: undefined }),
    errorMessage: "No pudimos guardar los cambios.",
  });
  return mapPart(part);
}

/** PATCH /parts/{id}/stock */
export async function adjustStock(id, stock) {
  const part = await request(`/parts/${encodeURIComponent(id)}/stock`, {
    method: "PATCH",
    body: JSON.stringify({ stock: Number(stock) }),
    errorMessage: "No pudimos ajustar el stock.",
  });
  return mapPart(part);
}

/* =====================================================
   PEDIDOS (SCRUM-171)
====================================================== */

function mapSellerOrder(p) {
  return {
    id: p.order_id,
    date: p.created_at,
    estado: p.status,
    deliveryMethod: p.delivery_method ?? "shipping",
    // "pending" | "approved" | "rejected"; null en los de antes de Mercado Pago (ya cobrados).
    paymentStatus: p.payment_status ?? null,
    total: p.total,
    paymentMethod: p.payment_method,
    idPaymentMP: p.mp_payment_id ?? null,
    // Cuándo se devolvió el dinero (null si no se devolvió) y si falta devolverlo.
    refunded: p.refunded_at ?? null,
    faltaDevolver: Boolean(p.refund_pending),
    customer: { displayName: p.client_name, email: p.client_email, phone: p.client_phone ?? null },
    // A dónde se envía: la copia guardada al comprar (no cambia si el cliente edita su perfil).
    shipping: p.shipping_address ? {
      // El nombre que el cliente le puso a la dirección ("Casa", "Trabajo"), no quién recibe.
      addressName: p.shipping_address.personal_name,
      street: p.shipping_address.street,
      number: p.shipping_address.number,
      apartamento: p.shipping_address.apartment ?? null,
      city: p.shipping_address.city,
      department: p.shipping_address.department,
      codePostal: p.shipping_address.postal_code ?? null,
    } : null,
    items: p.items.map((item) => ({
      idPart: item.part_id,
      code: item.part_code,
      displayName: item.name,
      quantity: item.quantity,
      price: item.frozen_price,
    })),
    // Lo decide el backend: a qué estado se puede pasar (null si no se puede) y si se puede cancelar.
    nextStatus: p.next_status ?? null,
    // A dónde vuelve si el vendedor se equivocó (null si no se puede volver).
    previousStatus: p.previous_status ?? null,
    canCancel: Boolean(p.can_cancel),
    // La dirección se corrige mientras el pedido no salió.
    canEditShipping: Boolean(p.can_edit_shipping),
    reasonCancellation: p.cancellation_reason ?? null,
    // Solo la ve la tienda.
    internalNote: p.internal_note ?? null,
  };
}

/**
 * GET /orders/seller: los pedidos de todos los clientes, filtrados por
 * estado. `orden`: un valor de ORDENES_PEDIDO (pedidos.js); sin él, el
 * backend pone primero los que más esperan.
 */
export async function getOrders({ estado, limit = 50, from = 0, onlyPaid = false, sort } = {}) {
  const data = await request("/orders/seller", {
    params: { status: estado, limit: limit, offset: from, paid_only: onlyPaid ? "true" : undefined, sort: sort },
    errorMessage: "No pudimos cargar los pedidos.",
  });
  return {
    orders: data.orders.map(mapSellerOrder),
    total: data.total,
    byStatus: data.counts,
    forPrepare: data.to_prepare,
  };
}

/** GET /orders/seller/{id}: el detalle de un pedido. */
export async function getOrder(id) {
  const data = await request(`/orders/seller/${encodeURIComponent(id)}`, {
    errorMessage: "No pudimos cargar el pedido.",
  });
  return mapSellerOrder(data);
}

/** PATCH /orders/{id}/status. Para cancelar, `motivo` es obligatorio (le llega al cliente). */
export async function changeOrderStatus(id, estado, motivo) {
  const data = await request(`/orders/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify(estado === "cancelled" ? { status: estado, reason: motivo } : { status: estado }),
    errorMessage: "No pudimos cambiar el estado del pedido.",
  });
  return mapSellerOrder(data);
}

/**
 * PATCH /orders/seller/{id}: el vendedor corrige el pedido a pedido del
 * cliente. Se manda solo lo que cambia: `envio` (mismo formato que
 * `pedido.envio`) y/o `notaInterna` ("" la borra).
 */
export async function updateOrder(id, { shipping, internalNote } = {}) {
  const body = {};
  if (shipping) {
    body.shipping_address = {
      personal_name: shipping.addressName,
      street: shipping.street,
      number: shipping.number,
      apartment: shipping.apartamento || null,
      city: shipping.city,
      department: shipping.department,
      postal_code: shipping.codePostal || null,
    };
  }
  if (internalNote !== undefined) body.internal_note = internalNote;
  const data = await request(`/orders/seller/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    errorMessage: "No pudimos guardar los cambios del pedido.",
  });
  return mapSellerOrder(data);
}

/* =====================================================
   DASHBOARD CON IA (HU 6.3 y 6.4)
   El resumen (HU 6.3) ya está en el backend. Preguntarle al
   dashboard (HU 6.4) todavía no: mientras tanto, esa pantalla
   dice "En desarrollo". El contrato está en cada función.
====================================================== */

/** true si la ruta todavía no existe en el backend. */
export const unpublishedFeature = (error) => error?.status === 404 || error?.status === 501;

const mapSummary = (data) => ({ puntos: data.points, generated: data.generated_at });

/**
 * GET /analytics/summary (HU 6.3): el resumen guardado del día.
 * Respuesta: { points: string[] (3 a 5), generated_at: fecha ISO }
 */
export async function getAISummary() {
  const data = await request("/analytics/summary", { errorMessage: "No pudimos cargar el resumen." });
  return mapSummary(data);
}

/** POST /analytics/summary (HU 6.3): genera uno nuevo con los datos del momento. */
export async function refreshAISummary() {
  const data = await request("/analytics/summary", {
    method: "POST",
    errorMessage: "No pudimos generar el resumen.",
  });
  return mapSummary(data);
}

/**
 * GET /analytics/summary/history (HU 6.3): los resúmenes de los últimos días,
 * del más nuevo al más viejo. No llama a la IA: anda aunque esté caída.
 * Respuesta: { days: número, summaries: [{ points, generated_at }] }
 * @returns {Promise<{days: number, summaries: {puntos: string[], generated: string}[]}>}
 */
export async function getAISummaryHistory() {
  const data = await request("/analytics/summary/history", {
    errorMessage: "No pudimos cargar los resúmenes anteriores.",
  });
  return { days: data.days, summaries: data.summaries.map(mapSummary) };
}

/**
 * POST /analytics/preguntar (HU 6.4)
 * Cuerpo: { question }
 * Respuesta: { answer, data: { columns: string[], rows: any[][] } | null }
 * `data` son los datos que se usaron para responder, para verificarlos.
 */
export async function askDashboard(pregunta) {
  const data = await request("/analytics/preguntar", {
    method: "POST",
    body: JSON.stringify({ question: pregunta }),
    errorMessage: "No pudimos responder la pregunta. Probá de nuevo en un rato.",
  });
  return {
    response: data.answer,
    info: data.data ? { columnas: data.data.columns, rows: data.data.rows } : null,
  };
}

/* =====================================================
   EQUIPO (SCRUM-175)
   Solo para administradores: la API le responde 403 a un
   vendedor común.
====================================================== */

function mapSeller(e) {
  return { id: e.id, displayName: e.name, email: e.email, isAdmin: Boolean(e.is_admin) };
}

/** GET /employees — los vendedores que siguen en el equipo. */
export async function getSellers() {
  const data = await request("/employees", { errorMessage: "No pudimos cargar el equipo." });
  return (data.employees || []).map(mapSeller);
}

/**
 * POST /employees — suma un vendedor. Le llega un mail para elegir su
 * contraseña. 409 si el correo ya tiene cuenta.
 */
export async function addSeller({ displayName, email }) {
  const data = await request("/employees", {
    method: "POST",
    body: JSON.stringify({ name: displayName.trim(), email: email.trim() }),
    errorMessage: "No pudimos agregar al vendedor.",
  });
  return mapSeller(data);
}

/** DELETE /employees/{id} — lo da de baja y cierra sus sesiones. */
export async function removeSeller(id) {
  await request(`/employees/${encodeURIComponent(id)}`, {
    method: "DELETE",
    errorMessage: "No pudimos dar de baja al vendedor.",
  });
}
