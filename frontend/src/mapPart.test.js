// Tests de la conversión de repuestos del backend a la pantalla.

import {
  PLACEHOLDER_IMAGE,
  mapCategory,
  mapCartItem,
  mapPart,
  useGenericImage,
} from "./mapPart";

describe("mapPart", () => {
  it("adapts the backend part shape and preserves a numeric API id", () => {
    expect(
      mapPart({
        id: 42,
        name: "Pastillas de freno",
        manufacturer: "Brembo",
        part_code: "PF-42",
        category: "Frenos",
        price: 1299.5,
        stock: 8,
        compatible_brands: ["Chevrolet", "Volkswagen"],
        description: "Pastillas de freno Brembo, para Chevrolet Onix.",
        specifications: [["Material", "Cerámico"], ["Espesor", "17 mm"]],
        warranty_months: 12,
        warranty_provider: "fabricante",
        compatibilities: [
          { brand: "Chevrolet", model: "Onix", engine_code: "1.4 8V", year_from: 2013, year_to: 2019 },
          { brand: "Volkswagen", model: "Gol", engine_code: "1.6 MSI", year_from: 2020, year_to: 2020 },
        ],
      })
    ).toEqual({
      id: "42",
      partId: 42,
      displayName: "Pastillas de freno",
      fabricante: "Brembo",
      code: "PF-42",
      categoria: "Frenos",
      price: 1299.5,
      stock: 8,
      marca: "Chevrolet Volkswagen",
      primaryBrand: "Chevrolet",
      brands: ["Chevrolet", "Volkswagen"],
      models: [],
      compatibilidades: [
        { brand: "Chevrolet", model: "Onix", engine_code: "1.4 8V", year_from: 2013, year_to: 2019 },
        { brand: "Volkswagen", model: "Gol", engine_code: "1.6 MSI", year_from: 2020, year_to: 2020 },
      ],
      description: "Pastillas de freno Brembo, para Chevrolet Onix.",
      specifications: [["Material", "Cerámico"], ["Espesor", "17 mm"]],
      garantia: "12 meses de garantía del fabricante (Brembo), por defectos de fabricación.",
      monthsWarranty: 12,
      warrantyProvider: "fabricante",
      fitments: ["Chevrolet Onix 1.4 8V (2013–2019)", "Volkswagen Gol 1.6 MSI (2020)"],
      image: "/repuestos/pastillas-freno.webp",
      imagesExtra: ["/repuestos/pastillas-freno-vista.webp"],
    });
  });

  it("uses UI defaults when optional backend values are missing", () => {
    expect(mapPart({ id: 0 })).toEqual({
      id: "0",
      partId: 0,
      displayName: "",
      fabricante: "",
      code: "",
      categoria: "",
      price: 0,
      stock: 0,
      marca: "",
      primaryBrand: "",
      brands: [],
      models: [],
      compatibilidades: [],
      description: "",
      specifications: [],
      garantia: "",
      monthsWarranty: null,
      warrantyProvider: null,
      fitments: [],
      image: PLACEHOLDER_IMAGE,
      imagesExtra: [],
    });
  });

  it("says when the warranty is covered by the store instead of the manufacturer", () => {
    expect(
      mapPart({ id: 1, manufacturer: "Fram", warranty_months: 6, warranty_provider: "vendedor" }).garantia
    ).toBe("6 meses de garantía del vendedor (AutoBought), por defectos de fabricación.");
  });
});

describe("mapCartItem", () => {
  it("translates a backend cart item and normalizes its ID", () => {
    expect(
      mapCartItem({
        part_id: 17,
        part_code: "FIL-0017",
        name: "Filtro de aceite",
        price: 750,
        amount: 2,
        subtotal: 1500,
        stock: 6,
        category: "Motor",
      })
    ).toEqual({
      id: "17",
      partId: 17,
      code: "FIL-0017",
      displayName: "Filtro de aceite",
      price: 750,
      quantity: 2,
      subtotal: 1500,
      stock: 6,
      categoria: "Motor",
      image: "/repuestos/filtro-aceite.webp",
    });
  });

  it("defaults missing nullable cart values", () => {
    expect(mapCartItem({ part_id: 9 })).toEqual({
      id: "9",
      partId: 9,
      code: "",
      displayName: "",
      price: 0,
      quantity: 0,
      subtotal: 0,
      stock: 0,
      categoria: "",
      image: PLACEHOLDER_IMAGE,
    });
  });
});

describe("mapCategory", () => {
  it("maps backend category names and counts", () => {
    expect(mapCategory({ name: "Frenos", count: 12 })).toEqual({
      displayName: "Frenos",
      quantity: 12,
    });
  });

  it("defaults missing category values", () => {
    expect(mapCategory({})).toEqual({ displayName: "", quantity: 0 });
  });
});

describe("useGenericImage", () => {
  it("swaps a broken image for the generic one", () => {
    const image = document.createElement("img");
    image.src = "/repuestos/no-existe.webp";

    useGenericImage({ currentTarget: image });

    expect(image.getAttribute("src")).toBe(PLACEHOLDER_IMAGE);
  });

  it("does not loop when the generic image itself fails", () => {
    const image = document.createElement("img");
    image.src = PLACEHOLDER_IMAGE;

    useGenericImage({ currentTarget: image });

    expect(image.getAttribute("src")).toBe(PLACEHOLDER_IMAGE);
  });

  it("protects again when the same <img> switches to another image that also fails", () => {
    const image = document.createElement("img");
    image.src = "/repuestos/no-existe.webp";
    useGenericImage({ currentTarget: image });
    expect(image.getAttribute("src")).toBe(PLACEHOLDER_IMAGE);

    // React reutiliza el <img> y le cambia el src a otra imagen rota.
    image.src = "/repuestos/otra-que-no-existe.webp";
    useGenericImage({ currentTarget: image });

    expect(image.getAttribute("src")).toBe(PLACEHOLDER_IMAGE);
  });
});
