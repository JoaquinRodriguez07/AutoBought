const SESION_KEY = "autobought-sesion";

// Cuánto antes de que venza el token se pide uno nuevo. Con tokens de 60
// minutos, la renovación cae al minuto 55 de sesión.
export const MARGEN_RENOVACION_MS = 5 * 60 * 1000;

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

export function obtenerSesion() {
  try {
    const raw =
      localStorage.getItem(SESION_KEY) ||
      sessionStorage.getItem(SESION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function sesionValida(sesion) {
  if (!sesion) return false;

  // Sesiones sin JWT (ej. flujo de registro local, todavía no
  // conectado al backend) se consideran válidas mientras existan.
  if (!sesion.token) return true;

  const payload = decodeToken(sesion.token);
  if (!payload?.exp) return false;

  return payload.exp * 1000 > Date.now();
}

export function haySesionActiva() {
  return sesionValida(obtenerSesion());
}

/**
 * Guarda la sesión donde ya vive: localStorage si el cliente eligió
 * "Recordarme", sessionStorage si no. Así renovar el token no cambia la
 * persistencia que el cliente eligió al iniciar sesión.
 */
export function guardarSesion(sesion) {
  const storage = localStorage.getItem(SESION_KEY)
    ? localStorage
    : sessionStorage;

  storage.setItem(SESION_KEY, JSON.stringify(sesion));
}

/**
 * Milisegundos que faltan para pedir un token nuevo: el momento en que
 * al token actual le quedan `MARGEN_RENOVACION_MS` de vida. Devuelve 0 si
 * ese momento ya pasó (hay que renovar ya) y null si el token no tiene
 * `exp` legible (no hay nada que programar).
 */
export function msHastaRenovacion(token, ahora = Date.now()) {
  const payload = token ? decodeToken(token) : null;
  if (!payload?.exp) return null;

  return Math.max(0, payload.exp * 1000 - MARGEN_RENOVACION_MS - ahora);
}
