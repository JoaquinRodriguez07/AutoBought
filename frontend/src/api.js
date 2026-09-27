import { mapearCategoria, mapearRepuesto } from "./mapearRepuesto";

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
 * GET /api/v1/parts[?categoria=&brand=&model=&year=]
 *
 * Sin filtros devuelve el catálogo completo: ese es el caso de
 * "Limpiar filtros". Los filtros por categoría y por vehículo
 * (marca / modelo / año) los resuelve el backend y se pueden
 * combinar; la búsqueda por texto y el orden siguen siendo del
 * lado del cliente (ver filtrarRepuestos.js).
 *
 * @param {string} [categoria]
 * @param {{brand?: string, model?: string, year?: string|number}} [vehiculo]
 * @returns {Promise<Array<object>>} repuestos con el shape de la UI.
 */
export async function obtenerRepuestos(categoria, vehiculo) {
  const params = new URLSearchParams();

  if (categoria) params.set("categoria", categoria);
  if (vehiculo?.brand) params.set("brand", vehiculo.brand);
  if (vehiculo?.model) params.set("model", vehiculo.model);
  if (vehiculo?.year) params.set("year", String(vehiculo.year));

  const query = params.toString();
  const url = `${API_BASE_URL}/api/v1/parts${query ? `?${query}` : ""}`;

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