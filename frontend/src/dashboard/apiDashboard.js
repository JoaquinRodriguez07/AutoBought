import { API_BASE_URL, avisarSesionInvalida } from "../api";
import { obtenerSesion } from "../auth";

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

async function pedir(ruta, { params, mensajeError, ...opciones } = {}) {
  const sesion = obtenerSesion();
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

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    if (response.status === 401) avisarSesionInvalida(sesion?.token);
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
const filtrosDe = ({ categoria, busqueda } = {}) => ({ category: categoria, search: busqueda });

function mapearRepuesto(part) {
  return {
    id: part.id,
    codigo: part.part_code,
    nombre: part.name,
    fabricante: part.manufacturer,
    categoria: part.category,
    stock: part.stock,
  };
}

function mapearMes(mes) {
  return {
    mes: mes.month,
    unidades: mes.units,
    facturacion: mes.revenue,
    enCurso: Boolean(mes.in_progress),
  };
}

const mapearProyeccion = (proyeccion) => ({ mes: proyeccion.month, unidades: proyeccion.units });

function mapearRiesgo(part) {
  return {
    ...mapearRepuesto(part),
    demandaProyectada: part.projected_units,
    demandaDiaria: part.daily_demand,
    diasCobertura: part.coverage_days,
    riesgo: part.risk,
  };
}

/** GET /analytics/stock (HU 5.2) */
export async function obtenerStock(filtros) {
  const data = await pedir("/analytics/stock", {
    params: filtrosDe(filtros),
    mensajeError: "No pudimos cargar el stock.",
  });
  return {
    umbralStockBajo: data.low_stock_threshold,
    repuestos: data.parts.map((part) => ({ ...mapearRepuesto(part), stockBajo: part.low_stock })),
  };
}

/** GET /analytics/best-sellers (HU 5.3), por meses calendario. */
export async function obtenerMasVendidos({ meses, limite = 10, ...filtros } = {}) {
  const data = await pedir("/analytics/best-sellers", {
    params: { ...filtrosDe(filtros), months: meses, limit: limite },
    mensajeError: "No pudimos cargar los más vendidos.",
  });
  return data.parts.map((part) => ({ ...mapearRepuesto(part), unidadesVendidas: part.units_sold }));
}

/** GET /analytics/sales-by-month (HU 5.4 y 5.5) */
export async function obtenerEvolucionVentas({ meses, repuestoId, ...filtros } = {}) {
  const data = await pedir("/analytics/sales-by-month", {
    params: { ...filtrosDe(filtros), months: meses, part_id: repuestoId },
    mensajeError: "No pudimos cargar la evolución de ventas.",
  });
  return { meses: data.months.map(mapearMes), proyeccion: mapearProyeccion(data.projection) };
}

/** GET /analytics/demand-forecast (HU 5.5) */
export async function obtenerProyeccionDemanda({ limite = 20, ...filtros } = {}) {
  const data = await pedir("/analytics/demand-forecast", {
    params: { ...filtrosDe(filtros), limit: limite },
    mensajeError: "No pudimos cargar la proyección de demanda.",
  });
  return {
    mes: data.month,
    repuestos: data.parts.map((part) => ({
      ...mapearRepuesto(part),
      unidadesUltimoAnio: part.units_last_12_months,
      demandaProyectada: part.projected_units,
    })),
  };
}

/** GET /analytics/stockout-risk (HU 5.6; con soloEnRiesgo, las alertas de la HU 5.7) */
export async function obtenerRiesgoAgotamiento({ soloEnRiesgo = false, ...filtros } = {}) {
  const data = await pedir("/analytics/stockout-risk", {
    params: { ...filtrosDe(filtros), at_risk_only: soloEnRiesgo ? "true" : undefined },
    mensajeError: "No pudimos calcular el riesgo de agotamiento.",
  });
  return {
    mes: data.month,
    umbrales: { alto: data.thresholds.high_below, medio: data.thresholds.medium_up_to },
    repuestos: data.parts.map(mapearRiesgo),
  };
}

/** GET /analytics/parts/{id} (HU 5.8) */
export async function obtenerDetalleRepuesto(id) {
  const data = await pedir(`/analytics/parts/${encodeURIComponent(id)}`, {
    mensajeError: "No pudimos cargar el repuesto.",
  });
  return {
    ...mapearRiesgo({ ...data, projected_units: data.projection.units }),
    precio: data.price,
    stockBajo: data.low_stock,
    unidadesVendidas: data.units_sold,
    meses: data.months.map(mapearMes),
    proyeccion: mapearProyeccion(data.projection),
  };
}

/* =====================================================
   ALTA Y EDICIÓN DE REPUESTOS (HU 5.10)
====================================================== */

/** GET /analytics/car-models: los vehículos para elegir los compatibles. */
export async function obtenerVehiculos() {
  const data = await pedir("/analytics/car-models", { mensajeError: "No pudimos cargar los vehículos." });
  return data.car_models.map((m) => ({ id: m.id, marca: m.brand, modelo: m.model, motor: m.engine_code }));
}

/** GET /parts/{id}: los datos completos, para precargar el formulario de edición. */
export async function obtenerRepuestoParaEditar(id) {
  const part = await pedir(`/parts/${encodeURIComponent(id)}`, { mensajeError: "No pudimos cargar el repuesto." });
  return {
    ...mapearRepuesto(part),
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

function cuerpoRepuesto(datos) {
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
export async function crearRepuesto(datos) {
  const part = await pedir("/parts", {
    method: "POST",
    body: cuerpoRepuesto(datos),
    mensajeError: "No pudimos dar de alta el repuesto.",
  });
  return mapearRepuesto(part);
}

/** PUT /parts/{id}: no cambia el stock (se ajusta aparte). */
export async function editarRepuesto(id, datos) {
  const part = await pedir(`/parts/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: cuerpoRepuesto({ ...datos, stock: undefined }),
    mensajeError: "No pudimos guardar los cambios.",
  });
  return mapearRepuesto(part);
}

/** PATCH /parts/{id}/stock */
export async function ajustarStock(id, stock) {
  const part = await pedir(`/parts/${encodeURIComponent(id)}/stock`, {
    method: "PATCH",
    body: JSON.stringify({ stock: Number(stock) }),
    mensajeError: "No pudimos ajustar el stock.",
  });
  return mapearRepuesto(part);
}
