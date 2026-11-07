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

const getName = (p) => p.nombre ?? p.name ?? "";
const getCode = (p) => p.codigo ?? p.part_code ?? "";
const getManufacturer = (p) => p.fabricante ?? p.manufacturer ?? "";
const getCategory = (p) => p.categoria ?? p.category ?? "";
const getPrice = (p) => p.precio ?? p.price ?? 0;
const getBrand = (p) =>
  p.marca ??
  (Array.isArray(p.compatible_brands) ? p.compatible_brands.join(" ") : "");
const getBrandList = (p) => p.marcas ?? p.compatible_brands ?? [];
const getModelList = (p) => (p.modelos ?? p.compatible_models ?? []).join(" ");
const getStock = (p) => p.stock ?? 0;

// Minúsculas y sin tildes: "bujia" encuentra "Bujía".
const normalizeText = (texto) =>
  texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// Un precio vacío ("" o null) es "sin límite".
const limite = (valor) =>
  valor === "" || valor === null || valor === undefined ? null : Number(valor);

/**
 * @param {Array<object>} productos - array de repuestos (mock o API).
 * @param {object} opciones
 * @param {string} [opciones.categoria] - categoría seleccionada en el sidebar.
 * @param {string} [opciones.busqueda]  - texto ingresado en el SearchBar.
 * @param {string[]} [opciones.fabricantes] - fabricantes tildados; vacío = todos.
 * @param {string[]} [opciones.marcasAuto] - marcas de auto tildadas; vacío = todas.
 * @param {number|string} [opciones.precioMin] - precio mínimo; vacío = sin límite.
 * @param {number|string} [opciones.precioMax] - precio máximo; vacío = sin límite.
 * @param {boolean} [opciones.soloConStock] - oculta los repuestos sin stock.
 * @param {string} [opciones.orden]     - "Menor precio" | "Mayor precio" | "Nombre A-Z" | otro.
 * @returns {Array<object>} nuevo array filtrado y ordenado (no muta el original).
 */
export function filterParts(
  productos,
  {
    categoria,
    busqueda = "",
    fabricantes = [],
    marcasAuto = [],
    precioMin,
    precioMax,
    soloConStock = false,
    orden,
  } = {}
) {
  let lista = Array.isArray(productos) ? productos : [];

  const palabras = normalizeText(busqueda).split(/\s+/).filter(Boolean);

  if (palabras.length > 0) {
    // Búsqueda por texto: cada palabra tiene que aparecer en el nombre,
    // código, fabricante, marcas o modelos compatibles o categoría, en
    // cualquier orden ("pastillas onix" encuentra las pastillas que son
    // para el Onix: el auto no está en el nombre, está en los modelos).
    // Coincidencia parcial: no hace falta el código completo.
    lista = lista.filter((p) => {
      const texto = normalizeText(
        `${getName(p)} ${getCode(p)} ${getManufacturer(p)} ${getBrand(p)} ${getModelList(p)} ${getCategory(p)}`
      );
      return palabras.every((palabra) => texto.includes(palabra));
    });
  } else if (categoria) {
    lista = lista.filter((p) => getCategory(p) === categoria);
  }

  if (fabricantes.length > 0) {
    lista = lista.filter((p) => fabricantes.includes(getManufacturer(p)));
  }

  if (marcasAuto.length > 0) {
    lista = lista.filter((p) => getBrandList(p).some((m) => marcasAuto.includes(m)));
  }

  const minimo = limite(precioMin);
  const maximo = limite(precioMax);
  if (minimo !== null) {
    lista = lista.filter((p) => getPrice(p) >= minimo);
  }
  if (maximo !== null) {
    lista = lista.filter((p) => getPrice(p) <= maximo);
  }

  if (soloConStock) {
    lista = lista.filter((p) => getStock(p) > 0);
  }

  const listaOrdenada = [...lista];

  if (orden === "Menor precio") {
    listaOrdenada.sort((a, b) => getPrice(a) - getPrice(b));
  }

  if (orden === "Mayor precio") {
    listaOrdenada.sort((a, b) => getPrice(b) - getPrice(a));
  }

  if (orden === "Nombre A-Z") {
    listaOrdenada.sort((a, b) => getName(a).localeCompare(getName(b), "es"));
  }

  return listaOrdenada;
}
