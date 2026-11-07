// La dirección legible de un repuesto (/repuesto/123-nombre) y cómo sacarle el id.

export function slugifyProduct(displayName, id) {
  const nameSlug = String(displayName ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const idEstable = String(id ?? "").trim();

  if (!/^\d+$/.test(idEstable)) return null;
  return `${nameSlug || "repuesto"}-${idEstable}`;
}

export function extractProductId(slug) {
  const rawValue = String(slug ?? "");
  const coincidencia = rawValue.match(/(?:^|-)(\d+)$/);
  return coincidencia?.[1] ?? null;
}
