// Franja del vehículo activo en el catálogo, con su editor desplegable.

import { useState } from "react";

import { useVehicle } from "./context/VehicleContext";
import { CarIcon } from "./Icons";
import VehicleSelector from "./VehicleSelector";

/** Franja del vehículo activo del catálogo con editor local desplegable. */
export default function ActiveVehicleBanner({ onClear }) {
  const { activeVehicle, activateVehicle } = useVehicle();
  const [editing, setEditing] = useState(false);

  if (!activeVehicle) return null;

  const { brand, model, year } = activeVehicle;

  return (
    <div
      role="status"
      className="rounded-lg border border-white/15 bg-white/10 px-4 py-3 text-white backdrop-blur-sm sm:px-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-orange-500">
            <CarIcon className="h-5 w-5" />
          </span>
          <p className="min-w-0 text-sm">
            <span className="text-gray-300">Mostrando repuestos para: </span>
            <span className="font-black">{[brand, model, year].filter(Boolean).join(" ")}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-12 sm:pl-0">
          <button
            type="button"
            aria-expanded={editing}
            onClick={() => setEditing((value) => !value)}
            className="text-xs font-bold text-orange-400 underline underline-offset-4 hover:text-orange-300"
          >
            {editing ? "Cerrar selector" : "Cambiar vehículo"}
          </button>
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="h-8 rounded-md border border-orange-500 px-3 text-xs font-bold text-orange-400 transition hover:bg-orange-500 hover:text-white"
            >
              Borrar filtros
            </button>
          )}
        </div>
      </div>

      <div
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
          editing ? "mt-4 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
        aria-hidden={!editing}
        inert={!editing}
      >
        <div className="min-h-0 overflow-hidden border-t border-white/10">
          <div className="pt-4">
            {editing && <VehicleSelector
              key={`${brand}|${model}|${year}`}
              vehicle={activeVehicle}
              requireComplete={false}
              variant="compact"
              confirmLabel="Confirmar vehículo"
              onConfirm={(vehicle) => {
                activateVehicle(vehicle);
                setEditing(false);
              }}
              onCancel={() => setEditing(false)}
            />}
          </div>
        </div>
      </div>
    </div>
  );
}
