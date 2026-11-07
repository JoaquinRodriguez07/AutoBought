// Qué tan segura es una contraseña, para el indicador del registro. No
// reemplaza la validación (validarPassword): solo orienta mientras se escribe.
const NIVELES = [
  { texto: "Muy débil", color: "bg-red-500" },
  { texto: "Débil", color: "bg-orange-500" },
  { texto: "Aceptable", color: "bg-amber-400" },
  { texto: "Buena", color: "bg-lime-500" },
  { texto: "Muy buena", color: "bg-green-600" },
];

/** { puntos: 0 a 4, texto, color } o null si está vacía. */
export function fuerzaPassword(password) {
  if (!password) return null;
  let puntos = 0;
  if (password.length >= 8) puntos += 1;
  if (/[a-zA-Z]/.test(password) && /\d/.test(password)) puntos += 1;
  if (password.length >= 12) puntos += 1;
  if (/[^a-zA-Z0-9]/.test(password) || (/[a-z]/.test(password) && /[A-Z]/.test(password))) puntos += 1;
  // Sin el mínimo de 8 caracteres, nunca pasa de "Débil".
  if (password.length < 8) puntos = Math.min(puntos, 1);
  return { puntos, ...NIVELES[puntos] };
}
