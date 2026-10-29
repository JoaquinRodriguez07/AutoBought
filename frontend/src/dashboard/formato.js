// Períodos del filtro del dashboard, en meses calendario.
export const PERIODOS = [3, 6, 12];
export const PERIODO_POR_DEFECTO = 12;

// Números y fechas como se escriben en Uruguay: 1.234 y $ 1.234.

const numero = new Intl.NumberFormat("es-UY", { maximumFractionDigits: 1 });

export const formatearNumero = (valor) => numero.format(valor ?? 0);

export const formatearPesos = (valor) => `$ ${new Intl.NumberFormat("es-UY").format(Math.round(valor ?? 0))}`;

// "2026-03" -> "mar. 2026" (corto, para el eje) o "marzo de 2026".
export function formatearMes(mes, { largo = false } = {}) {
  const [anio, numeroMes] = mes.split("-").map(Number);
  const fecha = new Date(Date.UTC(anio, numeroMes - 1, 15));
  return new Intl.DateTimeFormat("es-UY", {
    month: largo ? "long" : "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(fecha);
}

export function formatearDias(dias) {
  if (dias === null || dias === undefined) return "Sin demanda proyectada";
  return dias === 1 ? "1 día" : `${formatearNumero(dias)} días`;
}

export const RIESGOS = {
  high: { etiqueta: "Riesgo alto", corta: "Alto" },
  medium: { etiqueta: "Riesgo medio", corta: "Medio" },
  low: { etiqueta: "Riesgo bajo", corta: "Bajo" },
};

// Stock con su estado escrito: "Sin stock", "Stock bajo" o "Normal".
export function estadoStock(stock, stockBajo) {
  if (stock <= 0) return "Sin stock";
  return stockBajo ? "Stock bajo" : "Normal";
}

// Diferencia contra el mes anterior, para ver un aumento o una caída.
export function variacion(actual, anterior) {
  if (anterior === undefined || anterior === null) return null;
  const diferencia = actual - anterior;
  const porcentaje = anterior > 0 ? Math.round((diferencia / anterior) * 100) : null;
  return { diferencia, porcentaje };
}
