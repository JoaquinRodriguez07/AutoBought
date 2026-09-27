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
 *   part_code                    →  codigo
 *   category                     →  categoria
 *   price                        →  precio
 *   stock                        →  stock
 *   compatible_brands            →  marca + marcaPrincipal (ver abajo)
 *   (no existe)                  →  imagen  (placeholder fijo)
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
 *
 * IDs: `PartOut.id` es un NÚMERO y los ids del mock son STRINGS
 * ("BP1234"). El carrito y favoritos viven en localStorage y comparan
 * con `===` (ver App.jsx), así que un id numérico nunca coincidiría con
 * lo que ya está guardado como string. Para que haya UN solo tipo de id
 * en toda la app, se normaliza a string y se conserva el id original
 * numérico en `partId` para futuras llamadas a la API (ej: carrito del
 * backend), que sí necesitan el número.
 *
 * DEUDA CONOCIDA (diferida a propósito): el backend ya manda
 * `compatible_models`, `year_from`, `year_to`, `engine_code` y `color`,
 * y acá se descartan. Por eso, en todo producto que venga de la API, las
 * pestañas "Aplicaciones" y "Especificaciones" de DetalleProducto
 * muestran su estado vacío aunque el dato haya llegado en la respuesta.
 */

import imagenPlaceholder from "./assets/repuestos.jpg";

// El backend no expone imágenes todavía. Hasta que lo haga, todos los
// repuestos usan este placeholder para que el <img> nunca quede roto.
export const IMAGEN_PLACEHOLDER = imagenPlaceholder;

export function mapearRepuesto(part) {
  const marcas = Array.isArray(part.compatible_brands)
    ? part.compatible_brands
    : [];

  return {
    id: String(part.id),
    partId: part.id,
    nombre: part.name ?? "",
    codigo: part.part_code ?? "",
    categoria: part.category ?? "",
    precio: part.price ?? 0,
    stock: part.stock ?? 0,
    marca: marcas.join(" "),
    marcaPrincipal: marcas[0] ?? "",
    imagen: IMAGEN_PLACEHOLDER,
  };
}

/**
 * El carrito del backend (`CartItemDetailOut`, de GET/POST/PATCH/DELETE
 * `/api/v1/cart*`) usa sus propios nombres (`part_id`, `amount`,
 * `subtotal`...) y no trae `compatible_brands` ni imagen, así que no
 * alcanza con `mapearRepuesto`. Igual que ahí, `id` se normaliza a
 * string y `partId` guarda el número para las llamadas a la API.
 */
export function mapearItemCarrito(item) {
  return {
    id: String(item.part_id),
    partId: item.part_id,
    nombre: item.name ?? "",
    precio: item.price ?? 0,
    cantidad: item.amount ?? 0,
    subtotal: item.subtotal ?? 0,
    stock: item.stock ?? 0,
    categoria: item.category ?? "",
    imagen: IMAGEN_PLACEHOLDER,
  };
}

/**
 * `GET /api/v1/parts/categories` devuelve `{ name, count }`; el sidebar
 * del catálogo ya está escrito contra `{ nombre, cantidad }`.
 */
export function mapearCategoria(categoria) {
  return {
    nombre: categoria.name ?? "",
    cantidad: categoria.count ?? 0,
  };
}
