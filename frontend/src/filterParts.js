/**
 * filtrarRepuestos
 * ==========================================
 * Lógica de búsqueda, filtrado por categoría y orden del catálogo,
 * separada A PROPÓSITO de de dónde vienen los datos: esta función no
 * hace fetch ni importa nada, quien la llama le pasa el array que tenga
 * en ese momento.
 *
 * Hoy ese array viene del backend (`GET /api/v1/parts`) y llega YA
 * traducido al shape de la UI por `mapearRepuesto.js`, que es el único
 * lugar de la app que conoce el contrato de la API. El mock local
 * `productos.js` fue eliminado en esa migración. El filtro por categoría
 * también lo resuelve el backend (`?categoria=`), así que la rama
 * `else if (categoria)` de abajo ya no se usa; se deja porque la función
 * sigue siendo válida sobre cualquier array (por ejemplo el del
 * localStorage).
 *
 * Los getters de abajo además toleran el shape crudo del backend
 * (`name`, `category`, ...). Hoy ningún llamador le pasa esa forma
 * -la traducción ocurre en el borde del fetch-, así que esa rama es
 * puramente defensiva y NO es el camino previsto: si aparece una
 * pantalla nueva, tiene que seguir pasando por `mapearRepuesto`.
 *
 *   Shape de la UI (mapearRepuesto)  →  PartOut (backend)
 *   ----------------------------------------------------
 *   nombre                           →  name
 *   fabricante                       →  manufacturer
 *   codigo                           →  part_code
 *   categoria                        →  category
 *   precio                           →  price
 *   marca (string)                   →  compatible_brands (string[])
 *
 * INVARIANTE, NO DESHACER: `marca` NO es "la marca principal". Contiene
 * TODAS las marcas compatibles unidas por espacios (ver mapearRepuesto.js),
 * y `getMarca` depende de eso para que la búsqueda por texto encuentre
 * un repuesto por CUALQUIERA de sus marcas; en el catálogo actual hay 21
 * repuestos compatibles con más de una. Si alguien "ordena" el mapper
 * para que `marca` sea `compatible_brands[0]`, esas marcas dejan de ser
 * buscables y nada falla a la vista. Para MOSTRAR una sola marca existe
 * `marcaPrincipal`.
 */

const getName = (p) => p.displayName ?? p.name ?? "";
const getCode = (p) => p.code ?? p.part_code ?? "";
const getManufacturer = (p) => p.fabricante ?? p.manufacturer ?? "";
const getCategory = (p) => p.categoria ?? p.category ?? "";
const getPrice = (p) => p.price ?? p.price ?? 0;
const getBrand = (p) =>
  p.marca ??
  (Array.isArray(p.compatible_brands) ? p.compatible_brands.join(" ") : "");
const getBrandList = (p) => p.brands ?? p.compatible_brands ?? [];
const getModelList = (p) => (p.models ?? p.compatible_models ?? []).join(" ");
const getStock = (p) => p.stock ?? 0;

// Minúsculas y sin tildes: "bujia" encuentra "Bujía".
const normalizeText = (texto) =>
  texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// Un precio vacío ("" o null) es "sin límite".
const limit = (rawValue) =>
  rawValue === "" || rawValue === null || rawValue === undefined ? null : Number(rawValue);

// Cada filtro, por separado. `filterParts` los aplica todos;
// `facetCounts` los aplica todos MENOS el del grupo que está contando.
function applyFilters(
  products,
  { categoria, search = "", manufacturers = [], brandsCar = [], priceMin, priceMax, onlyWithStock = false } = {},
  skip = null
) {
  let list = Array.isArray(products) ? products : [];

  const palabras = normalizeText(search).split(/\s+/).filter(Boolean);

  if (palabras.length > 0) {
    // Búsqueda por texto: cada palabra tiene que aparecer en el nombre,
    // código, fabricante, marcas o modelos compatibles o categoría, en
    // cualquier orden ("pastillas onix" encuentra las pastillas que son
    // para el Onix: el auto no está en el nombre, está en los modelos).
    // Coincidencia parcial: no hace falta el código completo.
    list = list.filter((p) => {
      const texto = normalizeText(
        `${getName(p)} ${getCode(p)} ${getManufacturer(p)} ${getBrand(p)} ${getModelList(p)} ${getCategory(p)}`
      );
      return palabras.every((palabra) => texto.includes(palabra));
    });
  } else if (categoria) {
    list = list.filter((p) => getCategory(p) === categoria);
  }

  if (skip !== "manufacturers" && manufacturers.length > 0) {
    list = list.filter((p) => manufacturers.includes(getManufacturer(p)));
  }

  if (skip !== "brandsCar" && brandsCar.length > 0) {
    list = list.filter((p) => getBrandList(p).some((m) => brandsCar.includes(m)));
  }

  const minimo = limit(priceMin);
  const maximo = limit(priceMax);
  if (minimo !== null) {
    list = list.filter((p) => getPrice(p) >= minimo);
  }
  if (maximo !== null) {
    list = list.filter((p) => getPrice(p) <= maximo);
  }

  if (skip !== "onlyWithStock" && onlyWithStock) {
    list = list.filter((p) => getStock(p) > 0);
  }

  return list;
}

/**
 * @param {Array<object>} productos - array de repuestos (mock o API).
 * @param {object} opciones
 * @param {string} [opciones.categoria] - categoría seleccionada en el sidebar.
 * @param {string} [opciones.search]  - texto ingresado en el SearchBar.
 * @param {string[]} [opciones.manufacturers] - fabricantes tildados; vacío = todos.
 * @param {string[]} [opciones.brandsCar] - marcas de auto tildadas; vacío = todas.
 * @param {number|string} [opciones.priceMin] - precio mínimo; vacío = sin límite.
 * @param {number|string} [opciones.priceMax] - precio máximo; vacío = sin límite.
 * @param {boolean} [opciones.onlyWithStock] - oculta los repuestos sin stock.
 * @param {string} [opciones.sort]     - "Menor precio" | "Mayor precio" | "Nombre A-Z" | "Más vendidos" | otro.
 * @param {string[]} [opciones.bestSellerIds] - con "Más vendidos": los ids del más vendido al menos.
 * @returns {Array<object>} nuevo array filtrado y ordenado (no muta el original).
 */
export function filterParts(products, options = {}) {
  const { sort } = options;
  const sortedList = [...applyFilters(products, options)];

  if (sort === "Menor precio") {
    sortedList.sort((a, b) => getPrice(a) - getPrice(b));
  }

  if (sort === "Mayor precio") {
    sortedList.sort((a, b) => getPrice(b) - getPrice(a));
  }

  if (sort === "Nombre A-Z") {
    sortedList.sort((a, b) => getName(a).localeCompare(getName(b), "es"));
  }

  // Primero los más vendidos, en su orden; después el resto, como estaba.
  if (sort === "Más vendidos") {
    const rank = new Map((options.bestSellerIds ?? []).map((id, index) => [String(id), index]));
    const position = (p) => rank.get(String(p.partId ?? p.id)) ?? Infinity;
    sortedList.sort((a, b) => position(a) - position(b));
  }

  return sortedList;
}

// Cuántos repuestos hay de cada valor ([nombre, cantidad]). Las opciones
// tildadas se incluyen aunque queden en 0, para poder destildarlas.
function countValues(list, values, selected) {
  const quantities = new Map(selected.map((s) => [s, 0]));
  for (const p of list) {
    for (const rawValue of values(p)) {
      quantities.set(rawValue, (quantities.get(rawValue) ?? 0) + 1);
    }
  }
  return [...quantities];
}

/**
 * Los números de cada opción del panel de filtros, como en las tiendas
 * grandes: cada grupo se cuenta con TODOS los demás filtros aplicados
 * menos el suyo. Así, dentro de un grupo se pueden sumar opciones
 * (Bosch o NGK) y cada número dice cuántos resultados quedarían al
 * tildarla. Una opción que no tiene nada no aparece (salvo que ya esté
 * tildada).
 *
 * @returns {{ manufacturers: Array<[string, number]>, brandsCar: Array<[string, number]>, withStock: number }}
 */
export function facetCounts(products, options = {}) {
  const { manufacturers = [], brandsCar = [] } = options;

  return {
    manufacturers: countValues(
      applyFilters(products, options, "manufacturers"),
      (p) => (getManufacturer(p) ? [getManufacturer(p)] : []),
      manufacturers
    ),
    brandsCar: countValues(
      applyFilters(products, options, "brandsCar"),
      getBrandList,
      brandsCar
    ),
    withStock: applyFilters(products, options, "onlyWithStock").filter((p) => getStock(p) > 0)
      .length,
  };
}
