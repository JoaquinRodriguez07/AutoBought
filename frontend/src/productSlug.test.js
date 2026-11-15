// Tests de las direcciones de los repuestos.

import { extractProductId, slugifyProduct } from "./productSlug";

describe("slugifyProduct", () => {
  it("normalizes accents, punctuation, spaces, and decimal points", () => {
    expect(slugifyProduct("Kit de distribución Gates 1.4 8V", 5))
      .toBe("kit-de-distribucion-gates-1-4-8v-5");
  });

  it("keeps products with duplicate names unique using their database IDs", () => {
    const first = slugifyProduct("Filtro de aceite", 12);
    const second = slugifyProduct("Filtro de aceite", 13);

    expect(first).toBe("filtro-de-aceite-12");
    expect(second).toBe("filtro-de-aceite-13");
    expect(first).not.toBe(second);
  });

  it("extracts the stable ID and continues accepting legacy numeric URLs", () => {
    expect(extractProductId("kit-de-distribucion-gates-1-4-8v-5")).toBe("5");
    expect(extractProductId("5")).toBe("5");
    expect(extractProductId("producto-sin-id")).toBeNull();
  });

  it("uses a neutral base when the product name has no slug characters", () => {
    expect(slugifyProduct("!!!", 42)).toBe("repuesto-42");
    expect(slugifyProduct("Kit de distribución", "sin-id")).toBeNull();
  });
});
