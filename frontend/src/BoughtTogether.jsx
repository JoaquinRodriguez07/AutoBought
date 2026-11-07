import { useEffect, useState } from "react";
import AddToCartButton from "./AddToCartButton";
import { CartIcon } from "./Icons";
import { getRecommendations } from "./api";
import { useGenericImage } from "./mapPart";
import { useVehicle } from "./context/VehicleContext";
import { productIsCompatible } from "./compatibility";

/**
 * "Suelen comprarse juntos", al final del detalle de un repuesto: los
 * complementarios para los mismos autos (las mismas recomendaciones que
 * el carrito, GET /api/v1/recommendations). Si no hay o el servicio
 * falla, la sección no se muestra.
 *
 * Con un Vehículo Activo, solo se muestran las que son compatibles con
 * ese auto (la misma regla de la tarjeta de compatibilidad del detalle):
 * el backend sugiere para cualquiera de los autos del repuesto, y puede
 * traer uno de otro auto. Sin vehículo activo no se filtra.
 */

const MAX_SUGGESTIONS = 4;

const precio = (valor) => `$${valor.toLocaleString("es-UY")}`;

export default function BoughtTogether({ producto, onDetalle }) {
  const [sugerencias, setSugerencias] = useState({ partId: null, lista: [] });
  const { vehiculoActivo } = useVehicle();
  const partId = producto?.partId;

  useEffect(() => {
    if (!partId) return undefined;

    let activo = true;
    getRecommendations([partId]).then((lista) => {
      if (activo) setSugerencias({ partId, lista });
    });

    return () => {
      activo = false;
    };
  }, [partId]);

  // Las de otro repuesto (mientras cargan las del nuevo) no se muestran.
  const delRepuesto = sugerencias.partId === partId ? sugerencias.lista : [];
  const visibles = (
    vehiculoActivo?.brand
      ? delRepuesto.filter((sugerencia) => productIsCompatible(sugerencia, vehiculoActivo) === true)
      : delRepuesto
  ).slice(0, MAX_SUGGESTIONS);
  if (visibles.length === 0) return null;

  return (
    <section aria-labelledby="titulo-comprados-juntos" className="bg-white py-10 md:py-12">
      <div className="max-w-[1200px] mx-auto px-5 md:px-10">
        <p className="text-orange-500 text-xs font-black tracking-[4px]">PARA EL MISMO AUTO</p>
        <h2 id="titulo-comprados-juntos" className="text-xl md:text-2xl font-black italic uppercase mt-1">
          Suelen comprarse juntos
        </h2>

        {/* Con 3 sugerencias, 3 columnas: con 4 quedaba un hueco a la derecha. */}
        <ul className={`grid grid-cols-1 sm:grid-cols-2 ${visibles.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4"} gap-5 mt-6`}>
          {visibles.map((sugerencia) => (
            <li
              key={sugerencia.id}
              className="flex flex-col bg-white border border-gray-100 rounded-xl overflow-hidden shadow-xs hover:shadow-lg transition"
            >
              <button
                type="button"
                onClick={() => onDetalle?.(sugerencia)}
                aria-label={`Ver ${sugerencia.nombre}`}
                className="h-40 bg-white"
              >
                <img
                  onError={useGenericImage}
                  src={sugerencia.imagen}
                  alt={sugerencia.nombre}
                  loading="lazy"
                  className="w-full h-full object-contain p-3"
                />
              </button>

              <div className="flex flex-col flex-1 p-4">
                <p className="text-xs uppercase tracking-wide text-orange-500 font-black">
                  {sugerencia.fabricante}
                </p>
                <h3 className="text-sm font-bold mt-1 leading-snug">{sugerencia.nombre}</h3>
                <p className="text-lg font-black mt-auto pt-3">{precio(sugerencia.precio)}</p>

                <AddToCartButton
                  producto={sugerencia}
                  className="w-full mt-3 flex items-center justify-center gap-2 h-9 rounded-md text-xs font-bold"
                >
                  <CartIcon />
                  Agregar
                </AddToCartButton>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
