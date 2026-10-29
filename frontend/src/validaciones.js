// Reglas de validación de los formularios. Mismas reglas y mensajes que
// backend/app/core/validators.py: el backend es el que decide, esto es
// para avisar antes de enviar.

import { MENSAJE_TELEFONO, normalizarTelefonoUY } from "./telefono";

export const DEPARTAMENTOS = [
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

const NOMBRE_PERSONA = /^\p{L}+(?:[ '’-]\p{L}+)*$/u;
const ALIAS = /^[\p{L}\d][\p{L}\d .,'’-]*$/u;
const CALLE = /^[\p{L}\d][\p{L}\d .,'’\-º°/]*$/u;
const CIUDAD = /^[\p{L}\d][\p{L}\d .'’-]*$/u;
const APARTAMENTO = /^[\p{L}\d][\p{L}\d .\-/]*$/u;
const NUMERO_PUERTA = /^\d{1,5}(?: ?(?:bis|[a-z]))?$/i;
const SIN_NUMERO = new Set(["s/n", "sn", "s/nº", "sin numero"]);
const CODIGO_POSTAL = /^\d{5}$/;
// Mismo criterio mínimo que EmailStr del backend: algo@dominio.tld
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const PASSWORD_MIN = 8;
const PASSWORD_MAX_BYTES = 72; // límite de bcrypt
export const NOMBRE_MAX = 50;

const PASSWORDS_COMUNES = new Set([
  "password1", "password123", "passw0rd", "contraseña1", "contrasena1",
  "qwerty123", "qwerty1", "abc12345", "abcd1234", "a1b2c3d4", "1q2w3e4r",
  "asdf1234", "admin123", "welcome1", "iloveyou1", "uruguay1", "uruguay123",
  "peñarol1", "penarol1", "nacional1", "autobought1",
]);

/** Saca espacios de los extremos y junta los repetidos. */
export function limpiar(valor) {
  return String(valor ?? "").replace(/\s+/g, " ").trim();
}

/** Minúsculas y sin tildes, para comparar textos. */
export function normalizar(valor) {
  return String(valor ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function cantidadLetras(valor) {
  return (valor.match(/\p{L}/gu) || []).length;
}

/* ----------------------------------------------------------- personas */

export function validarNombrePersona(valor, campo = "El nombre") {
  const limpio = limpiar(valor);
  if (!limpio) return `${campo} no puede estar vacío.`;
  if (!NOMBRE_PERSONA.test(limpio)) {
    return `${campo} solo puede tener letras, espacios, apóstrofos y guiones.`;
  }
  if (cantidadLetras(limpio) < 2) return `${campo} tiene que tener al menos 2 letras.`;
  return null;
}

export function validarEmail(valor) {
  const limpio = limpiar(valor);
  if (!limpio) return "Ingresá tu correo electrónico.";
  if (!EMAIL.test(limpio)) return "Ingresá un correo electrónico válido.";
  return null;
}

export function validarPassword(password, email = "") {
  if (password.length < PASSWORD_MIN) {
    return `La contraseña tiene que tener al menos ${PASSWORD_MIN} caracteres.`;
  }
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
    return "La contraseña es demasiado larga.";
  }
  if (!/\p{L}/u.test(password) || !/\d/.test(password)) {
    return "La contraseña tiene que tener al menos una letra y un número.";
  }
  if (PASSWORDS_COMUNES.has(normalizar(password))) {
    return "Esa contraseña es muy común. Elegí otra.";
  }
  const usuario = normalizar(String(email).split("@")[0]);
  if (usuario.length >= 3 && normalizar(password).includes(usuario)) {
    return "La contraseña no puede contener tu correo.";
  }
  return null;
}

/** Devuelve un objeto { campo: mensaje } solo con los campos que fallan. */
function soloErrores(errores) {
  return Object.fromEntries(Object.entries(errores).filter(([, msg]) => msg));
}

export function validarRegistro(f) {
  let confirmar = null;
  if (!f.confirmarPassword) confirmar = "Repetí la contraseña.";
  else if (f.password !== f.confirmarPassword) confirmar = "Las contraseñas no coinciden.";

  return soloErrores({
    nombre: validarNombrePersona(f.nombre),
    apellido: validarNombrePersona(f.apellido, "El apellido"),
    email: validarEmail(f.email),
    telefono: !limpiar(f.telefono)
      ? "Ingresá tu teléfono."
      : normalizarTelefonoUY(f.telefono) ? null : MENSAJE_TELEFONO,
    password: validarPassword(f.password, f.email),
    confirmarPassword: confirmar,
    terminos: f.aceptaTerminos ? null : "Tenés que aceptar los términos y condiciones.",
  });
}

export function validarCambioPassword({ actual, nueva, repetir }, email = "") {
  let errorNueva = validarPassword(nueva, email);
  if (!errorNueva && nueva === actual) {
    errorNueva = "La nueva contraseña tiene que ser distinta de la actual.";
  }
  return soloErrores({
    actual: actual ? null : "Ingresá tu contraseña actual.",
    nueva: errorNueva,
    repetir: nueva === repetir ? null : "Las contraseñas no coinciden.",
  });
}

export function validarPasswordNueva({ nueva, repetir }) {
  return soloErrores({
    nueva: validarPassword(nueva),
    repetir: nueva === repetir ? null : "Las contraseñas no coinciden.",
  });
}

/* ----------------------------------------------------------- direcciones */

export function validarDireccion(f) {
  const nombre = limpiar(f.nombre);
  const calle = limpiar(f.calle);
  const numero = limpiar(f.numero);
  const apartamento = limpiar(f.apartamento);
  const ciudad = limpiar(f.ciudad);
  const codigoPostal = limpiar(f.codigoPostal);

  let errorNumero = null;
  if (!numero) errorNumero = "El número de puerta no puede estar vacío.";
  else if (!SIN_NUMERO.has(normalizar(numero)) && !NUMERO_PUERTA.test(numero)) {
    errorNumero = "Ingresá un número de puerta válido (ej: 1234, 1234B, 1234 bis o S/N).";
  }

  let errorDepartamento = null;
  if (!f.departamento) errorDepartamento = "Seleccioná un departamento.";
  else {
    const otro = DEPARTAMENTOS.find(
      (d) => d !== f.departamento && normalizar(d) === normalizar(ciudad)
    );
    if (otro) errorDepartamento = `${ciudad} no está en el departamento de ${f.departamento}.`;
  }

  return soloErrores({
    nombre: !nombre
      ? "Poné un nombre para la dirección (ej: Casa)."
      : ALIAS.test(nombre) && cantidadLetras(nombre) >= 2
        ? null
        : "El nombre de la dirección tiene que tener letras (ej: Casa, Trabajo).",
    calle: !calle
      ? "La calle no puede estar vacía."
      : CALLE.test(calle) && cantidadLetras(calle) >= 2
        ? null
        : "Ingresá un nombre de calle válido (ej: Av. Italia, 18 de Julio).",
    numero: errorNumero,
    apartamento: !apartamento || APARTAMENTO.test(apartamento)
      ? null
      : "Ingresá un apartamento válido (ej: 101, 3B, Torre 2 - 504).",
    ciudad: !ciudad
      ? "La ciudad no puede estar vacía."
      : CIUDAD.test(ciudad) && cantidadLetras(ciudad) >= 2
        ? null
        : "Ingresá un nombre de ciudad válido.",
    departamento: errorDepartamento,
    codigoPostal: !codigoPostal || CODIGO_POSTAL.test(codigoPostal)
      ? null
      : "El código postal tiene que tener 5 dígitos.",
  });
}
