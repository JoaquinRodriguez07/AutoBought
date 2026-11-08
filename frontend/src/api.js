import { mapCategory, mapCartItem, mapPart } from "./mapPart";
import { getSession } from "./auth";
import { formatUyPhone } from "./phone";

// En Vercel el frontend y el backend comparten dominio: frontend/.env.production
// deja VITE_API_URL vacía y los pedidos van a /api/v1/... del mismo sitio.
// En desarrollo (y en Docker) la variable no está o apunta al backend local.
export const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

/* =====================================================
   SESIÓN INVÁLIDA (401)
   Cuando el backend rechaza el token de un pedido autenticado
   (la contraseña se cambió en otro dispositivo, el token venció),
   la sesión terminó. En vez de que cada pantalla maneje su 401,
   App.jsx registra UN manejador con `alSesionInvalida` y es el
   único que cierra la sesión, avisa y lleva a /login.
====================================================== */

const invalidSessionHandlers = new Set();

/**
 * Registra `fn` para que se llame cuando un pedido que mandó
 * `Authorization: Bearer` recibe un 401. Devuelve la función que la
 * desregistra.
 *
 * NO se dispara con el 401 de `login` (contraseña incorrecta: no hay
 * sesión que cerrar) ni con el 400 de «contraseña actual incorrecta» de
 * `cambiarPassword`. `renovarToken` tampoco: su 401 ya llega a App.jsx por
 * `useRenovacionSesion`.
 */
export function onInvalidSession(fn) {
  invalidSessionHandlers.add(fn);
  return () => invalidSessionHandlers.delete(fn);
}

/**
 * Avisa que el token `tokenEnviado` fue rechazado. Se ignora si la sesión
 * guardada ya no usa ese token: o ya se cerró (varios pedidos en vuelo
 * dieron 401 a la vez: solo el primero cierra la sesión) o se renovó (un
 * pedido viejo, hecho con el token anterior al cambio de contraseña, no
 * tiene que cerrar la sesión nueva).
 */
export function notifyInvalidSession(shippedToken) {
  if (!shippedToken || getSession()?.token !== shippedToken) return;
  [...invalidSessionHandlers].forEach((fn) => fn());
}

export async function login(email, password) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new Error("No pudimos conectar con el servidor.");
  }

  const data = await readJson(response);

  if (!response.ok) {
    const message =
      data !== NO_JSON && typeof data?.detail === "string"
        ? data.detail
        : "Correo electrónico o contraseña incorrectos.";
    throw new Error(message);
  }

  if (data === NO_JSON) {
    throw new Error("No pudimos leer la respuesta del servidor.");
  }

  return data;
}

/**
 * Borra los datos personales de la cuenta sin eliminar sus pedidos.
 *
 * @param {string} password - Contraseña actual del cliente.
 * @returns {Promise<void>}
 */
export async function deleteAccount(password) {
  await fetchCustomerAccount(
    `${API_BASE_URL}/api/v1/users/me`,
    {
      method: "DELETE",
      body: JSON.stringify({ password }),
    },
    {},
    "No pudimos borrar tu cuenta."
  );
}

/**
 * POST /api/v1/auth/register
 *
 * El formulario pide nombre y apellido por separado, pero el backend
 * guarda un único `name`: se envían unidos. El teléfono viaja como `phone`.
 *
 * 201 devuelve el mismo `{ access_token, token_type }` que el login,
 * para dejar la sesión iniciada. 409 = correo ya registrado.
 */
export async function register({ displayName, lastName, email, phone, password }) {
  let response;

  try {
    response = await fetch(`${API_BASE_URL}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `${displayName} ${lastName}`.trim(),
        email,
        phone: phone || null,
        password,
      }),
    });
  } catch {
    throw new Error("No pudimos conectar con el servidor.");
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    // 409 trae `detail` como string; 422 trae una lista de errores de
    // validación que no sirve para mostrar tal cual.
    const message =
      typeof data?.detail === "string"
        ? data.detail
        : response.status === 422
          ? "Revisá los datos ingresados."
          : "No pudimos crear tu cuenta. Intentá de nuevo.";
    const error = new Error(message);
    error.fields = fieldsWithErrors(data?.detail);
    throw error;
  }

  if (!data?.access_token) {
    throw new Error("No pudimos crear tu cuenta. Intentá de nuevo.");
  }

  return data;
}

/**
 * POST /api/v1/auth/refresh
 *
 * Cambia el token vigente de la sesión por uno nuevo (mismo shape que el
 * login: `{ access_token, token_type }`). Si el token ya venció o no es
 * válido, el backend contesta 401: se propaga en `error.status` para que
 * quien llama distinga "la sesión terminó" (401) de un problema pasajero
 * de red o de servidor, que se puede reintentar.
 */
export async function renewToken() {
  const session = getSession();
  let response;

  try {
    response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session?.token}` },
    });
  } catch {
    throw new Error("No pudimos conectar con el servidor.");
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  // La sesión cambió mientras el pedido estaba en vuelo (cambió la contraseña
  // en este dispositivo y se guardó un token nuevo, o se cerró): la respuesta
  // es del token viejo, ya revocado. No se usa, ni siquiera su 401: pisaría
  // o cerraría la sesión nueva. Sin `status`, useRenovacionSesion lo toma
  // como pasajero y, si la sesión sigue, reprograma con el token vigente.
  if (getSession()?.token !== session?.token) {
    throw new Error("La sesión cambió mientras se renovaba.");
  }

  if (!response.ok || !data?.access_token) {
    const error = new Error(
      response.status === 401
        ? "Tu sesión venció. Iniciá sesión de nuevo."
        : "No pudimos renovar tu sesión."
    );
    error.status = response.status;
    throw error;
  }

  return data;
}

/**
 * GET /api/v1/auth/me
 *
 * Perfil del cliente dueño del token. Recibe el token por parámetro (y
 * no de la sesión guardada) porque se usa justo después del login o del
 * registro, antes de que la sesión se persista.
 *
 * Devuelve el shape de la sesión de la UI. El backend guarda un único
 * `name` (nombre + apellido), por eso `apellido` queda vacío: Navbar y
 * Perfil muestran `nombre` + `apellido`, así que se ve igual.
 */
export async function getProfile(token) {
  let response;

  try {
    response = await fetch(`${API_BASE_URL}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new Error("No pudimos conectar con el servidor.");
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (response.status === 401) notifyInvalidSession(token);

  if (!response.ok || !data) {
    throw new Error("No pudimos cargar tu perfil.");
  }

  return mapProfile(data);
}

function mapProfile(data) {
  return {
    displayName: data.name,
    lastName: "",
    email: data.email,
    phone: formatUyPhone(data.phone),
    verifiedEmail: data.email_verified,
    recibeOfertas: data.marketing_emails,
  };
}

export async function updateProfile({ displayName, lastName, phone }) {
  const session = getSession();
  let response;

  try {
    response = await fetch(`${API_BASE_URL}/api/v1/auth/me`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.token}`,
      },
      body: JSON.stringify({
        name: `${displayName} ${lastName}`.trim(),
        phone: phone || null,
      }),
    });
  } catch {
    throw new Error("No pudimos conectar con el servidor.");
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (response.status === 401) notifyInvalidSession(session?.token);

  if (!response.ok || !data) {
    const message =
      response.status === 401
        ? "Tu sesión venció. Iniciá sesión de nuevo."
        : response.status === 422
          ? Object.values(fieldsWithErrors(data?.detail))[0] ||
            "Revisá el nombre y el teléfono (ej: 099 123 456)."
          : "No pudimos guardar tus datos.";
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return mapProfile(data);
}

/**
 * PATCH /api/v1/auth/me/password
 *
 * Al cambiar la contraseña el backend invalida TODOS los tokens anteriores
 * (también el de esta sesión) y devuelve uno nuevo, `{ access_token,
 * token_type }`, el único válido: quien llama tiene que guardarlo para que
 * este dispositivo siga logueado (ver CambiarPassword.jsx).
 */
export async function changePassword(current, newPassword) {
  const session = getSession();
  let response;

  try {
    response = await fetch(`${API_BASE_URL}/api/v1/auth/me/password`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.token}`,
      },
      body: JSON.stringify({ current_password: current, new_password: newPassword }),
    });
  } catch {
    throw new Error("No pudimos conectar con el servidor.");
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (response.ok) return data;

  // Solo el 401 (token inválido) es sesión inválida: el 400 de «contraseña
  // actual incorrecta» es un error del formulario.
  if (response.status === 401) notifyInvalidSession(session?.token);

  const message =
    response.status === 401
      ? "Tu sesión venció. Iniciá sesión de nuevo."
      : typeof data?.detail === "string"
        ? data.detail
        : response.status === 422
          ? Object.values(fieldsWithErrors(data?.detail))[0] ||
            "Revisá la nueva contraseña."
          : "No pudimos cambiar tu contraseña.";
  const error = new Error(message);
  error.status = response.status;
  throw error;
}

/* =====================================================
   MAILS DE CUENTA
   Verificar el correo y recuperar la contraseña. Los enlaces
   de los mails traen un `token` que estas funciones mandan
   al backend.
====================================================== */

// POST sin sesión que solo importa si salió bien: devuelve el JSON (o
// null) y, si falla, tira un Error con el `detail` del backend.
async function postAccount(route, requestBody, messageByDefecto, headers = {}) {
  let response;

  try {
    response = await fetch(`${API_BASE_URL}/api/v1/auth/${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
    });
  } catch {
    throw new Error("No pudimos conectar con el servidor.");
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message =
      typeof data?.detail === "string"
        ? data.detail
        : response.status === 422
          ? Object.values(fieldsWithErrors(data?.detail))[0] || messageByDefecto
          : messageByDefecto;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return data;
}

/** POST /api/v1/auth/verify-email — 204, o 400 si el enlace no sirve. */
export async function verifyEmail(token) {
  await postAccount("verify-email", { token }, "No pudimos verificar tu correo.");
}

/** POST /api/v1/auth/verify-email/resend — vuelve a mandar el mail. */
export async function resendVerification() {
  const session = getSession();

  try {
    await postAccount(
      "verify-email/resend",
      undefined,
      "No pudimos reenviar el mail.",
      { Authorization: `Bearer ${session?.token}` }
    );
  } catch (error) {
    if (error.status === 401) notifyInvalidSession(session?.token);
    throw error;
  }
}

/**
 * POST /api/v1/auth/password/forgot — 202 siempre, exista o no el
 * correo. Devuelve el mensaje del backend para mostrarlo tal cual.
 */
export async function requestPasswordReset(email) {
  const data = await postAccount(
    "password/forgot",
    { email },
    "No pudimos procesar el pedido."
  );
  return data?.detail;
}

/** POST /api/v1/auth/password/reset — 204; 400 enlace inválido; 422 contraseña débil. */
export async function resetPassword(token, newPassword) {
  await postAccount(
    "password/reset",
    { token, new_password: newPassword },
    "No pudimos cambiar tu contraseña."
  );
}

/** POST /api/v1/auth/unsubscribe — enlace de baja de los mails comerciales. */
export async function unsubscribe(token) {
  await postAccount("unsubscribe", { token }, "No pudimos procesar la baja.");
}

/**
 * PUT /api/v1/auth/me/preferences — interruptor «Ofertas y recordatorios
 * por mail» del perfil. Devuelve el perfil actualizado.
 */
export async function saveMailPreferences(recibeOfertas) {
  const data = await fetchCustomerAccount(
    `${API_BASE_URL}/api/v1/auth/me/preferences`,
    { method: "PUT", body: JSON.stringify({ marketing_emails: recibeOfertas }) },
    { 401: "Tu sesión venció. Iniciá sesión de nuevo." },
    "No pudimos guardar tu preferencia."
  );
  return mapProfile(data);
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
const NO_JSON = Symbol("sin-json");

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return NO_JSON;
  }
}

function responseError(data, messageByDefecto, statusCode) {
  const message =
    typeof data?.detail === "string" ? data.detail : messageByDefecto;
  const error = new Error(message);
  error.status = statusCode;
  return error;
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
async function fetchJson(url, errorMessage) {
  let response;

  try {
    response = await fetch(url);
  } catch {
    // `fetch` RECHAZA (no devuelve un status) si el backend está caído
    // o no hay red: el TypeError trae "Failed to fetch", en inglés y
    // sin contexto. Se descarta y se usa el copy de la pantalla.
    throw new Error(errorMessage);
  }

  const data = await readJson(response);

  if (!response.ok) {
    throw responseError(data === NO_JSON ? null : data, errorMessage, response.status);
  }

  if (data === NO_JSON) {
    throw new Error(errorMessage);
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
function listFrom(data, key, errorMessage) {
  const list = data?.[key];

  if (!Array.isArray(list)) {
    throw new Error(errorMessage);
  }

  return list;
}

/**
 * GET /api/v1/parts[?categoria=<nombre>&brand=<marca>&model=<modelo>&year=<año>]
 *
 * Sin filtros devuelve el catálogo completo: ese es el caso de
 * "Limpiar filtros". El filtro por categoría y por vehículo (marca,
 * modelo, año) los resuelve el backend y se acumulan en un mismo
 * pedido; la búsqueda por texto y el orden siguen siendo del lado del
 * cliente (ver filtrarRepuestos.js).
 *
 * Se acepta un string (compatibilidad: solo categoría) o un objeto
 * `{ categoria, brand, model, year }` para combinar los filtros.
 *
 * @param {string|{categoria?: string, brand?: string, model?: string, year?: string|number}} [filtros]
 * @returns {Promise<Array<object>>} repuestos con el shape de la UI.
 */
export async function getParts(filters) {
  const { categoria, brand, model, year } =
    typeof filters === "string" ? { categoria: filters } : filters || {};

  const params = new URLSearchParams();
  if (categoria) params.set("categoria", categoria);
  if (brand) params.set("brand", brand);
  if (model) params.set("model", model);
  if (year) params.set("year", year);

  const url = `${API_BASE_URL}/api/v1/parts${
    params.toString() ? `?${params.toString()}` : ""
  }`;

  const errorMessage = "No pudimos cargar los repuestos.";
  const data = await fetchJson(url, errorMessage);

  return listFrom(data, "parts", errorMessage).map(mapPart);
}

/** GET /api/v1/parts/{id}; devuelve un repuesto con el mismo mapeo que el catálogo. */
export async function getPart(id) {
  const errorMessage = "No pudimos cargar el repuesto.";
  const data = await fetchJson(
    `${API_BASE_URL}/api/v1/parts/${encodeURIComponent(id)}`,
    errorMessage
  );

  if (!data || typeof data !== "object" || Array.isArray(data) || data.id == null) {
    throw new Error(errorMessage);
  }

  return mapPart(data);
}

/**
 * Búsqueda libre en lenguaje natural.
 * Ejemplo: "pastillas de freno onix 2020"
 */
export async function searchText(texto) {
  const errorMessage = "No pudimos realizar la búsqueda.";

  const params = new URLSearchParams();
  params.set("q", texto);

  const data = await fetchJson(
    `${API_BASE_URL}/api/v1/parts?${params.toString()}`,
    errorMessage
  );

  return {
    parts: listFrom(data, "parts", errorMessage).map(mapPart),
    entities: data.entities || {
      part: null,
      brand: null,
      model: null,
      year: null,
      fuel: null,
    },
  };
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
export async function getCategories() {
  const errorMessage = "No pudimos cargar las categorías.";
  const data = await fetchJson(
    `${API_BASE_URL}/api/v1/parts/categories`,
    errorMessage
  );

  return listFrom(data, "categories", errorMessage).map(mapCategory);
}

/**
 * GET /api/v1/parts/manufacturers: los fabricantes con repuestos, del que
 * más tiene al que menos, con el mismo shape `{ nombre, cantidad }`.
 */
export async function getManufacturers() {
  const errorMessage = "No pudimos cargar los fabricantes.";
  const data = await fetchJson(
    `${API_BASE_URL}/api/v1/parts/manufacturers`,
    errorMessage
  );

  return listFrom(data, "manufacturers", errorMessage).map(mapCategory);
}

/**
 * GET /api/v1/parts/best-sellers
 *
 * Los repuestos más vendidos de los últimos `dias` días, solo los que
 * tienen stock: la tienda no ofrece lo que no se puede comprar. El
 * dashboard del vendedor puede pedir la misma ruta sin `in_stock`.
 *
 * @returns {Promise<Array<object>>} repuestos con el shape de la UI.
 */
export async function getBestSellers({ limit = 4, days = 90 } = {}) {
  const params = new URLSearchParams({
    limit: limit,
    days: days,
    in_stock: "true",
  });

  const errorMessage = "No pudimos cargar los más vendidos.";
  const data = await fetchJson(
    `${API_BASE_URL}/api/v1/parts/best-sellers?${params.toString()}`,
    errorMessage
  );

  return listFrom(data, "parts", errorMessage).map(mapPart);
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
 * hacer (401 → lo maneja `alSesionInvalida`, 409 → avisar el stock disponible).
 * Se guarda en `error.status` en vez de parsear el mensaje.
 */
const CART_STATUS_MESSAGES = {
  401: "Tu sesión venció. Iniciá sesión de nuevo.",
  403: "Esta acción requiere una cuenta de cliente.",
  404: "No encontramos ese repuesto.",
  409: "No hay stock suficiente.",
  422: "La cantidad no es válida.",
};

async function fetchCart(url, options = {}) {
  const session = getSession();

  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
        ...(options.headers || {}),
      },
    });
  } catch {
    throw new Error("No pudimos conectar con el carrito.");
  }

  const data = await readJson(response);

  if (!response.ok) {
    if (response.status === 401) notifyInvalidSession(session?.token);

    const details =
      data !== NO_JSON && typeof data?.detail === "string"
        ? data.detail
        : null;

    const error = new Error(
      details ||
        CART_STATUS_MESSAGES[response.status] ||
        "No pudimos actualizar el carrito."
    );
    error.status = response.status;
    throw error;
  }

  if (data === NO_JSON) {
    const error = new Error("No pudimos leer la respuesta del carrito.");
    error.status = response.status;
    throw error;
  }

  return data;
}

function mapCartDetail(data) {
  return {
    items: (data.items || []).map(mapCartItem),
    total: data.total ?? 0,
  };
}

/** GET /api/v1/cart (si el cliente no tiene carrito, el backend lo crea) */
export async function getCart() {
  const data = await fetchCart(`${API_BASE_URL}/api/v1/cart`);
  return mapCartDetail(data);
}

/** POST /api/v1/cart/items — si el repuesto ya está, el backend suma. */
export async function addCartItem(partId, amount) {
  const data = await fetchCart(`${API_BASE_URL}/api/v1/cart/items`, {
    method: "POST",
    body: JSON.stringify({ part_id: partId, amount }),
  });
  return mapCartDetail(data);
}

/** PATCH /api/v1/cart/items/{part_id} — reemplaza la cantidad. */
export async function updateCartItem(partId, amount) {
  const data = await fetchCart(
    `${API_BASE_URL}/api/v1/cart/items/${partId}`,
    { method: "PATCH", body: JSON.stringify({ amount }) }
  );
  return mapCartDetail(data);
}

/** DELETE /api/v1/cart/items/{part_id} */
export async function removeCartItem(partId) {
  const data = await fetchCart(
    `${API_BASE_URL}/api/v1/cart/items/${partId}`,
    { method: "DELETE" }
  );
  return mapCartDetail(data);
}

/** DELETE /api/v1/cart — vaciar. */
export async function clearCartApi() {
  const data = await fetchCart(`${API_BASE_URL}/api/v1/cart`, {
    method: "DELETE",
  });
  return mapCartDetail(data);
}

export async function getBrands() {
  const data = await fetchJson(
    `${API_BASE_URL}/api/v1/brands`,
    "No pudimos cargar las marcas."
  );

  return data.brands || [];
}

export async function getModels(brand) {
  const data = await fetchJson(
    `${API_BASE_URL}/api/v1/models?brand=${encodeURIComponent(brand)}`,
    "No pudimos cargar los modelos."
  );

  return data.models || [];
}

export async function getYears(brand, model) {
  const data = await fetchJson(
    `${API_BASE_URL}/api/v1/years?brand=${encodeURIComponent(
      brand
    )}&model=${encodeURIComponent(model)}`,
    "No pudimos cargar los años."
  );

  return data.years || [];
}


/* =====================================================
   DIRECCIONES
====================================================== */

const ADDRESS_STATUS_MESSAGES = {
  401: "Tu sesión venció. Iniciá sesión de nuevo.",
  403: "Esta acción requiere una cuenta de cliente.",
  404: "No encontramos esa dirección.",
  409: "Ya tenés guardada esa dirección.",
  422: "Revisá los datos de la dirección.",
};

function fetchAddresses(url, options = {}) {
  return fetchCustomerAccount(
    url,
    options,
    ADDRESS_STATUS_MESSAGES,
    "No pudimos actualizar las direcciones."
  );
}

/**
 * Un 422 de validación trae `detail` como lista de errores con el campo
 * en `loc` (ej: ["body", "holder"]). Devuelve { holder: "mensaje" }, para
 * mostrar cada error debajo de su campo.
 */
export function fieldsWithErrors(detail) {
  if (!Array.isArray(detail)) return {};
  const fields = {};
  for (const item of detail) {
    const field = item?.loc?.[0] === "body" ? item.loc[1] : null;
    if (field && !fields[field]) {
      fields[field] = String(item.msg ?? "").replace(/^Value error, /, "");
    }
  }
  return fields;
}

async function fetchCustomerAccount(url, options, messagesByStatus, messageGenerico) {
  const session = getSession();

  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
        ...(options.headers || {}),
      },
    });
  } catch {
    throw new Error("No pudimos conectar con el servidor.");
  }

  const data = response.status === 204 ? null : await readJson(response);

  if (!response.ok) {
    if (response.status === 401) notifyInvalidSession(session?.token);

    const details =
      data !== NO_JSON && typeof data?.detail === "string"
        ? data.detail
        : null;

    const error = new Error(
      details || messagesByStatus[response.status] || messageGenerico
    );
    error.status = response.status;
    error.fields = data !== NO_JSON ? fieldsWithErrors(data?.detail) : {};
    throw error;
  }

  if (data === NO_JSON) {
    throw new Error("No pudimos leer la respuesta del servidor.");
  }

  return data;
}

const FAVORITE_STATUS_MESSAGES = {
  ...ADDRESS_STATUS_MESSAGES,
  404: "No encontramos ese repuesto.",
};

function fetchFavorites(url, options = {}) {
  return fetchCustomerAccount(
    url,
    options,
    FAVORITE_STATUS_MESSAGES,
    "No pudimos actualizar tus favoritos."
  );
}

export async function getFavorites() {
  const errorMessage = "No pudimos cargar tus favoritos.";
  const data = await fetchFavorites(`${API_BASE_URL}/api/v1/favorites`);
  return listFrom(data, "parts", errorMessage).map(mapPart);
}

export async function addFavoriteApi(partId) {
  await fetchFavorites(`${API_BASE_URL}/api/v1/favorites/${partId}`, {
    method: "PUT",
  });
}

export async function removeFavoriteApi(partId) {
  await fetchFavorites(`${API_BASE_URL}/api/v1/favorites/${partId}`, {
    method: "DELETE",
  });
}

/* =====================================================
   AVISOS DE STOCK
   «Avisame cuando haya» en los repuestos agotados.
====================================================== */

const STOCK_ALERT_STATUS_MESSAGES = {
  401: "Tu sesión venció. Iniciá sesión de nuevo.",
  404: "No encontramos ese repuesto.",
};

function fetchStockAlerts(url, options = {}) {
  return fetchCustomerAccount(
    url,
    options,
    STOCK_ALERT_STATUS_MESSAGES,
    "No pudimos actualizar el aviso."
  );
}

/** GET /api/v1/stock-alerts — ids de los repuestos con aviso pedido. */
export async function getStockAlerts() {
  const data = await fetchStockAlerts(`${API_BASE_URL}/api/v1/stock-alerts`);
  return Array.isArray(data?.part_ids) ? data.part_ids : [];
}

export async function addStockAlert(partId) {
  await fetchStockAlerts(`${API_BASE_URL}/api/v1/stock-alerts/${partId}`, {
    method: "PUT",
  });
}

export async function removeStockAlert(partId) {
  await fetchStockAlerts(`${API_BASE_URL}/api/v1/stock-alerts/${partId}`, {
    method: "DELETE",
  });
}

function mapAddress(d) {
  return {
    id: d.shipping_address_id,
    displayName: d.personal_name,
    street: d.street,
    number: d.number,
    apartamento: d.apartment ?? "",
    city: d.city,
    department: d.department,
    codePostal: d.postal_code ?? "",
    primary: d.is_primary,
  };
}

/** GET /api/v1/addresses */
export async function getAddresses() {
  const data = await fetchAddresses(`${API_BASE_URL}/api/v1/addresses`);
  return data.map(mapAddress);
}

/** POST /api/v1/addresses */
export async function createAddress(f) {
  const data = await fetchAddresses(`${API_BASE_URL}/api/v1/addresses`, {
    method: "POST",
    body: JSON.stringify({
      personal_name: f.displayName,
      street: f.street,
      number: f.number,
      apartment: f.apartamento || null,
      city: f.city,
      department: f.department,
      postal_code: f.codePostal || null,
      is_primary: Boolean(f.primary),
    }),
  });
  return mapAddress(data);
}

/** PATCH /api/v1/addresses/{id}/primary */
export async function setPrimaryAddress(id) {
  const data = await fetchAddresses(
    `${API_BASE_URL}/api/v1/addresses/${id}/primary`,
    { method: "PATCH" }
  );
  return mapAddress(data);
}

/** DELETE /api/v1/addresses/{id} */
export async function deleteAddressApi(id) {
  await fetchAddresses(`${API_BASE_URL}/api/v1/addresses/${id}`, {
    method: "DELETE",
  });
}


/* =====================================================
   RECOMENDACIONES (HU 3.2)
   ===================================================== */

/**
 * GET /api/v1/recommendations?part_ids=<id>,<id>
 *
 * Pide repuestos complementarios para los repuestos del carrito
 * (HU 3.1, SCRUM-11). Devuelve los repuestos con el shape de la UI.
 *
 * Si el servicio falla o todavía no existe, devuelve una lista vacía:
 * las sugerencias son un extra y el carrito tiene que verse igual
 * aunque no carguen.
 *
 * @param {Array<number>} partIds - ids de los repuestos del carrito.
 * @returns {Promise<Array<object>>}
 */
export async function getRecommendations(partIds) {
  const ids = (partIds || []).filter((id) => id !== undefined && id !== null);

  if (ids.length === 0) return [];

  const errorMessage = "No pudimos cargar las sugerencias.";

  try {
    const data = await fetchJson(
      `${API_BASE_URL}/api/v1/recommendations?part_ids=${ids.join(",")}`,
      errorMessage
    );

    return listFrom(data, "parts", errorMessage).map(mapPart);
  } catch {
    return [];
  }
}

// Órdenes (HU 1.9 / 1.10)

// Si el backend manda `detail` (ej. el 409 dice qué repuesto no alcanza),
// pedirCuentaCliente usa ese mensaje; estos son solo el respaldo.
const ORDER_STATUS_MESSAGES = {
  400: "Tu carrito está vacío.",
  401: "Tu sesión venció. Iniciá sesión de nuevo.",
  403: "Esta acción requiere una cuenta de cliente.",
  409: "No hay stock suficiente para completar la compra.",
  422: "Revisá la dirección elegida.",
};

function mapOrder(p) {
  return {
    id: p.order_id,
    date: p.created_at,
    estado: p.status,
    shippingAddress: p.shipping_address ? mapAddress(p.shipping_address) : null,
    paymentMethod: p.payment_method ?? "",
    // "pending" | "approved" | "rejected"; null en los pedidos de antes de
    // Mercado Pago (ya cobrados).
    paymentStatus: p.payment_status ?? null,
    // Hasta cuándo se puede pagar; pasado el plazo el pedido se cancela solo.
    expiresPayment: p.payment_due_at ?? null,
    // El texto que escribió la tienda al cancelar (el tipo va en motivoCancelacion).
    detailCancellation: p.cancellation_reason ?? null,
    total: p.total ?? 0,
    // Los estados por los que pasó, del primero al actual. `fecha` es null
    // si no se sabe (pedidos de antes del seguimiento).
    tracking: (p.status_history || []).map((step) => ({
      estado: step.status,
      date: step.changed_at ?? null,
    })),
    // Solo en los cancelados: "expired" (venció sin pagarse) o "store"
    // (lo canceló la tienda); null si no se sabe.
    reasonCancellation: p.cancel_reason ?? null,
    items: (p.items || []).map((item) => ({
      partId: item.part_id,
      code: item.part_code ?? "",
      displayName: item.name ?? "",
      quantity: item.quantity,
      price: item.frozen_price,
    })),
  };
}

/**
 * POST /api/v1/orders — confirma la compra del carrito del cliente con la
 * dirección elegida (sin elegir, usa la principal). El pedido queda
 * pendiente de pago: se paga después en Mercado Pago (crearLinkPago).
 */
export async function confirmPurchase({ idAddress } = {}) {
  const data = await fetchCustomerAccount(
    `${API_BASE_URL}/api/v1/orders`,
    {
      method: "POST",
      body: JSON.stringify({
        shipping_address_id: idAddress ?? null,
      }),
    },
    ORDER_STATUS_MESSAGES,
    "No pudimos confirmar la compra."
  );
  return mapOrder(data);
}

/** GET /api/v1/orders — lista el historial de compras del cliente. */
export async function getPurchaseHistory() {
  const data = await fetchCustomerAccount(
    `${API_BASE_URL}/api/v1/orders`,
    {},
    ORDER_STATUS_MESSAGES,
    "No pudimos cargar tu historial de compras."
  );
  return listFrom(
    data,
    "orders",
    "No pudimos cargar tu historial de compras."
  ).map(mapOrder);
}

/** GET /api/v1/orders/{orderId} — trae el detalle de una compra. */
export async function getPurchaseDetail(orderId) {
  const data = await fetchCustomerAccount(
    `${API_BASE_URL}/api/v1/orders/${orderId}`,
    {},
    ORDER_STATUS_MESSAGES,
    "No pudimos cargar el detalle de la compra."
  );
  return mapOrder(data);
}

/**
 * POST /api/v1/orders/{orderId}/recibido — «Ya lo recibí»: el cliente
 * confirma que le llegó un pedido enviado. Devuelve el pedido entregado.
 */
export async function confirmReceipt(orderId) {
  const data = await fetchCustomerAccount(
    `${API_BASE_URL}/api/v1/orders/${orderId}/recibido`,
    { method: "POST" },
    {
      ...ORDER_STATUS_MESSAGES,
      404: "No encontramos ese pedido.",
      409: "Solo se puede confirmar la llegada de un pedido enviado.",
    },
    "No pudimos confirmar la llegada del pedido."
  );
  return mapOrder(data);
}

/* =====================================================
   PAGO CON MERCADO PAGO
   La tarjeta se carga en la página de Mercado Pago, nunca en la tienda.
====================================================== */

const PAYMENT_STATUS_MESSAGES = {
  401: "Tu sesión venció. Iniciá sesión de nuevo.",
  403: "Esta acción requiere una cuenta de cliente.",
  404: "No encontramos ese pedido.",
  409: "Este pedido ya está pagado.",
  503: "No pudimos conectar con Mercado Pago. Probá de nuevo en un rato.",
};

/**
 * POST /api/v1/pagos/{orderId} — link de Mercado Pago para pagar el pedido
 * (o reintentar un pago rechazado). Devuelve la dirección a la que ir.
 */
export async function createPaymentLink(orderId) {
  const data = await fetchCustomerAccount(
    `${API_BASE_URL}/api/v1/pagos/${orderId}`,
    { method: "POST" },
    PAYMENT_STATUS_MESSAGES,
    "No pudimos abrir Mercado Pago."
  );
  return data.url;
}

/**
 * POST /api/v1/pagos/{orderId}/verificar — al volver de Mercado Pago, le
 * pide al backend que confirme el pago (paymentId es el `payment_id` que
 * agrega Mercado Pago a la dirección). Devuelve el estado del pago.
 */
export async function verifyPayment(orderId, paymentId) {
  const data = await fetchCustomerAccount(
    `${API_BASE_URL}/api/v1/pagos/${orderId}/verificar`,
    { method: "POST", body: JSON.stringify({ payment_id: paymentId }) },
    PAYMENT_STATUS_MESSAGES,
    "No pudimos confirmar el pago."
  );
  return data.estado;
}

/* =====================================================
   ASISTENTE DE COMPRA (IA)
   POST /api/v1/asistente: el cliente cuenta qué le pasa al auto y recibe
   un diagnóstico y repuestos compatibles con su vehículo. Pide sesión.
====================================================== */

const ASSISTANT_STATUS_MESSAGES = {
  400: "No pudimos seguir esta conversación. Empezá una nueva.",
  401: "Tu sesión venció. Iniciá sesión de nuevo.",
  403: "El asistente es solo para clientes.",
  429: "Llegaste al límite de consultas al asistente por hoy. Probá de nuevo mañana.",
  503: "El asistente no está disponible en este momento. Probá buscando el repuesto en el catálogo.",
};

/**
 * Un mensaje a Pit. Para seguir la conversación se mandan el `historial` y
 * la `firma` que devolvió la respuesta anterior, tal cual: el backend los
 * firmó y rechaza cualquier cambio (400).
 */
export async function askAssistant({ texto, marca, modelo, anio, historial = [], firma = null }) {
  const requestBody = { texto, marca, modelo, anio: Number(anio) };
  if (historial.length > 0) {
    requestBody.historial = historial;
    requestBody.firma = firma;
  }

  const data = await fetchCustomerAccount(
    `${API_BASE_URL}/api/v1/asistente`,
    { method: "POST", body: JSON.stringify(requestBody) },
    ASSISTANT_STATUS_MESSAGES,
    "No pudimos consultar al asistente."
  );

  return {
    diagnostico: data.diagnostico ?? "",
    urgencia: data.urgencia ?? "baja",
    aviso: data.aviso ?? null,
    pregunta: data.pregunta ?? null,
    opciones: data.opciones ?? [],
    offTopic: Boolean(data.fuera_de_tema),
    recomendaciones: (data.recomendaciones || []).map((recomendacion) => ({
      tipo: recomendacion.tipo,
      motivo: recomendacion.motivo,
      repuestos: (recomendacion.repuestos || []).map(mapPart),
    })),
    historial: data.historial ?? [],
    firma: data.firma ?? null,
  };
}
