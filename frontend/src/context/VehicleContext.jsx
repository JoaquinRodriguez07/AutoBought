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

/**
 * Cascada mínima obligatoria: Marca > Modelo > Año.
 * Se exporta para que la pantalla que arma el borrador use la misma
 * regla que el contexto.
 */
export function vehiculoCompleto(vehiculo) {
  return Boolean(vehiculo?.brand && vehiculo?.model && vehiculo?.year);
}

export function VehicleProvider({ children }) {
  const [vehiculoActivo, setVehiculoActivo] = useState(null);

    const activarVehiculo = useCallback((vehiculo) => {
    // Sin marca no hay vehículo. Con marca sola sí: es el filtro que se
    // aplica al tocar una marca en Home o en /marcas. La cascada
    // completa (Marca > Modelo > Año) solo se exige en el buscador de
    // Home, con `vehiculoCompleto`.
    if (!vehiculo?.brand) return;

    setVehiculoActivo({
      brand: vehiculo.brand,
      model: vehiculo.model || "",
      year: vehiculo.year ? String(vehiculo.year) : "",
    });
  }, []);

  const limpiarVehiculo = useCallback(() => {
    setVehiculoActivo(null);
  }, []);

  const value = useMemo(
    () => ({ vehiculoActivo, activarVehiculo, limpiarVehiculo }),
    [vehiculoActivo, activarVehiculo, limpiarVehiculo]
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
