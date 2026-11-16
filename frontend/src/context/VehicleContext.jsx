import { createContext, useCallback, useContext, useMemo, useState } from "react";

/**
 * VehicleContext
 * ==========================================
 * Guarda el "Vehículo Activo": el auto que el cliente CONFIRMÓ con el
 * botón "Buscar Repuestos". Vive por encima de las rutas (ver main.jsx),
 * así que sobrevive a ir al Carrito, al detalle de un producto, etc. y
 * volver al Catálogo sin perder el filtro.
 *
 * Lo que el cliente va eligiendo en los dropdowns de Home NO es el
 * vehículo activo: eso es un borrador local de Home. Recién al confirmar
 * se llama a `activarVehiculo`, y solo entonces el catálogo pide
 * GET /api/v1/parts?brand=X&model=Y&year=Z.
 *
 * Shape: `{ brand, model, year }` (mismos nombres que los query params
 * de la API) o `null` si no hay vehículo activo.
 */

const VehicleContext = createContext(null);

// El vehículo activo se guarda en la pestaña (sessionStorage): así recargar
// la página o entrar por un enlace no lo pierde, y al cerrar la pestaña se
// olvida. Si el navegador no deja guardar, funciona igual, solo en memoria.
const VEHICLE_STORAGE_KEY = "autobought-vehiculo";

// Lo guardado en el navegador se puede manipular, y la marca, el modelo y
// el año terminan en los pedidos al servidor. Por eso solo se acepta lo que
// tiene forma de vehículo: letras, números, espacios, puntos y guiones
// ("Mercedes-Benz", "Clase C", "T-Cross"), y un año de 4 cifras.
const NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} .-]{0,39}$/u;
const YEAR_PATTERN = /^\d{4}$/;

function validName(value, required) {
  if (value === undefined || value === null || value === "") return required ? null : "";
  return typeof value === "string" && NAME_PATTERN.test(value) ? value : null;
}

function validYear(value) {
  if (value === undefined || value === null || value === "") return "";
  const text = String(value);
  return YEAR_PATTERN.test(text) ? text : null;
}

function readSavedVehicle() {
  let saved;
  try {
    saved = JSON.parse(sessionStorage.getItem(VEHICLE_STORAGE_KEY));
  } catch {
    return null;
  }
  const brand = validName(saved?.brand, true);
  const model = validName(saved?.model, false);
  const year = validYear(saved?.year);
  if (brand === null || model === null || year === null) {
    // Algo que no es un vehículo: se descarta y no se vuelve a leer.
    saveVehicle(null);
    return null;
  }
  return { brand, model, year };
}

function saveVehicle(vehicle) {
  try {
    if (vehicle) sessionStorage.setItem(VEHICLE_STORAGE_KEY, JSON.stringify(vehicle));
    else sessionStorage.removeItem(VEHICLE_STORAGE_KEY);
  } catch {
    // Sin almacenamiento disponible: el vehículo queda solo en memoria.
  }
}

/**
 * Cascada mínima obligatoria: Marca > Modelo > Año.
 * Se exporta para que la pantalla que arma el borrador use la misma
 * regla que el contexto.
 */
export function isVehicleComplete(vehicle) {
  return Boolean(vehicle?.brand && vehicle?.model && vehicle?.year);
}

export function VehicleProvider({ children }) {
  const [activeVehicle, setActiveVehicle] = useState(readSavedVehicle);

    const activateVehicle = useCallback((vehicle) => {
    // Sin marca no hay vehículo. Con marca sola sí: es el filtro que se
    // aplica al tocar una marca en Home o en /marcas. La cascada
    // completa (Marca > Modelo > Año) solo se exige en el buscador de
    // Home, con `vehiculoCompleto`.
    if (!vehicle?.brand) return;

    const active = {
      brand: vehicle.brand,
      model: vehicle.model || "",
      year: vehicle.year ? String(vehicle.year) : "",
    };
    setActiveVehicle(active);
    saveVehicle(active);
  }, []);

  const clearVehicle = useCallback(() => {
    setActiveVehicle(null);
    saveVehicle(null);
  }, []);

  const value = useMemo(
    () => ({ activeVehicle, activateVehicle, clearVehicle }),
    [activeVehicle, activateVehicle, clearVehicle]
  );

  return (
    <VehicleContext.Provider value={value}>
      {children}
    </VehicleContext.Provider>
  );
}

export function useVehicle() {
  const ctx = useContext(VehicleContext);

  if (!ctx) {
    throw new Error("useVehicle debe usarse dentro de <VehicleProvider>");
  }

  return ctx;
}
