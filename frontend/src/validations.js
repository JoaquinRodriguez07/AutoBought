// Reglas de validación de los formularios. Mismas reglas y mensajes que
// backend/app/core/validators.py: el backend es el que decide, esto es
// para avisar antes de enviar.

import { PHONE_MESSAGE, normalizeUyPhone } from "./phone";

export const DEPARTMENTS = [
  "Artigas",
  "Canelones",
  "Cerro Largo",
  "Colonia",
  "Durazno",
  "Flores",
  "Florida",
  "Lavalleja",
  "Maldonado",
  "Montevideo",
  "Paysandú",
  "Río Negro",
  "Rivera",
  "Rocha",
  "Salto",
  "San José",
  "Soriano",
  "Tacuarembó",
  "Treinta y Tres",
];

const PERSON_NAME = /^\p{L}+(?:[ '’-]\p{L}+)*$/u;
const ALIAS = /^[\p{L}\d][\p{L}\d .,'’-]*$/u;
const STREET = /^[\p{L}\d][\p{L}\d .,'’\-º°/]*$/u;
const CITY = /^[\p{L}\d][\p{L}\d .'’-]*$/u;
const APARTMENT = /^[\p{L}\d][\p{L}\d .\-/]*$/u;
const DOOR_NUMBER = /^\d{1,5}(?: ?(?:bis|[a-z]))?$/i;
const NO_NUMBER = new Set(["s/n", "sn", "s/nº", "sin numero"]);
const POSTAL_CODE = /^\d{5}$/;
// Mismo criterio mínimo que EmailStr del backend: algo@dominio.tld
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const PASSWORD_MIN = 8;
const PASSWORD_MAX_BYTES = 72; // límite de bcrypt
export const NAME_MAX = 50;

const COMMON_PASSWORDS = new Set([
  "password1", "password123", "passw0rd", "contraseña1", "contrasena1",
  "qwerty123", "qwerty1", "abc12345", "abcd1234", "a1b2c3d4", "1q2w3e4r",
  "asdf1234", "admin123", "welcome1", "iloveyou1", "uruguay1", "uruguay123",
  "peñarol1", "penarol1", "nacional1", "autobought1",
]);

/** Saca espacios de los extremos y junta los repetidos. */
export function clean(valor) {
  return String(valor ?? "").replace(/\s+/g, " ").trim();
}

/** Minúsculas y sin tildes, para comparar textos. */
export function normalizeText(valor) {
  return String(valor ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function letterCount(valor) {
  return (valor.match(/\p{L}/gu) || []).length;
}

/* ----------------------------------------------------------- personas */

export function validatePersonName(valor, campo = "El nombre") {
  const limpio = clean(valor);
  if (!limpio) return `${campo} no puede estar vacío.`;
  if (!PERSON_NAME.test(limpio)) {
    return `${campo} solo puede tener letras, espacios, apóstrofos y guiones.`;
  }
  if (letterCount(limpio) < 2) return `${campo} tiene que tener al menos 2 letras.`;
  return null;
}

export function validateEmail(valor) {
  const limpio = clean(valor);
  if (!limpio) return "Ingresá tu correo electrónico.";
  if (!EMAIL.test(limpio)) return "Ingresá un correo electrónico válido.";
  return null;
}

export function validatePassword(password, email = "") {
  if (password.length < PASSWORD_MIN) {
    return `La contraseña tiene que tener al menos ${PASSWORD_MIN} caracteres.`;
  }
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
    return "La contraseña es demasiado larga.";
  }
  if (!/\p{L}/u.test(password) || !/\d/.test(password)) {
    return "La contraseña tiene que tener al menos una letra y un número.";
  }
  if (COMMON_PASSWORDS.has(normalizeText(password))) {
    return "Esa contraseña es muy común. Elegí otra.";
  }
  const usuario = normalizeText(String(email).split("@")[0]);
  if (usuario.length >= 3 && normalizeText(password).includes(usuario)) {
    return "La contraseña no puede contener tu correo.";
  }
  return null;
}

/** Devuelve un objeto { campo: mensaje } solo con los campos que fallan. */
function onlyErrors(errores) {
  return Object.fromEntries(Object.entries(errores).filter(([, msg]) => msg));
}

export function validateRegistration(f) {
  let confirmar = null;
  if (!f.confirmarPassword) confirmar = "Repetí la contraseña.";
  else if (f.password !== f.confirmarPassword) confirmar = "Las contraseñas no coinciden.";

  return onlyErrors({
    nombre: validatePersonName(f.nombre),
    apellido: validatePersonName(f.apellido, "El apellido"),
    email: validateEmail(f.email),
    telefono: !clean(f.telefono)
      ? "Ingresá tu teléfono."
      : normalizeUyPhone(f.telefono) ? null : PHONE_MESSAGE,
    password: validatePassword(f.password, f.email),
    confirmarPassword: confirmar,
    terminos: f.aceptaTerminos ? null : "Tenés que aceptar los términos y condiciones.",
  });
}

export function validatePasswordChange({ actual, nueva, repetir }, email = "") {
  let errorNueva = validatePassword(nueva, email);
  if (!errorNueva && nueva === actual) {
    errorNueva = "La nueva contraseña tiene que ser distinta de la actual.";
  }
  return onlyErrors({
    actual: actual ? null : "Ingresá tu contraseña actual.",
    nueva: errorNueva,
    repetir: nueva === repetir ? null : "Las contraseñas no coinciden.",
  });
}

export function validateNewPassword({ nueva, repetir }) {
  return onlyErrors({
    nueva: validatePassword(nueva),
    repetir: nueva === repetir ? null : "Las contraseñas no coinciden.",
  });
}

/* ----------------------------------------------------------- direcciones */

export function validateAddress(f) {
  const nombre = clean(f.nombre);
  const calle = clean(f.calle);
  const numero = clean(f.numero);
  const apartamento = clean(f.apartamento);
  const ciudad = clean(f.ciudad);
  const codigoPostal = clean(f.codigoPostal);

  let errorNumero = null;
  if (!numero) errorNumero = "El número de puerta no puede estar vacío.";
  else if (!NO_NUMBER.has(normalizeText(numero)) && !DOOR_NUMBER.test(numero)) {
    errorNumero = "Ingresá un número de puerta válido (ej: 1234, 1234B, 1234 bis o S/N).";
  }

  let errorDepartamento = null;
  if (!f.departamento) errorDepartamento = "Seleccioná un departamento.";
  else {
    const otro = DEPARTMENTS.find(
      (d) => d !== f.departamento && normalizeText(d) === normalizeText(ciudad)
    );
    if (otro) errorDepartamento = `${ciudad} no está en el departamento de ${f.departamento}.`;
  }

  return onlyErrors({
    nombre: !nombre
      ? "Poné un nombre para la dirección (ej: Casa)."
      : ALIAS.test(nombre) && letterCount(nombre) >= 2
        ? null
        : "El nombre de la dirección tiene que tener letras (ej: Casa, Trabajo).",
    calle: !calle
      ? "La calle no puede estar vacía."
      : STREET.test(calle) && letterCount(calle) >= 2
        ? null
        : "Ingresá un nombre de calle válido (ej: Av. Italia, 18 de Julio).",
    numero: errorNumero,
    apartamento: !apartamento || APARTMENT.test(apartamento)
      ? null
      : "Ingresá un apartamento válido (ej: 101, 3B, Torre 2 - 504).",
    ciudad: !ciudad
      ? "La ciudad no puede estar vacía."
      : CITY.test(ciudad) && letterCount(ciudad) >= 2
        ? null
        : "Ingresá un nombre de ciudad válido.",
    departamento: errorDepartamento,
    codigoPostal: !codigoPostal || POSTAL_CODE.test(codigoPostal)
      ? null
      : "El código postal tiene que tener 5 dígitos.",
  });
}
