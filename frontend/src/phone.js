// Teléfonos de Uruguay. Misma regla que backend/app/core/phone.py:
// celulares (09X XXX XXX) y fijos (2XXX XXXX Montevideo, 4XXX XXXX
// interior), con o sin +598, y con espacios, guiones, puntos o paréntesis.

export const PHONE_MESSAGE =
  "Ingresá un teléfono uruguayo válido (ej: 099 123 456).";

const NATIONAL = /^(9[1-9]\d{6}|[24]\d{7})$/;

/**
 * @param {string} raw - lo que escribió el usuario.
 * @returns {string|null} "+598XXXXXXXX", o null si no es válido.
 */
export function normalizeUyPhone(raw) {
  let digitos = String(raw ?? "").trim().replace(/[\s\-.()]/g, "");

  if (digitos.startsWith("+")) {
    digitos = digitos.slice(1);
    if (!digitos.startsWith("598")) return null;
    digitos = digitos.slice(3);
  } else if (digitos.startsWith("00598")) {
    digitos = digitos.slice(5);
  } else if (digitos.startsWith("598") && digitos.length === 11) {
    digitos = digitos.slice(3);
  }

  // El 0 inicial de los celulares (099...) no va en formato internacional.
  if (digitos.startsWith("0")) digitos = digitos.slice(1);

  return NATIONAL.test(digitos) ? `+598${digitos}` : null;
}

/**
 * Formato para mostrar: celular "099 123 456", fijo "2900 1234".
 * Si no es un número uruguayo normalizado, se devuelve tal cual.
 *
 * @param {string|null|undefined} valor - ej: "+59899123456".
 * @returns {string}
 */
export function formatUyPhone(rawValue) {
  if (!rawValue) return "";

  const normalizado = normalizeUyPhone(rawValue);
  if (!normalizado) return rawValue;

  const n = normalizado.slice(4);
  return n.startsWith("9")
    ? `0${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}`
    : `${n.slice(0, 4)} ${n.slice(4)}`;
}
