/**
 * compatibilidad
 * ==========================================
 * Regla única para saber si un repuesto es compatible con el Vehículo
 * Activo. La usan la tarjeta de compatibilidad del detalle
 * (DetalleProducto) y "Suelen comprarse juntos", así las dos dicen lo
 * mismo.
 *
 * La API puede entregar compatibilidades estructuradas (`compatibilidades`)
 * o aplicaciones como texto (`aplicaciones`); acá se normalizan ambas.
 */

export const normalizeText = (rawValue) =>
  rawValue?.trim().replace(/\s+/g, " ").toLocaleLowerCase("es") || "";

/** Las compatibilidades del repuesto, estructuradas o como texto. */
export function compatibilitiesOf(product) {
  const structured = Array.isArray(product?.compatibilidades) ? product.compatibilidades : [];
  if (structured.length) return structured.map((item) => ({ ...item, formatText: false }));

  const fitmentsText = Array.isArray(product?.fitments)
    ? product.fitments.filter((item) => typeof item === "string" && item.trim())
    : [];
  return fitmentsText.map((texto) => ({ texto: texto.trim(), formatText: true }));
}

/**
 * `true` si es compatible con el vehículo, `false` si no lo es y `null`
 * si no se puede saber (sin vehículo, sin compatibilidades o con datos
 * incompletos).
 */
export function isCompatible(compatibilidades, vehicle) {
  const selectedBrand = normalizeText(vehicle?.brand);
  if (!selectedBrand || compatibilidades.length === 0) return null;

  const selectedModel = normalizeText(vehicle?.model);
  const selectedYear = vehicle?.year ? Number(vehicle.year) : null;
  let hasDataInsufficient = false;

  for (const compatibilidad of compatibilidades) {
    if (compatibilidad.formatText) {
      const fitment = normalizeText(compatibilidad.texto);
      if (!fitment.includes(selectedBrand)) continue;
      if (!selectedModel) return true;
      if (!fitment.includes(selectedModel)) continue;
      if (!selectedYear) return true;

      // En aplicaciones textuales solo afirmamos compatibilidad por año
      // si el año seleccionado aparece explícitamente en la aplicación.
      const yearsExplicit = fitment.match(/\b(?:19|20)\d{2}\b/g) || [];
      if (yearsExplicit.includes(String(selectedYear))) return true;
      if (yearsExplicit.length === 0) hasDataInsufficient = true;
      continue;
    }

    const brandFitment = normalizeText(compatibilidad.brand);
    if (!brandFitment) {
      hasDataInsufficient = true;
      continue;
    }
    if (brandFitment !== selectedBrand) continue;
    if (!selectedModel) return true;

    const modelFitment = normalizeText(compatibilidad.model);
    if (!modelFitment) {
      hasDataInsufficient = true;
      continue;
    }
    if (modelFitment !== selectedModel) continue;
    if (!selectedYear) return true;

    if (compatibilidad.year_from == null || compatibilidad.year_to == null) {
      hasDataInsufficient = true;
      continue;
    }
    const yearFrom = Number(compatibilidad.year_from);
    const yearUntil = Number(compatibilidad.year_to);
    if (!Number.isFinite(yearFrom) || !Number.isFinite(yearUntil) || yearFrom > yearUntil) {
      hasDataInsufficient = true;
      continue;
    }
    if (selectedYear >= yearFrom && selectedYear <= yearUntil) return true;
  }

  return hasDataInsufficient ? null : false;
}

/** Atajo: ¿este repuesto es compatible con el vehículo? (ver esCompatible) */
export const productIsCompatible = (product, vehicle) =>
  isCompatible(compatibilitiesOf(product), vehicle);
