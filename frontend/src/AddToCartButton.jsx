import { useEffect, useRef, useState } from "react";
import { useCart } from "./context/CartContext";
import { CheckIcon } from "./Icons";

// Cuánto tiempo queda el botón en "Agregado" antes de volver al texto
// normal.
export const ADDED_DURATION_MS = 1500;

/**
 * Botón "Agregar al carrito" con feedback en el mismo lugar donde se
 * hizo clic: "Agregando…" (deshabilitado, así un doble clic no agrega
 * dos veces) y después "Agregado" con un check por un momento. El aviso
 * con el detalle lo muestra CartContext.
 *
 * Cada pantalla pasa su texto (`children`) y su tamaño en `className`;
 * los colores según el estado los pone este componente.
 */
export default function AddToCartButton({
  product,
  quantity = 1,
  textWithoutStock = "Sin stock",
  onTerminar,
  className = "",
  children,
}) {
  const { addToCart } = useCart();
  const [estado, setStatus] = useState("ready");
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const withoutStock = product.stock === 0;

  const add = async () => {
    setStatus("adding");
    const added = await addToCart(product, quantity);
    onTerminar?.(added);

    if (!added) {
      setStatus("ready");
      return;
    }
    setStatus("added");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus("ready"), ADDED_DURATION_MS);
  };

  const colores = withoutStock
    ? "bg-gray-200 text-gray-400 cursor-not-allowed"
    : estado === "added"
      ? "bg-green-600 text-white"
      : estado === "adding"
        ? "bg-orange-400 text-white cursor-wait"
        : "bg-orange-500 hover:bg-orange-600 text-white";

  let contenido = children;
  if (withoutStock) contenido = textWithoutStock;
  else if (estado === "adding") contenido = "Agregando…";
  else if (estado === "added") contenido = <><CheckIcon />Agregado</>;

  return (
    <button
      type="button"
      onClick={add}
      disabled={withoutStock || estado === "adding"}
      aria-busy={estado === "adding"}
      className={`transition ${colores} ${className}`}
    >
      {contenido}
    </button>
  );
}
