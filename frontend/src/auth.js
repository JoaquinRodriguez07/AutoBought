// La sesión guardada en el navegador y lo que dice su token.

const SESSION_KEY = "autobought-sesion";

// Cuánto antes de que venza el token se pide uno nuevo. Con tokens de 60
// minutos, la renovación cae al minuto 55 de sesión.
export const RENEWAL_MARGIN_MS = 5 * 60 * 1000;

export function decodeToken(token) {
  try {
    const payload = token.split(".")[1];
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const json = new TextDecoder("utf-8").decode(bytes);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function getSession() {
  try {
    const raw =
      localStorage.getItem(SESSION_KEY) ||
      sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function isSessionValid(sesion) {
  if (!sesion) return false;

  // Sesiones sin JWT (ej. flujo de registro local, todavía no
  // conectado al backend) se consideran válidas mientras existan.
  if (!sesion.token) return true;

  const payload = decodeToken(sesion.token);
  if (!payload?.exp) return false;

  return payload.exp * 1000 > Date.now();
}

// El JWT del login trae `user_type`: "client" (comprador) o "employee"
// (vendedor). Login.jsx lo guarda en `sesion.userType`.
export const SELLER_TYPE = "employee";

/**
 * true si la sesión es de un vendedor. Los vendedores no tienen perfil de
 * cliente, carrito ni favoritos: esos endpoints les responden 403, así que
 * la UI no tiene que pedirlos.
 */
export function isSeller(sesion) {
  return sesion?.userType === SELLER_TYPE;
}

/**
 * true si el vendedor es administrador (el token trae `admin`): ve la
 * sección "Equipo". La API lo vuelve a verificar en cada pedido.
 */
export function isAdmin(sesion) {
  if (!isSeller(sesion) || !sesion?.token) return false;
  return decodeToken(sesion.token)?.admin === true;
}

export function hasActiveSession() {
  return isSessionValid(getSession());
}

/**
 * Guarda la sesión donde ya vive: localStorage si el cliente eligió
 * "Recordarme", sessionStorage si no. Así renovar el token no cambia la
 * persistencia que el cliente eligió al iniciar sesión.
 */
export function saveSession(sesion) {
  const storage = localStorage.getItem(SESSION_KEY)
    ? localStorage
    : sessionStorage;

  storage.setItem(SESSION_KEY, JSON.stringify(sesion));
  window.dispatchEvent(new Event(SESSION_SAVED_EVENT));
}

// Aviso dentro de la pestaña de que la sesión guardada cambió. App.jsx lo
// usa para que su estado `usuario` siga a lo que guardó cualquier pantalla
// (ej: CambiarPassword guarda el token nuevo sin tener acceso a App).
const SESSION_SAVED_EVENT = "autobought-sesion-guardada";

/** Llama a `fn` cada vez que `guardarSesion` guarda. Devuelve cómo desregistrar. */
export function onSessionSaved(fn) {
  window.addEventListener(SESSION_SAVED_EVENT, fn);
  return () => window.removeEventListener(SESSION_SAVED_EVENT, fn);
}

/**
 * Milisegundos que faltan para pedir un token nuevo: el momento en que
 * al token actual le quedan `MARGEN_RENOVACION_MS` de vida. Devuelve 0 si
 * ese momento ya pasó (hay que renovar ya) y null si el token no tiene
 * `exp` legible (no hay nada que programar).
 */
export function msUntilRenewal(token, ahora = Date.now()) {
  const payload = token ? decodeToken(token) : null;
  if (!payload?.exp) return null;

  return Math.max(0, payload.exp * 1000 - RENEWAL_MARGIN_MS - ahora);
}
