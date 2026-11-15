// Períodos del filtro del dashboard, en meses calendario.
export const PERIODS = [3, 6, 12];
export const DEFAULT_PERIOD = 12;

// Números y fechas como se escriben en Uruguay: 1.234 y $ 1.234.

const number = new Intl.NumberFormat("es-UY", { maximumFractionDigits: 1 });

export const formatNumber = (rawValue) => number.format(rawValue ?? 0);

export const formatPesos = (rawValue) => `$ ${new Intl.NumberFormat("es-UY").format(Math.round(rawValue ?? 0))}`;

// "2026-03" -> "mar. 2026" (corto, para el eje) o "marzo de 2026".
export function formatMonth(month, { long = false } = {}) {
  const [anio, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(anio, monthNumber - 1, 15));
  return new Intl.DateTimeFormat("es-UY", {
    month: long ? "long" : "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatDays(days) {
  if (days === null || days === undefined) return "Sin demanda proyectada";
  return days === 1 ? "1 día" : `${formatNumber(days)} días`;
}

export const RISKS = {
  high: { label: "Riesgo alto", corta: "Alto" },
  medium: { label: "Riesgo medio", corta: "Medio" },
  low: { label: "Riesgo bajo", corta: "Bajo" },
};

// Stock con su estado escrito: "Sin stock", "Stock bajo" o "Normal".
export function stockStatus(stock, stockLow) {
  if (stock <= 0) return "Sin stock";
  return stockLow ? "Stock bajo" : "Normal";
}

// Diferencia contra el mes anterior, para ver un aumento o una caída.
export function change(current, previous) {
  if (previous === undefined || previous === null) return null;
  const diferencia = current - previous;
  const percentage = previous > 0 ? Math.round((diferencia / previous) * 100) : null;
  return { diferencia, percentage };
}
