export function slugificarProducto(nombre, id) {
  const nombreSlug = String(nombre ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const idEstable = String(id ?? "").trim();

  if (!/^\d+$/.test(idEstable)) return null;
  return `${nombreSlug || "repuesto"}-${idEstable}`;
}

export function extraerIdProducto(slug) {
  const valor = String(slug ?? "");
  const coincidencia = valor.match(/(?:^|-)(\d+)$/);
  return coincidencia?.[1] ?? null;
}
