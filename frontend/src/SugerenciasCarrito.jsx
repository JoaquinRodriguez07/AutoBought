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

export default function SugerenciasCarrito() {
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
      await addToCart(producto, 1);
    } finally {
      setAgregando(null);
    }
  };

  return (
    <section
      aria-labelledby="titulo-sugerencias"
      className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm mt-6"
    >
      <h2 id="titulo-sugerencias" className="text-[13px] font-black">
        También podrías necesitar esto...
      </h2>

      <ul className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
        {visibles.map((producto) => (
          <li
            key={producto.id}
            className="border border-gray-200 rounded-lg p-3 flex flex-col"
          >
            <div className="h-[90px] rounded-md overflow-hidden bg-gray-100">
              <img
                src={producto.imagen}
                alt={producto.nombre}
                className="w-full h-full object-cover"
              />
            </div>

            <p className="text-orange-500 text-[8px] font-black mt-3">
              {producto.marcaPrincipal}
            </p>
            <p className="text-[11px] font-black mt-1 flex-1">
              {producto.nombre}
            </p>
            <p className="text-[13px] font-black mt-2">
              {precio(producto.precio)}
            </p>

            <button
              type="button"
              onClick={() => agregar(producto)}
              disabled={agregando === producto.id}
              aria-label={`Agregar ${producto.nombre} al carrito`}
              className="mt-3 bg-orange-500 hover:bg-orange-600 text-white rounded-md py-2 text-[9px] font-black disabled:opacity-60"
            >
              {agregando === producto.id ? "AGREGANDO..." : "AGREGAR AL CARRITO"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}