import { useEffect, useRef, useState } from "react";
import { useCart } from "./context/CartContext";
import { IconoCheck } from "./Iconos";

// Cuánto tiempo queda el botón en "Agregado" antes de volver al texto
// normal.
export const DURACION_AGREGADO_MS = 1500;

/**
 * Botón "Agregar al carrito" con feedback en el mismo lugar donde se
 * hizo clic: "Agregando…" (deshabilitado, así un doble clic no agrega
 * dos veces) y después "Agregado" con un check por un momento. El aviso
 * con el detalle lo muestra CartContext.
 *
 * Cada pantalla pasa su texto (`children`) y su tamaño en `className`;
 * los colores según el estado los pone este componente.
 */
export default function BotonAgregarCarrito({
  producto,
  cantidad = 1,
  textoSinStock = "Sin stock",
  onTerminar,
  className = "",
  children,
}) {
  const { addToCart } = useCart();
  const [estado, setEstado] = useState("listo");
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const sinStock = producto.stock === 0;

  const agregar = async () => {
    setEstado("agregando");
    const agregado = await addToCart(producto, cantidad);
    onTerminar?.(agregado);

    if (!agregado) {
      setEstado("listo");
      return;
    }
    setEstado("agregado");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setEstado("listo"), DURACION_AGREGADO_MS);
  };

  const colores = sinStock
    ? "bg-gray-200 text-gray-400 cursor-not-allowed"
    : estado === "agregado"
      ? "bg-green-600 text-white"
      : estado === "agregando"
        ? "bg-orange-400 text-white cursor-wait"
        : "bg-orange-500 hover:bg-orange-600 text-white";

  let contenido = children;
  if (sinStock) contenido = textoSinStock;
  else if (estado === "agregando") contenido = "Agregando…";
  else if (estado === "agregado") contenido = <><IconoCheck />Agregado</>;

  return (
    <button
      type="button"
      onClick={agregar}
      disabled={sinStock || estado === "agregando"}
      aria-busy={estado === "agregando"}
      className={`transition ${colores} ${className}`}
    >
      {contenido}
    </button>
  );
}
