import { useEffect, useMemo, useState } from "react";
import { useGenericImage } from "./mapPart";
import { useCart } from "./context/CartContext";
import { getRecommendations } from "./api";

/**
 * SugerenciasCarrito (HU 3.2)
 * ==========================================
 * Sección "También podrías necesitar esto..." del carrito. Pide al
 * backend repuestos complementarios a los del carrito y permite
 * agregarlos sin salir de la página.
 *
 * No se muestra si el carrito está vacío, si no hay sugerencias o si
 * el servicio de recomendaciones falla.
 */

const MAX_SUGGESTIONS = 3;

const price = (rawValue) => `$${rawValue.toLocaleString("es-UY")}`;

export default function CartSuggestions({ onDetail }) {
  const { cart, addToCart } = useCart();
  const [suggestions, setSuggestions] = useState([]);
  const [adding, setAdding] = useState(null);

  // Ids de los repuestos del carrito. Se usan como clave: solo se piden
  // sugerencias nuevas cuando cambia QUÉ hay en el carrito, no cuando
  // cambia una cantidad.
  const idsCart = useMemo(
    () => cart.map((item) => item.partId).sort((a, b) => a - b),
    [cart]
  );
  const cartKey = idsCart.join(",");

  useEffect(() => {
    if (!cartKey) return undefined;

    let active = true;

    void getRecommendations(cartKey.split(",").map(Number)).then(
      (list) => {
        if (active) setSuggestions(list);
      }
    );

    return () => {
      active = false;
    };
  }, [cartKey]);

  // Una sugerencia que el cliente ya agregó deja de mostrarse.
  const visible = suggestions
    .filter((suggestionItem) => !idsCart.includes(suggestionItem.partId))
    .slice(0, MAX_SUGGESTIONS);

  if (cart.length === 0 || visible.length === 0) return null;

  const add = async (product) => {
    setAdding(product.id);
    try {
      // Ya estamos en el carrito: el ítem aparece en la lista, no hace
      // falta el aviso de "agregado".
      await addToCart(product, 1, { aviso: false });
    } finally {
      setAdding(null);
    }
  };

  return (
    <section aria-labelledby="titulo-sugerencias" className="mt-6">
      <h2 id="titulo-sugerencias" className="text-sm font-black">
        Te puede servir también
      </h2>

      <ul className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
        {visible.map((product) => (
          <li
            key={product.id}
            className="bg-white border border-gray-200 rounded-lg p-3 flex gap-3"
          >
            <img onError={useGenericImage}
              src={product.image}
              alt={product.displayName}
              className="w-14 h-14 rounded-md object-contain bg-white border border-gray-100 shrink-0"
            />

            <div className="flex flex-col min-w-0 flex-1">
              <p className="text-orange-500 text-xs uppercase tracking-wide font-black truncate">
                {product.fabricante}
              </p>
              <button type="button" onClick={() => onDetail?.(product)} className="text-left text-xs font-bold leading-snug line-clamp-2 hover:text-orange-500">
                {product.displayName}
              </button>
              <div className="flex items-center justify-between gap-2 mt-auto pt-1">
                <p className="text-sm font-black">
                  {price(product.price)}
                </p>
                <button
                  type="button"
                  onClick={() => add(product)}
                  disabled={adding === product.id}
                  aria-label={`Agregar ${product.displayName} al carrito`}
                  className="text-xs font-black text-orange-500 hover:text-orange-600 disabled:opacity-60"
                >
                  {adding === product.id ? "Agregando..." : "+ Agregar"}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
