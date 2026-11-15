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
 *
 * El vendedor (`seller`) ve las sugerencias sin el botón «Agregar».
 */

const MAX_SUGGESTIONS = 4;

const price = (rawValue) => `$${rawValue.toLocaleString("es-UY")}`;

export default function BoughtTogether({ product, onDetail, seller = false }) {
  const [suggestions, setSuggestions] = useState({ partId: null, list: [] });
  const { activeVehicle } = useVehicle();
  const partId = product?.partId;

  useEffect(() => {
    if (!partId) return undefined;

    let active = true;
    void getRecommendations([partId]).then((list) => {
      if (active) setSuggestions({ partId, list });
    });

    return () => {
      active = false;
    };
  }, [partId]);

  // Las de otro repuesto (mientras cargan las del nuevo) no se muestran.
  const ofPart = suggestions.partId === partId ? suggestions.list : [];
  const visible = (
    activeVehicle?.brand
      ? ofPart.filter((suggestionItem) => productIsCompatible(suggestionItem, activeVehicle) === true)
      : ofPart
  ).slice(0, MAX_SUGGESTIONS);
  if (visible.length === 0) return null;

  return (
    <section aria-labelledby="titulo-comprados-juntos" className="bg-white py-10 md:py-12">
      <div className="max-w-[1200px] mx-auto px-5 md:px-10">
        <p className="text-orange-500 text-xs font-black tracking-[4px]">PARA EL MISMO AUTO</p>
        <h2 id="titulo-comprados-juntos" className="text-xl md:text-2xl font-black italic uppercase mt-1">
          Suelen comprarse juntos
        </h2>

        {/* Con 3 sugerencias, 3 columnas: con 4 quedaba un hueco a la derecha. */}
        <ul className={`grid grid-cols-1 sm:grid-cols-2 ${visible.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4"} gap-5 mt-6`}>
          {visible.map((suggestionItem) => (
            <li
              key={suggestionItem.id}
              className="flex flex-col bg-white border border-gray-100 rounded-xl overflow-hidden shadow-xs hover:shadow-lg transition"
            >
              <button
                type="button"
                onClick={() => onDetail?.(suggestionItem)}
                aria-label={`Ver ${suggestionItem.displayName}`}
                className="h-40 bg-white"
              >
                <img
                  onError={useGenericImage}
                  src={suggestionItem.image}
                  alt={suggestionItem.displayName}
                  loading="lazy"
                  className="w-full h-full object-contain p-3"
                />
              </button>

              <div className="flex flex-col flex-1 p-4">
                <p className="text-xs uppercase tracking-wide text-orange-500 font-black">
                  {suggestionItem.fabricante}
                </p>
                <h3 className="text-sm font-bold mt-1 leading-snug">{suggestionItem.displayName}</h3>
                <p className="text-lg font-black mt-auto pt-3">{price(suggestionItem.price)}</p>

                {!seller && (
                  <AddToCartButton
                    product={suggestionItem}
                    className="w-full mt-3 flex items-center justify-center gap-2 h-9 rounded-md text-xs font-bold"
                  >
                    <CartIcon />
                    Agregar
                  </AddToCartButton>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
