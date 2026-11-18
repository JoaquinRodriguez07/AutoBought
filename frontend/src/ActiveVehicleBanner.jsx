// Franja del vehículo en el catálogo, con su editor desplegable.

import { useState } from "react";

import { useVehicle } from "./context/VehicleContext";
import { CarIcon } from "./Icons";
import VehicleSelector from "./VehicleSelector";

/**
 * Franja del vehículo activo del catálogo con editor local desplegable.
 * Con `pausedFor` (las marcas con las que se entró al catálogo) el
 * vehículo está en pausa: se muestra esa marca y `onResume` vuelve a él.
 * Con `askWhenEmpty`, sin vehículo invita a elegir uno ahí mismo (como
 * el "¿Para qué auto buscás?" de las tiendas de repuestos), sin tener
 * que volver al inicio. `onChoose` avisa cuando se elige o cambia el
 * vehículo desde acá.
 */
export default function ActiveVehicleBanner({ onClear, pausedFor = null, onResume, askWhenEmpty = false, onChoose }) {
  const { activeVehicle, activateVehicle } = useVehicle();
  const [editing, setEditing] = useState(false);

  if (!activeVehicle && !askWhenEmpty) return null;

  const { brand, model, year } = activeVehicle ?? {};
  const vehicleName = [brand, model, year].filter(Boolean).join(" ");

  if (activeVehicle && pausedFor?.length) {
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
              <span className="font-black">{pausedFor.join(", ")}</span>
              <span className="block text-xs text-gray-400">
                Tu {vehicleName} quedó en pausa.
              </span>
            </p>
          </div>

          <div className="pl-12 sm:pl-0">
            <button
              type="button"
              onClick={onResume}
              className="h-8 rounded-md border border-orange-500 px-3 text-xs font-bold text-orange-400 transition hover:bg-orange-500 hover:text-white"
            >
              Volver a mi {vehicleName}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // La invitación a elegir no es un aviso: solo la franja con vehículo lo es.
  return (
    <div
      role={activeVehicle ? "status" : undefined}
      className="rounded-lg border border-white/15 bg-white/10 px-4 py-3 text-white backdrop-blur-sm sm:px-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-orange-500">
            <CarIcon className="h-5 w-5" />
          </span>
          {activeVehicle ? (
            <p className="min-w-0 text-sm">
              <span className="text-gray-300">Mostrando repuestos para: </span>
              <span className="font-black">{vehicleName}</span>
            </p>
          ) : (
            <p className="min-w-0 text-sm">
              <span className="font-black">¿Para qué auto buscás?</span>
              <span className="block text-xs text-gray-400">
                Elegí tu vehículo y te mostramos solo los repuestos que le sirven.
              </span>
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-12 sm:pl-0">
          {activeVehicle ? (
            <button
              type="button"
              aria-expanded={editing}
              onClick={() => setEditing((value) => !value)}
              className="text-xs font-bold text-orange-400 underline underline-offset-4 hover:text-orange-300"
            >
              {editing ? "Cerrar selector" : "Cambiar vehículo"}
            </button>
          ) : (
            <button
              type="button"
              aria-expanded={editing}
              onClick={() => setEditing((value) => !value)}
              className="h-8 rounded-md bg-orange-500 px-3 text-xs font-bold text-white transition hover:bg-orange-600"
            >
              {editing ? "Cerrar selector" : "Elegir vehículo"}
            </button>
          )}
          {activeVehicle && onClear && (
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
              vehicle={activeVehicle ?? null}
              requireComplete={false}
              variant="compact"
              confirmLabel="Confirmar vehículo"
              onConfirm={(vehicle) => {
                activateVehicle(vehicle);
                onChoose?.(vehicle);
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
