import { mapearCategoria, mapearItemCarrito, mapearRepuesto } from "./mapearRepuesto";
import { obtenerSesion } from "./auth";

const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export async function login(email, password) {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const data = await response.json();

  if (!response.ok) {
    const mensaje =
      typeof data.detail === "string"
        ? data.detail
        : "Correo electrónico o contraseña incorrectos.";
    throw new Error(mensaje);
  }

  return data;
}

/* =====================================================
   CATÁLOGO
   Las pantallas reciben los repuestos YA mapeados al shape
   de la UI (ver mapearRepuesto.js): la traducción del
   contrato del backend vive en el borde del fetch, no en
   los componentes.
====================================================== */

// Marca "la respuesta no traía JSON parseable". No alcanza con `null`:
// un 200 con un cuerpo roto (ej: el HTML de un proxy) no es una lista
// vacía, es un error, y tiene que llegar al estado de error de la
// pantalla en vez de mostrarse como "No encontramos productos".
const SIN_JSON = Symbol("sin-json");

async function leerJson(response) {
  try {
    return await response.json();
  } catch {
    return SIN_JSON;
  }
}

function errorDeRespuesta(data, mensajePorDefecto) {
  const mensaje =
    typeof data?.detail === "string" ? data.detail : mensajePorDefecto;
  return new Error(mensaje);
}

/**
 * GET + parseo con los errores ya traducidos al mensaje en español que
 * muestra la UI. Cubre los tres casos: red caída, status de error y
 * cuerpo no parseable.
 *
 * @param {string} url
 * @param {string} mensajeError - copy por defecto de la pantalla.
 * @returns {Promise<object>} el JSON de la respuesta.
 */
async function pedirJson(url, mensajeError) {
  let response;

  try {
    response = await fetch(url);
  } catch {
    // `fetch` RECHAZA (no devuelve un status) si el backend está caído
    // o no hay red: el TypeError trae "Failed to fetch", en inglés y
    // sin contexto. Se descarta y se usa el copy de la pantalla.
    throw new Error(mensajeError);
  }

  const data = await leerJson(response);

  if (!response.ok) {
    throw errorDeRespuesta(data === SIN_JSON ? null : data, mensajeError);
  }

  if (data === SIN_JSON) {
    throw new Error(mensajeError);
  }

  return data;
}

/**
 * Saca la lista de la respuesta EXIGIENDO que venga como array.
 *
 * Un 2xx con JSON válido pero sin la clave esperada (drift del contrato,
 * o un proxy que contesta 200 con un sobre de error) NO es "no hay
 * resultados": es un error. Si se devolviera `[]` la pantalla apagaría
 * "Cargando…" sin error, y quedaría en blanco -sin lista, sin mensaje y
 * sin Reintentar-, que es el peor estado posible para el usuario.
 *
 * @param {object} data - JSON ya parseado de la respuesta.
 * @param {string} clave - "parts" | "categories".
 * @param {string} mensajeError - copy por defecto de la pantalla.
 * @returns {Array<object>}
 */
function listaDe(data, clave, mensajeError) {
  const lista = data?.[clave];

  if (!Array.isArray(lista)) {
    throw new Error(mensajeError);
  }

  return lista;
}

/**
 * GET /api/v1/parts[?categoria=<nombre>&brand=<marca>&model=<modelo>&year=<año>]
 *
 * Sin filtros devuelve el catálogo completo: ese es el caso de
 * "Limpiar filtros". El filtro por categoría y por vehículo (marca,
 * modelo, año) los resuelve el backend; la búsqueda por texto y el
 * orden siguen siendo del lado del cliente (ver filtrarRepuestos.js).
 *
 * Se acepta un string (compatibilidad: solo categoría) o un objeto
 * `{ categoria, brand, model, year }` para combinar filtro de
 * categoría con el de vehículo.
 *
 * @param {string|{categoria?: string, brand?: string, model?: string, year?: string|number}} [filtros]
 * @returns {Promise<Array<object>>} repuestos con el shape de la UI.
 */
export async function obtenerRepuestos(filtros) {
  const { categoria, brand, model, year } =
    typeof filtros === "string" ? { categoria: filtros } : filtros || {};

  const params = new URLSearchParams();
  if (categoria) params.set("categoria", categoria);
  if (brand) params.set("brand", brand);
  if (model) params.set("model", model);
  if (year) params.set("year", year);

  const url = `${API_BASE_URL}/api/v1/parts${
    params.toString() ? `?${params.toString()}` : ""
  }`;

  const mensajeError = "No pudimos cargar los repuestos.";
  const data = await pedirJson(url, mensajeError);

  return listaDe(data, "parts", mensajeError).map(mapearRepuesto);
}

/**
 * GET /api/v1/parts/categories
 *
 * Devuelve las categorías con productos (alfabéticas, sin las vacías)
 * y su cantidad real, ya con el shape `{ nombre, cantidad }` que usa
 * el sidebar del catálogo.
 *
 * @returns {Promise<Array<{nombre: string, cantidad: number}>>}
 */
export async function obtenerCategorias() {
  const mensajeError = "No pudimos cargar las categorías.";
  const data = await pedirJson(
    `${API_BASE_URL}/api/v1/parts/categories`,
    mensajeError
  );

  return listaDe(data, "categories", mensajeError).map(mapearCategoria);
}

/* =====================================================
   CARRITO
   A diferencia del catálogo, estas rutas van con el JWT
   de la sesión (Authorization: Bearer) y son mutaciones:
   cada una devuelve el carrito COMPLETO ya actualizado
   (items + total), así CartContext no tiene que llevar
   la cuenta a mano de subtotales ni de stock.
====================================================== */

/**
 * GET/POST/PATCH/DELETE de `/api/v1/cart*` devuelven los mismos
 * códigos que ya maneja `errorDeRespuesta` (401/403/404/409/422), pero
 * acá el mensaje por status importa para que CartContext decida qué
 * hacer (401 → redirigir a login, 409 → avisar el stock disponible).
 * Se guarda en `error.status` en vez de parsear el mensaje.
 */
const MENSAJES_POR_STATUS_CARRITO = {
  401: "Tu sesión venció. Iniciá sesión de nuevo.",
  403: "Esta acción requiere una cuenta de cliente.",
  404: "No encontramos ese repuesto.",
  409: "No hay stock suficiente.",
  422: "La cantidad no es válida.",
};

async function pedirCarrito(url, options = {}) {
  const sesion = obtenerSesion();

  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(sesion?.token ? { Authorization: `Bearer ${sesion.token}` } : {}),
        ...(options.headers || {}),
      },
    });
  } catch {
    throw new Error("No pudimos conectar con el carrito.");
  }

  const data = await leerJson(response);

  if (!response.ok) {
    const detalle =
      data !== SIN_JSON && typeof data?.detail === "string"
        ? data.detail
        : null;

    const error = new Error(
      detalle ||
        MENSAJES_POR_STATUS_CARRITO[response.status] ||
        "No pudimos actualizar el carrito."
    );
    error.status = response.status;
    throw error;
  }

  if (data === SIN_JSON) {
    const error = new Error("No pudimos leer la respuesta del carrito.");
    error.status = response.status;
    throw error;
  }

  return data;
}

function mapearCarritoDetalle(data) {
  return {
    items: (data.items || []).map(mapearItemCarrito),
    total: data.total ?? 0,
  };
}

/** GET /api/v1/cart (si el cliente no tiene carrito, el backend lo crea) */
export async function obtenerCarrito() {
  const data = await pedirCarrito(`${API_BASE_URL}/api/v1/cart`);
  return mapearCarritoDetalle(data);
}

/** POST /api/v1/cart/items — si el repuesto ya está, el backend suma. */
export async function agregarItemCarrito(partId, amount) {
  const data = await pedirCarrito(`${API_BASE_URL}/api/v1/cart/items`, {
    method: "POST",
    body: JSON.stringify({ part_id: partId, amount }),
  });
  return mapearCarritoDetalle(data);
}

/** PATCH /api/v1/cart/items/{part_id} — reemplaza la cantidad. */
export async function actualizarItemCarrito(partId, amount) {
  const data = await pedirCarrito(
    `${API_BASE_URL}/api/v1/cart/items/${partId}`,
    { method: "PATCH", body: JSON.stringify({ amount }) }
  );
  return mapearCarritoDetalle(data);
}

/** DELETE /api/v1/cart/items/{part_id} */
export async function eliminarItemCarrito(partId) {
  const data = await pedirCarrito(
    `${API_BASE_URL}/api/v1/cart/items/${partId}`,
    { method: "DELETE" }
  );
  return mapearCarritoDetalle(data);
}

/** DELETE /api/v1/cart — vaciar. */
export async function vaciarCarritoAPI() {
  const data = await pedirCarrito(`${API_BASE_URL}/api/v1/cart`, {
    method: "DELETE",
  });
  return mapearCarritoDetalle(data);
}
