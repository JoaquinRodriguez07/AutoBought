import { extraerIdProducto, slugificarProducto } from "./slugProducto";

describe("slugificarProducto", () => {
  it("normalizes accents, punctuation, spaces, and decimal points", () => {
    expect(slugificarProducto("Kit de distribución Gates 1.4 8V", 5))
      .toBe("kit-de-distribucion-gates-1-4-8v-5");
  });

  it("keeps products with duplicate names unique using their database IDs", () => {
    const first = slugificarProducto("Filtro de aceite", 12);
    const second = slugificarProducto("Filtro de aceite", 13);

    expect(first).toBe("filtro-de-aceite-12");
    expect(second).toBe("filtro-de-aceite-13");
    expect(first).not.toBe(second);
  });

  it("extracts the stable ID and continues accepting legacy numeric URLs", () => {
    expect(extraerIdProducto("kit-de-distribucion-gates-1-4-8v-5")).toBe("5");
    expect(extraerIdProducto("5")).toBe("5");
    expect(extraerIdProducto("producto-sin-id")).toBeNull();
  });

  it("uses a neutral base when the product name has no slug characters", () => {
    expect(slugificarProducto("!!!", 42)).toBe("repuesto-42");
    expect(slugificarProducto("Kit de distribución", "sin-id")).toBeNull();
  });
});
