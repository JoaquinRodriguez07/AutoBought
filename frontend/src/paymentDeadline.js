/**
 * Hasta cuándo se puede pagar un pedido, para completar frases como
 * "Pagalo antes de ___" o "reservados hasta ___": "las 22:45" si es hoy,
 * "el 30/10 a las 00:15" si no. Vacío si no hay plazo (pedidos viejos).
 * El plazo lo decide el backend (MINUTOS_PARA_PAGAR).
 */
export function paymentDeadlineText(date, now = new Date()) {
  if (!date) return "";
  const expires = new Date(date);
  const hora = expires.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  if (expires.toDateString() === now.toDateString()) return `las ${hora}`;
  const day = expires.toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit" });
  return `el ${day} a las ${hora}`;
}

/**
 * "Pagalo antes de las 22:45" o "Pagalo antes del 30/10 a las 00:15"
 * ("de" + "el" se contrae en "del"). Vacío si no hay plazo.
 */
export function payBefore(date, now = new Date()) {
  const deadline = paymentDeadlineText(date, now);
  if (!deadline) return "";
  return deadline.startsWith("el ") ? `Pagalo antes del ${deadline.slice(3)}` : `Pagalo antes de ${deadline}`;
}
