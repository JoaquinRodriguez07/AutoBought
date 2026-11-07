/**
 * Hasta cuándo se puede pagar un pedido, para completar frases como
 * "Pagalo antes de ___" o "reservados hasta ___": "las 22:45" si es hoy,
 * "el 30/10 a las 00:15" si no. Vacío si no hay plazo (pedidos viejos).
 * El plazo lo decide el backend (MINUTOS_PARA_PAGAR).
 */
export function paymentDeadlineText(fecha, ahora = new Date()) {
  if (!fecha) return "";
  const vence = new Date(fecha);
  const hora = vence.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  if (vence.toDateString() === ahora.toDateString()) return `las ${hora}`;
  const dia = vence.toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit" });
  return `el ${dia} a las ${hora}`;
}

/**
 * "Pagalo antes de las 22:45" o "Pagalo antes del 30/10 a las 00:15"
 * ("de" + "el" se contrae en "del"). Vacío si no hay plazo.
 */
export function payBefore(fecha, ahora = new Date()) {
  const plazo = paymentDeadlineText(fecha, ahora);
  if (!plazo) return "";
  return plazo.startsWith("el ") ? `Pagalo antes del ${plazo.slice(3)}` : `Pagalo antes de ${plazo}`;
}
