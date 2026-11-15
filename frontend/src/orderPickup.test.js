import { trackingSteps, isActive, statusPhrase, STATUS_NAME } from "./orderTracking";

test("el seguimiento del retiro reemplaza Enviado por Listo para retirar", () => {
  const purchase = {
    deliveryMethod: "pickup",
    estado: "ready_for_pickup",
    tracking: [
      { estado: "confirmed", date: "2026-01-01" },
      { estado: "packing", date: "2026-01-02" },
      { estado: "ready_for_pickup", date: "2026-01-03" },
    ],
  };
  expect(trackingSteps(purchase).map((step) => step.estado)).toEqual([
    "confirmed", "packing", "ready_for_pickup", "delivered",
  ]);
  expect(trackingSteps(purchase).map((step) => step.hecho)).toEqual([true, true, true, false]);
  expect(STATUS_NAME.ready_for_pickup).toBe("Listo para retirar");
  expect(isActive(purchase)).toBe(true);
  expect(statusPhrase(purchase)).toBe("Listo para retirar en el local");
});

test("el seguimiento de envíos se mantiene igual", () => {
  const purchase = { deliveryMethod: "shipping", estado: "packing" };
  expect(trackingSteps(purchase).map((step) => step.estado)).toEqual([
    "confirmed", "packing", "shipped", "delivered",
  ]);
});
