import {
  cancelledByStore,
  expiredUnpaid,
  formatDate,
  formatPrice,
  isActive,
  isUnpaid,
  productsText,
  shortPhrase,
  sortByProgress,
  statusPhrase,
  trackingSteps,
} from "./orderTracking";

const pedido = (extra) => ({ id: 1, estado: "confirmed", paymentStatus: "approved", ...extra });

describe("trackingSteps", () => {
  it("marks the stages already reached with their dates and leaves the rest pending", () => {
    const compra = pedido({
      estado: "packing",
      tracking: [
        { estado: "confirmed", date: "2026-11-01" },
        { estado: "packing", date: "2026-11-02" },
      ],
    });

    expect(trackingSteps(compra)).toEqual([
      { estado: "confirmed", hecho: true, date: "2026-11-01" },
      { estado: "packing", hecho: true, date: "2026-11-02" },
      { estado: "shipped", hecho: false, date: null },
      { estado: "delivered", hecho: false, date: null },
    ]);
  });

  it("marks the stages before the current one as done even without their date", () => {
    expect(trackingSteps(pedido({ estado: "shipped" })).map((paso) => [paso.estado, paso.hecho, paso.date])).toEqual([
      ["confirmed", true, null],
      ["packing", true, null],
      ["shipped", true, null],
      ["delivered", false, null],
    ]);
  });

  it("shows a cancelled order up to where it got, and then the cancellation", () => {
    const compra = pedido({
      estado: "cancelled",
      tracking: [
        { estado: "confirmed", date: "2026-11-01" },
        { estado: "cancelled", date: "2026-11-03" },
      ],
    });

    expect(trackingSteps(compra)).toEqual([
      { estado: "confirmed", hecho: true, date: "2026-11-01" },
      { estado: "cancelled", hecho: true, date: "2026-11-03" },
    ]);
  });

  it("shows only the cancellation of an order cancelled without history", () => {
    expect(trackingSteps(pedido({ estado: "cancelled", tracking: [] }))).toEqual([
      { estado: "cancelled", hecho: true, date: null },
    ]);
  });

  it("leaves every stage pending for a status outside the flow", () => {
    expect(trackingSteps(pedido({ estado: "desconocido" })).every((paso) => !paso.hecho)).toBe(true);
  });
});

describe("payment state", () => {
  it.each([
    ["pending", "confirmed", true],
    ["rejected", "confirmed", true],
    ["approved", "confirmed", false],
    [null, "confirmed", false],
    ["pending", "cancelled", false],
  ])("a payment %s on an order %s is unpaid: %s", (paymentStatus, estado, esperado) => {
    expect(isUnpaid(pedido({ paymentStatus, estado }))).toBe(esperado);
  });

  it.each([
    ["expired by its reason", { estado: "cancelled", reasonCancellation: "expired" }, true],
    ["cancelled by the store", { estado: "cancelled", reasonCancellation: "store", paymentStatus: "pending" }, false],
    ["an old one without reason and with the payment pending", { estado: "cancelled", paymentStatus: "pending" }, true],
    ["an old one without reason that was paid", { estado: "cancelled", paymentStatus: "approved" }, false],
    ["one that is not cancelled", { estado: "confirmed", paymentStatus: "pending" }, false],
  ])("knows whether an order expired unpaid: %s", (_caso, datos, esperado) => {
    expect(expiredUnpaid(pedido(datos))).toBe(esperado);
  });

  it("knows when the store cancelled an order", () => {
    expect(cancelledByStore(pedido({ estado: "cancelled", reasonCancellation: "store" }))).toBe(true);
    expect(cancelledByStore(pedido({ estado: "cancelled", reasonCancellation: "expired" }))).toBe(false);
    expect(cancelledByStore(pedido({ estado: "delivered", reasonCancellation: "store" }))).toBe(false);
  });
});

describe("isActive", () => {
  it.each([
    ["confirmed", "approved", true],
    ["packing", "approved", true],
    ["shipped", "approved", true],
    ["delivered", "approved", false],
    ["cancelled", "pending", false],
    ["confirmed", "pending", true],
  ])("an order %s with payment %s is active: %s", (estado, paymentStatus, esperado) => {
    expect(isActive(pedido({ estado, paymentStatus }))).toBe(esperado);
  });
});

describe("phrases", () => {
  it.each([
    [{ paymentStatus: "pending" }, "Falta pagar", "Falta pagar"],
    [{ paymentStatus: "rejected" }, "El pago fue rechazado", "Pago rechazado"],
    [{ estado: "confirmed" }, "Lo estamos preparando", "Preparando"],
    [{ estado: "packing" }, "Lo estamos empaquetando", "Empaquetando"],
    [{ estado: "shipped" }, "Está en camino", "En camino"],
    [{ estado: "delivered" }, "Entregado", "Entregado"],
    [{ estado: "cancelled", paymentStatus: "pending" }, "Cancelado", "Cancelado"],
    [{ estado: "desconocido" }, "", ""],
  ])("describes %j", (datos, larga, corta) => {
    expect(statusPhrase(pedido(datos))).toBe(larga);
    expect(shortPhrase(pedido(datos))).toBe(corta);
  });
});

describe("sortByProgress", () => {
  it("puts the most advanced orders first and the unpaid ones last, newest first among equals", () => {
    const pedidos = [
      pedido({ id: "sin pagar", paymentStatus: "pending", date: "2026-11-05" }),
      pedido({ id: "preparando", estado: "confirmed", date: "2026-11-01" }),
      pedido({ id: "en camino", estado: "shipped", date: "2026-10-01" }),
      pedido({ id: "entregado", estado: "delivered", date: "2026-11-06" }),
      pedido({ id: "empaquetando viejo", estado: "packing", date: "2026-10-02" }),
      pedido({ id: "empaquetando nuevo", estado: "packing", date: "2026-10-20" }),
      pedido({ id: "sin fecha", estado: "packing" }),
    ];

    expect(sortByProgress(pedidos).map((p) => p.id)).toEqual([
      "en camino",
      "empaquetando nuevo",
      "empaquetando viejo",
      "sin fecha",
      "preparando",
      "entregado",
      "sin pagar",
    ]);
  });

  it("does not reorder the original list", () => {
    const pedidos = [pedido({ id: 1, estado: "confirmed" }), pedido({ id: 2, estado: "shipped" })];

    sortByProgress(pedidos);

    expect(pedidos.map((p) => p.id)).toEqual([1, 2]);
  });
});

describe("formatting", () => {
  it.each([
    [[], ""],
    [undefined, ""],
    [[{ displayName: "Disco" }], "Disco"],
    [[{ displayName: "" }], "Producto"],
    [[{ displayName: "Disco" }, { displayName: "Pastillas" }], "Disco y 1 producto más"],
    [[{ displayName: "Disco" }, {}, {}], "Disco y 2 productos más"],
  ])("summarises the products %#", (items, texto) => {
    expect(productsText(items)).toBe(texto);
  });

  it("formats a price in pesos and treats a missing one as zero", () => {
    expect(formatPrice(4900)).toMatch(/4[.\s]?900/);
    expect(formatPrice(undefined)).toMatch(/\b0\b/);
  });

  it("says when a date is missing", () => {
    expect(formatDate(null)).toBe("Fecha no disponible");
    expect(formatDate("2026-11-01T12:00:00")).toMatch(/01\/11\/2026/);
  });
});
