/**
 * mapearRepuesto
 * ==========================================
 * Traduce la respuesta del backend (`PartOut` de `GET /api/v1/parts`)
 * al "shape" que ya consume la interfaz (el del mock original).
 *
 * Se mapea acá, en el borde del fetch, y NO en cada pantalla: las
 * tarjetas del catálogo, el carrito, favoritos y el detalle leen
 * `nombre/codigo/precio/marca/imagen` directo, sin tolerar dos shapes.
 * Manteniendo la traducción en un solo lugar, esas pantallas no se
 * tocan cuando cambia el contrato de la API.
 *
 *   PartOut (backend)            →  shape de la UI (mock)
 *   ----------------------------------------------------
 *   name                         →  nombre
 *   manufacturer                 →  fabricante
 *   part_code                    →  codigo
 *   category                     →  categoria
 *   price                        →  precio
 *   stock                        →  stock
 *   compatible_brands            →  marca + marcaPrincipal + marcas (ver abajo)
 *   compatible_models            →  modelos
 *   description                  →  descripcion
 *   specifications               →  especificaciones  ([nombre, valor])
 *   warranty_months +
 *   warranty_provider            →  garantia  (el texto que se muestra)
 *   compatibilities              →  aplicaciones  ("Chevrolet Onix 1.4 8V (2013–2019)")
 *   name                         →  imagen  (la de su tipo de pieza; ver
 *                                          imagenesRepuestos.js)
 *
 * MARCAS: un repuesto puede ser compatible con varias marcas. Se
 * exponen dos campos distintos a propósito:
 *
 *   - `marca`: TODAS las marcas compatibles separadas por espacio. Es
 *     el campo que lee `filtrarRepuestos.getMarca` para la búsqueda por
 *     texto, así que una pieza compatible con Chevrolet y Volkswagen se
 *     encuentra escribiendo cualquiera de las dos. Si acá se guardara
 *     solo la primera, las demás dejarían de ser buscables.
 *   - `marcaPrincipal`: la primera marca, para MOSTRAR. Las tarjetas y
 *     las pantallas tienen lugar para una sola, así que renderizan
 *     `marcaPrincipal ?? marca` (el `??` cubre lo viejo guardado en
 *     localStorage, que solo tiene `marca`).
 *   - `marcas`: la lista, para el filtro "Marca del auto" del catálogo.
 *
 * IDs: `PartOut.id` es un NÚMERO y los ids del mock son STRINGS
 * ("BP1234"). El carrito y favoritos viven en localStorage y comparan
 * con `===` (ver App.jsx), así que un id numérico nunca coincidiría con
 * lo que ya está guardado como string. Para que haya UN solo tipo de id
 * en toda la app, se normaliza a string y se conserva el id original
 * numérico en `partId` para futuras llamadas a la API (ej: carrito del
 * backend), que sí necesitan el número.
 *
 * Los autos van en `aplicaciones` (y `marcas`/`modelos`), nunca en el
 * nombre ni en la descripción: para qué autos es un repuesto lo dicen sus
 * compatibilidades. `year_from`, `year_to`, `engine_code` y `color`
 * sueltos se descartan: `aplicaciones` ya los tiene, auto por auto.
 */

import imagePlaceholder from "./assets/repuestos.jpg";
import { imageForType, extraImagesForType } from "./partImages";

// El backend no guarda fotos de los repuestos: cada uno muestra la imagen
// de su tipo de pieza. Si el nombre no corresponde a ningún tipo conocido,
// se usa esta imagen genérica para que el <img> nunca quede roto.
export const PLACEHOLDER_IMAGE = imagePlaceholder;

/**
 * onError de las <img> de repuestos: si la imagen no carga (por ejemplo,
 * la de un tipo de repuesto nuevo que todavía no se generó), muestra la
 * genérica en vez del ícono de imagen rota.
 *
 * El freno contra el bucle (si la genérica también fallara) se decide por
 * lo que el <img> muestra AHORA, no por una marca que quede guardada en el
 * elemento: si el mismo <img> pasa a otra imagen (React reutiliza el
 * elemento al cambiar `src`) y esa falla, vuelve a caer en la genérica.
 */
export function useGenericImage(evento) {
  const image = evento.currentTarget;
  if (image.getAttribute("src") === PLACEHOLDER_IMAGE) return;
  image.src = PLACEHOLDER_IMAGE;
}

export function partImage(displayName) {
  return imageForType(displayName) ?? PLACEHOLDER_IMAGE;
}

// "12 meses de garantía del fabricante (Bosch), por defectos de
// fabricación." Sin meses, vacío: la pantalla muestra "Consultar garantía".
export function warrantyText(months, provider, fabricante) {
  if (!months) return "";
  const quien =
    provider === "vendedor"
      ? "del vendedor (AutoBought)"
      : `del fabricante${fabricante ? ` (${fabricante})` : ""}`;
  return `${months} meses de garantía ${quien}, por defectos de fabricación.`;
}

// Una línea por auto compatible, para la pestaña Aplicaciones del detalle.
function fitmentText({ brand, model, engine_code, year_from, year_to }) {
  const years = year_from === year_to ? `${year_from}` : `${year_from}–${year_to}`;
  return `${brand} ${model} ${engine_code} (${years})`;
}

export function mapPart(part) {
  const brands = Array.isArray(part.compatible_brands)
    ? part.compatible_brands
    : [];

  return {
    id: String(part.id),
    partId: part.id,
    displayName: part.name ?? "",
    fabricante: part.manufacturer ?? "",
    code: part.part_code ?? "",
    categoria: part.category ?? "",
    price: part.price ?? 0,
    stock: part.stock ?? 0,
    marca: brands.join(" "),
    primaryBrand: brands[0] ?? "",
    brands,
    models: Array.isArray(part.compatible_models) ? part.compatible_models : [],
    description: part.description ?? "",
    specifications: Array.isArray(part.specifications) ? part.specifications : [],
    garantia: warrantyText(part.warranty_months, part.warranty_provider, part.manufacturer),
    monthsWarranty: part.warranty_months ?? null,
    warrantyProvider: part.warranty_provider ?? null,
    // Conservar la estructura de API para validar compatibilidad en el
    // detalle, sin cambiar el formato string que ya usa Aplicaciones.
    compatibilidades: Array.isArray(part.compatibilities)
      ? part.compatibilities.map((compatibility) => ({ ...compatibility }))
      : [],
    fitments: Array.isArray(part.compatibilities) ? part.compatibilities.map(fitmentText) : [],
    image: partImage(part.name),
    imagesExtra: extraImagesForType(part.name),
  };
}

/**
 * El carrito del backend (`CartItemDetailOut`, de GET/POST/PATCH/DELETE
 * `/api/v1/cart*`) usa sus propios nombres (`part_id`, `amount`,
 * `subtotal`...) y no trae `compatible_brands` ni imagen, así que no
 * alcanza con `mapearRepuesto`. Igual que ahí, `id` se normaliza a
 * string y `partId` guarda el número para las llamadas a la API.
 */
export function mapCartItem(item) {
  return {
    id: String(item.part_id),
    partId: item.part_id,
    code: item.part_code ?? "",
    displayName: item.name ?? "",
    price: item.price ?? 0,
    quantity: item.amount ?? 0,
    subtotal: item.subtotal ?? 0,
    stock: item.stock ?? 0,
    categoria: item.category ?? "",
    image: partImage(item.name),
  };
}

/**
 * `GET /api/v1/parts/categories` devuelve `{ name, count }`; el sidebar
 * del catálogo ya está escrito contra `{ nombre, cantidad }`.
 */
export function mapCategory(categoria) {
  return {
    displayName: categoria.name ?? "",
    quantity: categoria.count ?? 0,
  };
}
