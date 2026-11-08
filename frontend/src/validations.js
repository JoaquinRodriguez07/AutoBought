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
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

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
export function clean(rawValue) {
  return String(rawValue ?? "").replace(/\s+/g, " ").trim();
}

/** Minúsculas y sin tildes, para comparar textos. */
export function normalizeText(rawValue) {
  return String(rawValue ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function letterCount(rawValue) {
  return (rawValue.match(/\p{L}/gu) || []).length;
}

/* ----------------------------------------------------------- personas */

export function validatePersonName(rawValue, field = "El nombre") {
  const cleaned = clean(rawValue);
  if (!cleaned) return `${field} no puede estar vacío.`;
  if (!PERSON_NAME.test(cleaned)) {
    return `${field} solo puede tener letras, espacios, apóstrofos y guiones.`;
  }
  if (letterCount(cleaned) < 2) return `${field} tiene que tener al menos 2 letras.`;
  return null;
}

export function validateEmail(rawValue) {
  const cleaned = clean(rawValue);
  if (!cleaned) return "Ingresá tu correo electrónico.";
  if (!EMAIL_PATTERN.test(cleaned)) return "Ingresá un correo electrónico válido.";
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
  const sessionUser = normalizeText(String(email).split("@")[0]);
  if (sessionUser.length >= 3 && normalizeText(password).includes(sessionUser)) {
    return "La contraseña no puede contener tu correo.";
  }
  return null;
}

/** Devuelve un objeto { campo: mensaje } solo con los campos que fallan. */
function onlyErrors(errors) {
  return Object.fromEntries(Object.entries(errors).filter(([, msg]) => msg));
}

export function validateRegistration(f) {
  let confirm = null;
  if (!f.confirmPassword) confirm = "Repetí la contraseña.";
  else if (f.password !== f.confirmPassword) confirm = "Las contraseñas no coinciden.";

  return onlyErrors({
    displayName: validatePersonName(f.displayName),
    lastName: validatePersonName(f.lastName, "El apellido"),
    email: validateEmail(f.email),
    phone: !clean(f.phone)
      ? "Ingresá tu teléfono."
      : normalizeUyPhone(f.phone) ? null : PHONE_MESSAGE,
    password: validatePassword(f.password, f.email),
    confirmPassword: confirm,
    terms: f.acceptsTerms ? null : "Tenés que aceptar los términos y condiciones.",
  });
}

export function validatePasswordChange({ current, newPassword, repeat }, email = "") {
  let newError = validatePassword(newPassword, email);
  if (!newError && newPassword === current) {
    newError = "La nueva contraseña tiene que ser distinta de la actual.";
  }
  return onlyErrors({
    current: current ? null : "Ingresá tu contraseña actual.",
    newPassword: newError,
    repeat: newPassword === repeat ? null : "Las contraseñas no coinciden.",
  });
}

export function validateNewPassword({ newPassword, repeat }) {
  return onlyErrors({
    newPassword: validatePassword(newPassword),
    repeat: newPassword === repeat ? null : "Las contraseñas no coinciden.",
  });
}

/* ----------------------------------------------------------- direcciones */

export function validateAddress(f) {
  const displayName = clean(f.displayName);
  const street = clean(f.street);
  const number = clean(f.number);
  const apartamento = clean(f.apartamento);
  const city = clean(f.city);
  const codePostal = clean(f.codePostal);

  let numberError = null;
  if (!number) numberError = "El número de puerta no puede estar vacío.";
  else if (!NO_NUMBER.has(normalizeText(number)) && !DOOR_NUMBER.test(number)) {
    numberError = "Ingresá un número de puerta válido (ej: 1234, 1234B, 1234 bis o S/N).";
  }

  let departmentError = null;
  if (!f.department) departmentError = "Seleccioná un departamento.";
  else {
    const other = DEPARTMENTS.find(
      (d) => d !== f.department && normalizeText(d) === normalizeText(city)
    );
    if (other) departmentError = `${city} no está en el departamento de ${f.department}.`;
  }

  return onlyErrors({
    displayName: !displayName
      ? "Poné un nombre para la dirección (ej: Casa)."
      : ALIAS.test(displayName) && letterCount(displayName) >= 2
        ? null
        : "El nombre de la dirección tiene que tener letras (ej: Casa, Trabajo).",
    street: !street
      ? "La calle no puede estar vacía."
      : STREET.test(street) && letterCount(street) >= 2
        ? null
        : "Ingresá un nombre de calle válido (ej: Av. Italia, 18 de Julio).",
    number: numberError,
    apartamento: !apartamento || APARTMENT.test(apartamento)
      ? null
      : "Ingresá un apartamento válido (ej: 101, 3B, Torre 2 - 504).",
    city: !city
      ? "La ciudad no puede estar vacía."
      : CITY.test(city) && letterCount(city) >= 2
        ? null
        : "Ingresá un nombre de ciudad válido.",
    department: departmentError,
    codePostal: !codePostal || POSTAL_CODE.test(codePostal)
      ? null
      : "El código postal tiene que tener 5 dígitos.",
  });
}
