import { useVehicle } from "./context/VehicleContext";

/**
 * ActiveVehicleBanner
 * ==========================================
 * Banner de la parte superior del catálogo. Lee el Vehículo Activo de
 * VehicleContext y muestra: "Mostrando repuestos para: Ford Fiesta 2018".
 * Si no hay vehículo activo no renderiza nada.
 *
 * Props (opcionales, las acciones las resuelve quien lo usa):
 *  - onCambiar (fn) "Cambiar vehículo": ir a elegir otro auto.
 *  - onBorrar  (fn) "Borrar filtros": quitar el vehículo y volver al
 *                   catálogo completo.
 */
export default function ActiveVehicleBanner({ onCambiar, onBorrar }) {
  const { vehiculoActivo } = useVehicle();

  if (!vehiculoActivo) return null;

  const { brand, model, year } = vehiculoActivo;

  return (
    <div
      role="status"
      className="bg-[#151719] text-white rounded-lg px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
    >
      <div className="flex items-center gap-3">
        <span className="text-xl" aria-hidden="true">
          🚗
        </span>

        <p className="text-[12px]">
          <span className="text-gray-400">
            Mostrando repuestos para:{" "}
          </span>
          <span className="font-black">
            {[brand, model, year].filter(Boolean).join(" ")}
          </span>
        </p>
      </div>

      <div className="flex items-center gap-4">
        {onCambiar && (
          <button
            type="button"
            onClick={onCambiar}
            className="text-orange-500 text-[9px] font-bold underline"
          >
            Cambiar vehículo
          </button>
        )}

        {onBorrar && (
          <button
            type="button"
            onClick={onBorrar}
            className="border border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white rounded-md px-3 h-8 text-[9px] font-bold transition"
          >
            Borrar filtros
          </button>
        )}
      </div>
    </div>
  );
}
