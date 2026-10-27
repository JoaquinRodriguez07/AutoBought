import { useEffect, useMemo, useState } from "react";
import { useCart } from "./context/CartContext";
import { obtenerRecomendaciones } from "./api";

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

const MAX_SUGERENCIAS = 3;

const precio = (valor) => `$${valor.toLocaleString("es-UY")}`;

export default function SugerenciasCarrito({ onDetalle }) {
  const { cart, addToCart } = useCart();
  const [sugerencias, setSugerencias] = useState([]);
  const [agregando, setAgregando] = useState(null);

  // Ids de los repuestos del carrito. Se usan como clave: solo se piden
  // sugerencias nuevas cuando cambia QUÉ hay en el carrito, no cuando
  // cambia una cantidad.
  const idsCarrito = useMemo(
    () => cart.map((item) => item.partId).sort((a, b) => a - b),
    [cart]
  );
  const claveCarrito = idsCarrito.join(",");

  useEffect(() => {
    if (!claveCarrito) return undefined;

    let activo = true;

    obtenerRecomendaciones(claveCarrito.split(",").map(Number)).then(
      (lista) => {
        if (activo) setSugerencias(lista);
      }
    );

    return () => {
      activo = false;
    };
  }, [claveCarrito]);

  // Una sugerencia que el cliente ya agregó deja de mostrarse.
  const visibles = sugerencias
    .filter((sugerencia) => !idsCarrito.includes(sugerencia.partId))
    .slice(0, MAX_SUGERENCIAS);

  if (cart.length === 0 || visibles.length === 0) return null;

  const agregar = async (producto) => {
    setAgregando(producto.id);
    try {
      // Ya estamos en el carrito: el ítem aparece en la lista, no hace
      // falta el aviso de "agregado".
      await addToCart(producto, 1, { aviso: false });
    } finally {
      setAgregando(null);
    }
  };

  return (
    <section aria-labelledby="titulo-sugerencias" className="mt-6">
      <h2 id="titulo-sugerencias" className="text-sm font-black">
        También podrías necesitar esto...
      </h2>

      <ul className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
        {visibles.map((producto) => (
          <li
            key={producto.id}
            className="bg-white border border-gray-200 rounded-lg p-3 flex gap-3"
          >
            <img
              src={producto.imagen}
              alt={producto.nombre}
              className="w-14 h-14 rounded-md object-contain bg-white border border-gray-100 shrink-0"
            />

            <div className="flex flex-col min-w-0 flex-1">
              <p className="text-orange-500 text-[10px] uppercase tracking-wide font-black truncate">
                {producto.fabricante}
              </p>
              <button type="button" onClick={() => onDetalle?.(producto)} className="text-left text-xs font-bold leading-snug line-clamp-2 hover:text-orange-500">
                {producto.nombre}
              </button>
              <div className="flex items-center justify-between gap-2 mt-auto pt-1">
                <p className="text-sm font-black">
                  {precio(producto.precio)}
                </p>
                <button
                  type="button"
                  onClick={() => agregar(producto)}
                  disabled={agregando === producto.id}
                  aria-label={`Agregar ${producto.nombre} al carrito`}
                  className="text-xs font-black text-orange-500 hover:text-orange-600 disabled:opacity-60"
                >
                  {agregando === producto.id ? "Agregando..." : "+ Agregar"}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
