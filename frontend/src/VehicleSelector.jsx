import { useEffect, useState } from "react";

import BrandDropdown from "./BrandDropdown";
import ModelDropdown from "./ModelDropdown";
import { obtenerAnios } from "./api";

/** Selector de vehículo compartido por Home y el detalle del repuesto. */
export default function VehicleSelector({
  vehicle,
  onConfirm,
  onCancel,
  onClear,
  requireComplete = true,
  showClear = false,
  variant = "home",
  confirmLabel,
}) {
  const [selectedBrand, setSelectedBrand] = useState(vehicle?.brand || "");
  const [selectedModel, setSelectedModel] = useState(vehicle?.model || "");
  const [selectedYear, setSelectedYear] = useState(vehicle?.year || "");
  const [years, setYears] = useState([]);
  const [loadingYears, setLoadingYears] = useState(false);
  const compact = variant === "compact";
  const dark = compact || variant === "detail";

  useEffect(() => {
    setSelectedBrand(vehicle?.brand || "");
    setSelectedModel(vehicle?.model || "");
    setSelectedYear(vehicle?.year || "");
  }, [vehicle]);

  useEffect(() => {
    if (!selectedBrand || !selectedModel) {
      setYears([]);
      return undefined;
    }

    let active = true;
    const loadYears = async () => {
      try {
        setLoadingYears(true);
        const availableYears = await obtenerAnios(selectedBrand, selectedModel);
        if (active) setYears(availableYears);
      } catch (error) {
        console.error("Error cargando años:", error);
        if (active) setYears([]);
      } finally {
        if (active) setLoadingYears(false);
      }
    };

    loadYears();
    return () => {
      active = false;
    };
  }, [selectedBrand, selectedModel]);

  const canConfirm = requireComplete
    ? Boolean(selectedBrand && selectedModel && selectedYear)
    : Boolean(selectedBrand);
  const hasSelection = Boolean(selectedBrand || selectedModel || selectedYear || vehicle);
  const labelClass = dark
    ? "block text-[10px] text-gray-400 font-bold mb-1.5"
    : "block text-xs text-gray-400 font-bold mb-2";
  const selectClass = dark
    ? "w-full bg-[#25282B] text-white border border-white/10 rounded-md px-3 h-10 text-sm outline-hidden focus:border-orange-500 disabled:bg-[#1D1F21] disabled:text-gray-500"
    : "w-full bg-white rounded-md px-3 h-11 text-sm outline-hidden";
  const modelSelectClass = dark
    ? selectClass
    : `${selectClass} disabled:bg-gray-300 disabled:text-gray-500`;
  const fieldClass = dark ? "block min-w-0" : "flex-1";
  const fields = (
    <>
      <label className={fieldClass}>
        <span className={labelClass}>MARCA</span>
        <BrandDropdown
          value={selectedBrand}
          onChange={(brand) => {
            setSelectedBrand(brand);
            setSelectedModel("");
            setSelectedYear("");
            setYears([]);
          }}
          className={selectClass}
        />
      </label>

      <label className={fieldClass}>
        <span className={labelClass}>MODELO</span>
        <ModelDropdown
          brand={selectedBrand}
          value={selectedModel}
          onChange={(model) => {
            setSelectedModel(model);
            setSelectedYear("");
          }}
          className={modelSelectClass}
        />
      </label>

      <label className={fieldClass}>
        <span className={labelClass}>AÑO</span>
        <select
          aria-label="AÑO"
          value={selectedYear}
          onChange={(event) => setSelectedYear(event.target.value)}
          disabled={!selectedModel || loadingYears}
          className={selectClass}
        >
          <option value="">
            {!selectedModel
              ? "Seleccioná un modelo"
              : loadingYears
                ? "Cargando años..."
                : "Seleccioná un año"}
          </option>
          {years.map((year) => (
            <option key={year} value={year}>{year}</option>
          ))}
        </select>
      </label>
    </>
  );
  const actions = (
    <>
      <button
        type="button"
        onClick={() => onConfirm({
          brand: selectedBrand,
          model: selectedModel,
          year: selectedYear,
        })}
        disabled={!canConfirm}
        className={dark
          ? "h-9 rounded-md bg-orange-500 hover:bg-orange-600 text-white px-3 text-[11px] font-black transition disabled:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed"
          : "h-11 bg-orange-500 hover:bg-orange-600 text-white rounded-md px-7 text-xs font-black transition disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed"}
      >
        {confirmLabel || (dark ? "Confirmar vehículo" : "BUSCAR REPUESTOS")}
      </button>

      {showClear && hasSelection && (
        <button
          type="button"
          onClick={() => {
            setSelectedBrand("");
            setSelectedModel("");
            setSelectedYear("");
            setYears([]);
            onClear?.();
          }}
          className="h-11 border border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white rounded-md px-5 text-xs font-black transition"
        >
          BORRAR FILTROS
        </button>
      )}

      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="h-9 rounded-md border border-white/20 text-gray-300 hover:border-white/40 px-3 text-[11px] font-bold transition"
        >
          Cancelar
        </button>
      )}
    </>
  );

  return (
    <div className={compact ? "space-y-3" : dark ? "space-y-3" : "mt-4 flex flex-col md:flex-row md:items-end gap-4"}>
      <div className={compact ? "grid grid-cols-1 sm:grid-cols-3 gap-2.5" : dark ? "space-y-3" : "contents"}>
        {fields}
      </div>
      <div className={compact ? "flex flex-wrap justify-end gap-2" : dark ? "flex flex-wrap items-center gap-3 pt-1" : "contents"}>
        {actions}
      </div>
    </div>
  );
}
