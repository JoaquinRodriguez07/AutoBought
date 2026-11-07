import { API_BASE_URL, notifyInvalidSession } from "../api";
import { getSession } from "../auth";

/* =====================================================
   API DEL DASHBOARD DEL VENDEDOR
   Todas las rutas van con el token del vendedor: /analytics
   y las de alta y edición de repuestos le responden 403 a un
   cliente. Como en api.js, las pantallas reciben los datos ya
   traducidos al shape de la UI.
====================================================== */

const MENSAJES_POR_STATUS = {
  401: "Tu sesión venció. Iniciá sesión de nuevo.",
  403: "Esta sección es solo para vendedores.",
  404: "No encontramos ese repuesto.",
};

async function request(ruta, { params, mensajeError, ...opciones } = {}) {
  const sesion = getSession();
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([clave, valor]) => {
    if (valor !== undefined && valor !== null && valor !== "") query.set(clave, valor);
  });
  const texto = query.toString();
  const url = `${API_BASE_URL}/api/v1${ruta}${texto ? `?${texto}` : ""}`;

  let response;
  try {
    response = await fetch(url, {
      ...opciones,
      headers: {
        "Content-Type": "application/json",
        ...(sesion?.token ? { Authorization: `Bearer ${sesion.token}` } : {}),
      },
    });
  } catch {
    throw new Error(mensajeError);
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
    if (response.status === 401) notifyInvalidSession(sesion?.token);
    const error = new Error(
      (typeof data?.detail === "string" && data.detail) ||
        MENSAJES_POR_STATUS[response.status] ||
        mensajeError
    );
    error.status = response.status;
    throw error;
  }

  if (data === null) throw new Error(mensajeError);
  return data;
}

// Quitar filtros = no mandarlos: `pedir` saltea los vacíos.
const filtersFrom = ({ categoria, busqueda } = {}) => ({ category: categoria, search: busqueda });

function mapPart(part) {
  return {
    id: part.id,
    codigo: part.part_code,
    nombre: part.name,
    fabricante: part.manufacturer,
    categoria: part.category,
    stock: part.stock,
  };
}

function mapMonth(mes) {
  return {
    mes: mes.month,
    unidades: mes.units,
    facturacion: mes.revenue,
    enCurso: Boolean(mes.in_progress),
  };
}

const mapForecast = (proyeccion) => ({ mes: proyeccion.month, unidades: proyeccion.units });

function mapRisk(part) {
  return {
    ...mapPart(part),
    demandaProyectada: part.projected_units,
    demandaDiaria: part.daily_demand,
    diasCobertura: part.coverage_days,
    riesgo: part.risk,
  };
}

/** GET /analytics/stock (HU 5.2) */
export async function getStock(filtros) {
  const data = await request("/analytics/stock", {
    params: filtersFrom(filtros),
    mensajeError: "No pudimos cargar el stock.",
  });
  return {
    umbralStockBajo: data.low_stock_threshold,
    repuestos: data.parts.map((part) => ({ ...mapPart(part), stockBajo: part.low_stock })),
  };
}

/** GET /analytics/best-sellers (HU 5.3), por meses calendario. */
export async function getBestSellers({ meses, limite = 10, ...filtros } = {}) {
  const data = await request("/analytics/best-sellers", {
    params: { ...filtersFrom(filtros), months: meses, limit: limite },
    mensajeError: "No pudimos cargar los más vendidos.",
  });
  return data.parts.map((part) => ({ ...mapPart(part), unidadesVendidas: part.units_sold }));
}

/** GET /analytics/sales-by-month (HU 5.4 y 5.5) */
export async function getSalesTrend({ meses, repuestoId, ...filtros } = {}) {
  const data = await request("/analytics/sales-by-month", {
    params: { ...filtersFrom(filtros), months: meses, part_id: repuestoId },
    mensajeError: "No pudimos cargar la evolución de ventas.",
  });
  return { meses: data.months.map(mapMonth), proyeccion: mapForecast(data.projection) };
}

/** GET /analytics/demand-forecast (HU 5.5) */
export async function getDemandForecast({ limite = 20, ...filtros } = {}) {
  const data = await request("/analytics/demand-forecast", {
    params: { ...filtersFrom(filtros), limit: limite },
    mensajeError: "No pudimos cargar la proyección de demanda.",
  });
  return {
    mes: data.month,
    repuestos: data.parts.map((part) => ({
      ...mapPart(part),
      unidadesUltimoAnio: part.units_last_12_months,
      demandaProyectada: part.projected_units,
    })),
  };
}

/** GET /analytics/stockout-risk (HU 5.6; con soloEnRiesgo, las alertas de la HU 5.7) */
export async function getStockoutRisk({ soloEnRiesgo = false, ...filtros } = {}) {
  const data = await request("/analytics/stockout-risk", {
    params: { ...filtersFrom(filtros), at_risk_only: soloEnRiesgo ? "true" : undefined },
    mensajeError: "No pudimos calcular el riesgo de agotamiento.",
  });
  return {
    mes: data.month,
    umbrales: { alto: data.thresholds.high_below, medio: data.thresholds.medium_up_to },
    repuestos: data.parts.map(mapRisk),
  };
}

/** GET /analytics/parts/{id} (HU 5.8) */
export async function getPartDetail(id) {
  const data = await request(`/analytics/parts/${encodeURIComponent(id)}`, {
    mensajeError: "No pudimos cargar el repuesto.",
  });
  return {
    ...mapRisk({ ...data, projected_units: data.projection.units }),
    precio: data.price,
    stockBajo: data.low_stock,
    unidadesVendidas: data.units_sold,
    meses: data.months.map(mapMonth),
    proyeccion: mapForecast(data.projection),
  };
}

/* =====================================================
   ALTA Y EDICIÓN DE REPUESTOS (HU 5.10)
====================================================== */

/** GET /analytics/car-models: los vehículos para elegir los compatibles. */
export async function getVehicles() {
  const data = await request("/analytics/car-models", { mensajeError: "No pudimos cargar los vehículos." });
  return data.car_models.map((m) => ({ id: m.id, marca: m.brand, modelo: m.model, motor: m.engine_code }));
}

/** GET /parts/{id}: los datos completos, para precargar el formulario de edición. */
export async function getPartForEdit(id) {
  const part = await request(`/parts/${encodeURIComponent(id)}`, { mensajeError: "No pudimos cargar el repuesto." });
  return {
    ...mapPart(part),
    precio: part.price,
    color: part.color || "",
    descripcion: part.description || "",
    garantiaMeses: part.warranty_months ?? "",
    compatibilidades: (part.compatibilities || []).map((c) => ({
      marca: c.brand,
      modelo: c.model,
      motor: c.engine_code,
      desde: c.year_from,
      hasta: c.year_to,
    })),
  };
}

function partBody(datos) {
  return JSON.stringify({
    part_code: datos.codigo,
    name: datos.nombre,
    manufacturer: datos.fabricante,
    category: datos.categoria,
    price: Number(datos.precio),
    ...(datos.stock !== undefined ? { stock: Number(datos.stock) } : {}),
    color: datos.color || null,
    description: datos.descripcion || null,
    warranty_months: datos.garantiaMeses === "" || datos.garantiaMeses == null ? null : Number(datos.garantiaMeses),
    compatibilities: datos.compatibilidades.map((c) => ({
      car_model_id: c.vehiculoId,
      year_from: Number(c.desde),
      year_to: Number(c.hasta),
    })),
  });
}

/** POST /parts */
export async function createPart(datos) {
  const part = await request("/parts", {
    method: "POST",
    body: partBody(datos),
    mensajeError: "No pudimos dar de alta el repuesto.",
  });
  return mapPart(part);
}

/** PUT /parts/{id}: no cambia el stock (se ajusta aparte). */
export async function updatePart(id, datos) {
  const part = await request(`/parts/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: partBody({ ...datos, stock: undefined }),
    mensajeError: "No pudimos guardar los cambios.",
  });
  return mapPart(part);
}

/** PATCH /parts/{id}/stock */
export async function adjustStock(id, stock) {
  const part = await request(`/parts/${encodeURIComponent(id)}/stock`, {
    method: "PATCH",
    body: JSON.stringify({ stock: Number(stock) }),
    mensajeError: "No pudimos ajustar el stock.",
  });
  return mapPart(part);
}

/* =====================================================
   PEDIDOS (SCRUM-171)
====================================================== */

function mapSellerOrder(p) {
  return {
    id: p.order_id,
    fecha: p.created_at,
    estado: p.status,
    // "pending" | "approved" | "rejected"; null en los de antes de Mercado Pago (ya cobrados).
    estadoPago: p.payment_status ?? null,
    total: p.total,
    metodoPago: p.payment_method,
    idPagoMP: p.mp_payment_id ?? null,
    // Cuándo se devolvió el dinero (null si no se devolvió) y si falta devolverlo.
    devueltoEl: p.refunded_at ?? null,
    faltaDevolver: Boolean(p.refund_pending),
    cliente: { nombre: p.client_name, email: p.client_email, telefono: p.client_phone ?? null },
    // A dónde se envía: la copia guardada al comprar (no cambia si el cliente edita su perfil).
    envio: {
      // El nombre que el cliente le puso a la dirección ("Casa", "Trabajo"), no quién recibe.
      nombreDireccion: p.shipping_address.personal_name,
      calle: p.shipping_address.street,
      numero: p.shipping_address.number,
      apartamento: p.shipping_address.apartment ?? null,
      ciudad: p.shipping_address.city,
      departamento: p.shipping_address.department,
      codigoPostal: p.shipping_address.postal_code ?? null,
    },
    items: p.items.map((item) => ({
      repuestoId: item.part_id,
      codigo: item.part_code,
      nombre: item.name,
      cantidad: item.quantity,
      precio: item.frozen_price,
    })),
    // Lo decide el backend: a qué estado se puede pasar (null si no se puede) y si se puede cancelar.
    siguienteEstado: p.next_status ?? null,
    // A dónde vuelve si el vendedor se equivocó (null si no se puede volver).
    anteriorEstado: p.previous_status ?? null,
    sePuedeCancelar: Boolean(p.can_cancel),
    // La dirección se corrige mientras el pedido no salió.
    sePuedeEditarEnvio: Boolean(p.can_edit_shipping),
    motivoCancelacion: p.cancellation_reason ?? null,
    // Solo la ve la tienda.
    notaInterna: p.internal_note ?? null,
  };
}

/**
 * GET /orders/seller: los pedidos de todos los clientes, filtrados por
 * estado. `orden`: un valor de ORDENES_PEDIDO (pedidos.js); sin él, el
 * backend pone primero los que más esperan.
 */
export async function getOrders({ estado, limite = 50, desde = 0, soloPagados = false, orden } = {}) {
  const data = await request("/orders/seller", {
    params: { status: estado, limit: limite, offset: desde, paid_only: soloPagados ? "true" : undefined, sort: orden },
    mensajeError: "No pudimos cargar los pedidos.",
  });
  return {
    pedidos: data.orders.map(mapSellerOrder),
    total: data.total,
    porEstado: data.counts,
    paraPreparar: data.to_prepare,
  };
}

/** GET /orders/seller/{id}: el detalle de un pedido. */
export async function getOrder(id) {
  const data = await request(`/orders/seller/${encodeURIComponent(id)}`, {
    mensajeError: "No pudimos cargar el pedido.",
  });
  return mapSellerOrder(data);
}

/** PATCH /orders/{id}/status. Para cancelar, `motivo` es obligatorio (le llega al cliente). */
export async function changeOrderStatus(id, estado, motivo) {
  const data = await request(`/orders/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify(estado === "cancelled" ? { status: estado, reason: motivo } : { status: estado }),
    mensajeError: "No pudimos cambiar el estado del pedido.",
  });
  return mapSellerOrder(data);
}

/**
 * PATCH /orders/seller/{id}: el vendedor corrige el pedido a pedido del
 * cliente. Se manda solo lo que cambia: `envio` (mismo formato que
 * `pedido.envio`) y/o `notaInterna` ("" la borra).
 */
export async function updateOrder(id, { envio, notaInterna } = {}) {
  const body = {};
  if (envio) {
    body.shipping_address = {
      personal_name: envio.nombreDireccion,
      street: envio.calle,
      number: envio.numero,
      apartment: envio.apartamento || null,
      city: envio.ciudad,
      department: envio.departamento,
      postal_code: envio.codigoPostal || null,
    };
  }
  if (notaInterna !== undefined) body.internal_note = notaInterna;
  const data = await request(`/orders/seller/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    mensajeError: "No pudimos guardar los cambios del pedido.",
  });
  return mapSellerOrder(data);
}

/* =====================================================
   DASHBOARD CON IA (HU 6.3 y 6.4)
   El backend todavía no tiene estas rutas: las pantallas ya
   están listas y, mientras tanto, dicen "En desarrollo".
   El contrato propuesto está en cada función.
====================================================== */

/** true si la ruta todavía no existe en el backend. */
export const unpublishedFeature = (error) => error?.status === 404 || error?.status === 501;

const mapSummary = (data) => ({ puntos: data.points, generado: data.generated_at });

/**
 * GET /analytics/summary (HU 6.3): el resumen guardado del día.
 * Respuesta: { points: string[] (3 a 5), generated_at: fecha ISO }
 */
export async function getAISummary() {
  const data = await request("/analytics/summary", { mensajeError: "No pudimos cargar el resumen." });
  return mapSummary(data);
}

/** POST /analytics/summary (HU 6.3): genera uno nuevo con los datos del momento. */
export async function refreshAISummary() {
  const data = await request("/analytics/summary", {
    method: "POST",
    mensajeError: "No pudimos generar el resumen.",
  });
  return mapSummary(data);
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
    mensajeError: "No pudimos responder la pregunta. Probá de nuevo en un rato.",
  });
  return {
    respuesta: data.answer,
    datos: data.data ? { columnas: data.data.columns, filas: data.data.rows } : null,
  };
}

/* =====================================================
   EQUIPO (SCRUM-175)
   Solo para administradores: la API le responde 403 a un
   vendedor común.
====================================================== */

function mapSeller(e) {
  return { id: e.id, nombre: e.name, email: e.email, isAdmin: Boolean(e.is_admin) };
}

/** GET /employees — los vendedores que siguen en el equipo. */
export async function getSellers() {
  const data = await request("/employees", { mensajeError: "No pudimos cargar el equipo." });
  return (data.employees || []).map(mapSeller);
}

/**
 * POST /employees — suma un vendedor. Le llega un mail para elegir su
 * contraseña. 409 si el correo ya tiene cuenta.
 */
export async function addSeller({ nombre, email }) {
  const data = await request("/employees", {
    method: "POST",
    body: JSON.stringify({ name: nombre.trim(), email: email.trim() }),
    mensajeError: "No pudimos agregar al vendedor.",
  });
  return mapSeller(data);
}

/** DELETE /employees/{id} — lo da de baja y cierra sus sesiones. */
export async function removeSeller(id) {
  await request(`/employees/${encodeURIComponent(id)}`, {
    method: "DELETE",
    mensajeError: "No pudimos dar de baja al vendedor.",
  });
}
