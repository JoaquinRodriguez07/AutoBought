/**
 * Hasta cuándo se puede pagar un pedido, para completar frases como
 * "Pagalo antes de ___" o "reservados hasta ___": "las 22:45" si es hoy,
 * "el 30/10 a las 00:15" si no. Vacío si no hay plazo (pedidos viejos).
 * El plazo lo decide el backend (MINUTOS_PARA_PAGAR).
 */
export function textoPlazoPago(fecha, ahora = new Date()) {
  if (!fecha) return "";
  const vence = new Date(fecha);
  const hora = vence.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  if (vence.toDateString() === ahora.toDateString()) return `las ${hora}`;
  const dia = vence.toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit" });
  return `el ${dia} a las ${hora}`;
}
