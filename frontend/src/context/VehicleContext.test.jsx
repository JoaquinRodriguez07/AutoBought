// El vehículo activo sobrevive a recargar la página (queda en la pestaña).

import { act, render } from "@testing-library/react";

import { VehicleProvider, useVehicle } from "./VehicleContext";

// La misma clave que usa VehicleContext (y que limpia setupTests.js).
const VEHICLE_STORAGE_KEY = "autobought-vehiculo";

let vehicleState;

function Consumer() {
  vehicleState = useVehicle();
  return null;
}

// Montar de nuevo el proveedor es lo mismo que recargar la página.
const mount = () => render(<VehicleProvider><Consumer /></VehicleProvider>);

it("keeps the active vehicle after reloading the page", () => {
  const { unmount } = mount();
  act(() => vehicleState.activateVehicle({ brand: "Volkswagen", model: "Gol", year: 2018 }));
  unmount();

  mount();

  expect(vehicleState.activeVehicle).toEqual({ brand: "Volkswagen", model: "Gol", year: "2018" });
});

it("forgets it when the vehicle is cleared", () => {
  const { unmount } = mount();
  act(() => vehicleState.activateVehicle({ brand: "Fiat" }));
  act(() => vehicleState.clearVehicle());
  unmount();

  mount();

  expect(vehicleState.activeVehicle).toBeNull();
  expect(sessionStorage.getItem(VEHICLE_STORAGE_KEY)).toBeNull();
});

it("ignores a broken saved value", () => {
  sessionStorage.setItem(VEHICLE_STORAGE_KEY, "{roto");

  mount();

  expect(vehicleState.activeVehicle).toBeNull();
});
