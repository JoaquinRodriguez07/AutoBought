// Selector del vehículo con el que arranca la charla con Pit.

import { useEffect, useState } from "react";

import BrandDropdown from "./BrandDropdown";
import ModelDropdown from "./ModelDropdown";
import { getYears } from "./api";

const FIELD = "mt-1 w-full h-11 border border-gray-300 rounded-lg px-3 text-sm bg-white focus:outline-hidden focus:border-orange-500";

/**
 * ElegirVehiculoPit
 * ==========================================
 * Marca, modelo y año dentro del chat de Pit, para no tener que ir al
 * inicio. Usa los mismos datos que el buscador del inicio (marcas, modelos
 * de esa marca y años de ese modelo). Al confirmar, `onListo` recibe
 * `{ brand, model, year }`, que es el vehículo activo de todo el sitio.
 */
export default function PitVehiclePicker({ vehicle, onReady, onCancel, aviso }) {
  const [marca, setBrand] = useState(vehicle?.brand || "");
  const [modelo, setModel] = useState(vehicle?.model || "");
  const [anio, setYear] = useState(vehicle?.year ? String(vehicle.year) : "");
  const [years, setYears] = useState([]);

  // Los años dependen de la marca y el modelo elegidos.
  useEffect(() => {
    if (!marca || !modelo) return undefined;
    let vigente = true;
    getYears(marca, modelo)
      .then((list) => vigente && setYears(list))
      .catch(() => vigente && setYears([]));
    return () => {
      vigente = false;
    };
  }, [marca, modelo]);

  const chooseBrand = (rawValue) => {
    setBrand(rawValue);
    setModel("");
    setYear("");
    setYears([]);
  };

  const chooseModel = (rawValue) => {
    setModel(rawValue);
    setYear("");
    setYears([]);
  };

  const completo = Boolean(marca && modelo && anio);

  return (
    <form
      aria-label="Elegir vehículo"
      onSubmit={(e) => {
        e.preventDefault();
        if (completo) onReady({ brand: marca, model: modelo, year: anio });
      }}
      className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col gap-3 motion-safe:animate-aparecer"
    >
      <p className="text-xs font-black uppercase tracking-wide text-gray-500">Tu auto</p>

      <label className="text-xs font-bold text-gray-600">
        Marca
        <BrandDropdown value={marca} onChange={chooseBrand} className={FIELD} />
      </label>
      <label className="text-xs font-bold text-gray-600">
        Modelo
        <ModelDropdown brand={marca} value={modelo} onChange={chooseModel} className={FIELD} />
      </label>
      <label className="text-xs font-bold text-gray-600">
        Año
        <select
          value={anio}
          onChange={(e) => setYear(e.target.value)}
          disabled={!modelo}
          className={`${FIELD} disabled:bg-gray-100 disabled:text-gray-400`}
        >
          <option value="">{modelo ? "Elegí el año" : "Elegí el modelo primero"}</option>
          {years.map((option) => (
            <option key={option} value={String(option)}>
              {option}
            </option>
          ))}
        </select>
      </label>

      {aviso && <p className="text-xs text-gray-500">{aviso}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!completo}
          className="flex-1 h-11 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:bg-orange-200 text-white text-sm font-black"
        >
          Listo
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="h-11 px-4 rounded-lg border border-gray-300 hover:border-orange-500 text-sm font-bold"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
