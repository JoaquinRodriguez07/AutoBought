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

export const normalizeText = (valor) =>
  valor?.trim().replace(/\s+/g, " ").toLocaleLowerCase("es") || "";

/** Las compatibilidades del repuesto, estructuradas o como texto. */
export function compatibilitiesOf(producto) {
  const estructuradas = Array.isArray(producto?.compatibilidades) ? producto.compatibilidades : [];
  if (estructuradas.length) return estructuradas.map((item) => ({ ...item, formatoTexto: false }));

  const aplicacionesTexto = Array.isArray(producto?.aplicaciones)
    ? producto.aplicaciones.filter((item) => typeof item === "string" && item.trim())
    : [];
  return aplicacionesTexto.map((texto) => ({ texto: texto.trim(), formatoTexto: true }));
}

/**
 * `true` si es compatible con el vehículo, `false` si no lo es y `null`
 * si no se puede saber (sin vehículo, sin compatibilidades o con datos
 * incompletos).
 */
export function isCompatible(compatibilidades, vehiculo) {
  const marcaSeleccionada = normalizeText(vehiculo?.brand);
  if (!marcaSeleccionada || compatibilidades.length === 0) return null;

  const modeloSeleccionado = normalizeText(vehiculo?.model);
  const anioSeleccionado = vehiculo?.year ? Number(vehiculo.year) : null;
  let hayDatosInsuficientes = false;

  for (const compatibilidad of compatibilidades) {
    if (compatibilidad.formatoTexto) {
      const aplicacion = normalizeText(compatibilidad.texto);
      if (!aplicacion.includes(marcaSeleccionada)) continue;
      if (!modeloSeleccionado) return true;
      if (!aplicacion.includes(modeloSeleccionado)) continue;
      if (!anioSeleccionado) return true;

      // En aplicaciones textuales solo afirmamos compatibilidad por año
      // si el año seleccionado aparece explícitamente en la aplicación.
      const aniosExplicitos = aplicacion.match(/\b(?:19|20)\d{2}\b/g) || [];
      if (aniosExplicitos.includes(String(anioSeleccionado))) return true;
      if (aniosExplicitos.length === 0) hayDatosInsuficientes = true;
      continue;
    }

    const marcaAplicacion = normalizeText(compatibilidad.brand);
    if (!marcaAplicacion) {
      hayDatosInsuficientes = true;
      continue;
    }
    if (marcaAplicacion !== marcaSeleccionada) continue;
    if (!modeloSeleccionado) return true;

    const modeloAplicacion = normalizeText(compatibilidad.model);
    if (!modeloAplicacion) {
      hayDatosInsuficientes = true;
      continue;
    }
    if (modeloAplicacion !== modeloSeleccionado) continue;
    if (!anioSeleccionado) return true;

    if (compatibilidad.year_from == null || compatibilidad.year_to == null) {
      hayDatosInsuficientes = true;
      continue;
    }
    const anioDesde = Number(compatibilidad.year_from);
    const anioHasta = Number(compatibilidad.year_to);
    if (!Number.isFinite(anioDesde) || !Number.isFinite(anioHasta) || anioDesde > anioHasta) {
      hayDatosInsuficientes = true;
      continue;
    }
    if (anioSeleccionado >= anioDesde && anioSeleccionado <= anioHasta) return true;
  }

  return hayDatosInsuficientes ? null : false;
}

/** Atajo: ¿este repuesto es compatible con el vehículo? (ver esCompatible) */
export const productIsCompatible = (producto, vehiculo) =>
  isCompatible(compatibilitiesOf(producto), vehiculo);
