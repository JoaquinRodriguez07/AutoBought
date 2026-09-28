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

const getNombre = (p) => p.nombre ?? p.name ?? "";
const getCodigo = (p) => p.codigo ?? p.part_code ?? "";
const getCategoria = (p) => p.categoria ?? p.category ?? "";
const getPrecio = (p) => p.precio ?? p.price ?? 0;
const getMarca = (p) =>
  p.marca ??
  (Array.isArray(p.compatible_brands) ? p.compatible_brands.join(" ") : "");

/**
 * @param {Array<object>} productos - array de repuestos (mock o API).
 * @param {object} opciones
 * @param {string} [opciones.categoria] - categoría seleccionada en el sidebar.
 * @param {string} [opciones.busqueda]  - texto ingresado en el SearchBar.
 * @param {string} [opciones.orden]     - "Menor precio" | "Mayor precio" | otro.
 * @returns {Array<object>} nuevo array filtrado y ordenado (no muta el original).
 */
export function filtrarRepuestos(
  productos,
  { categoria, busqueda = "", orden } = {}
) {
  let lista = Array.isArray(productos) ? productos : [];

  const termino = busqueda.trim().toLowerCase();

  if (termino) {
    // Búsqueda por texto: coincide con nombre o código (igual que el
    // ILIKE del backend), y de yapa marca/categoría para mejor UX.
    // Coincidencia parcial: no hace falta el código completo.
    lista = lista.filter((p) =>
      `${getNombre(p)} ${getCodigo(p)} ${getMarca(p)} ${getCategoria(p)}`
        .toLowerCase()
        .includes(termino)
    );
  } else if (categoria) {
    lista = lista.filter((p) => getCategoria(p) === categoria);
  }

  const listaOrdenada = [...lista];

  if (orden === "Menor precio") {
    listaOrdenada.sort((a, b) => getPrecio(a) - getPrecio(b));
  }

  if (orden === "Mayor precio") {
    listaOrdenada.sort((a, b) => getPrecio(b) - getPrecio(a));
  }

  return listaOrdenada;
}
