import {
  IMAGEN_PLACEHOLDER,
  mapearCategoria,
  mapearItemCarrito,
  mapearRepuesto,
} from "./mapearRepuesto";

describe("mapearRepuesto", () => {
  it("adapts the backend part shape and preserves a numeric API id", () => {
    expect(
      mapearRepuesto({
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
      nombre: "Pastillas de freno",
      fabricante: "Brembo",
      codigo: "PF-42",
      categoria: "Frenos",
      precio: 1299.5,
      stock: 8,
      marca: "Chevrolet Volkswagen",
      marcaPrincipal: "Chevrolet",
      marcas: ["Chevrolet", "Volkswagen"],
      modelos: [],
      compatibilidades: [
        { brand: "Chevrolet", model: "Onix", engine_code: "1.4 8V", year_from: 2013, year_to: 2019 },
        { brand: "Volkswagen", model: "Gol", engine_code: "1.6 MSI", year_from: 2020, year_to: 2020 },
      ],
      descripcion: "Pastillas de freno Brembo, para Chevrolet Onix.",
      especificaciones: [["Material", "Cerámico"], ["Espesor", "17 mm"]],
      garantia: "12 meses de garantía del fabricante (Brembo), por defectos de fabricación.",
      garantiaMeses: 12,
      proveedorGarantia: "fabricante",
      aplicaciones: ["Chevrolet Onix 1.4 8V (2013–2019)", "Volkswagen Gol 1.6 MSI (2020)"],
      imagen: IMAGEN_PLACEHOLDER,
    });
  });

  it("uses UI defaults when optional backend values are missing", () => {
    expect(mapearRepuesto({ id: 0 })).toEqual({
      id: "0",
      partId: 0,
      nombre: "",
      fabricante: "",
      codigo: "",
      categoria: "",
      precio: 0,
      stock: 0,
      marca: "",
      marcaPrincipal: "",
      marcas: [],
      modelos: [],
      compatibilidades: [],
      descripcion: "",
      especificaciones: [],
      garantia: "",
      garantiaMeses: null,
      proveedorGarantia: null,
      aplicaciones: [],
      imagen: IMAGEN_PLACEHOLDER,
    });
  });

  it("says when the warranty is covered by the store instead of the manufacturer", () => {
    expect(
      mapearRepuesto({ id: 1, manufacturer: "Fram", warranty_months: 6, warranty_provider: "vendedor" }).garantia
    ).toBe("6 meses de garantía del vendedor (AutoBought), por defectos de fabricación.");
  });
});

describe("mapearItemCarrito", () => {
  it("translates a backend cart item and normalizes its ID", () => {
    expect(
      mapearItemCarrito({
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
      codigo: "FIL-0017",
      nombre: "Filtro de aceite",
      precio: 750,
      cantidad: 2,
      subtotal: 1500,
      stock: 6,
      categoria: "Motor",
      imagen: IMAGEN_PLACEHOLDER,
    });
  });

  it("defaults missing nullable cart values", () => {
    expect(mapearItemCarrito({ part_id: 9 })).toEqual({
      id: "9",
      partId: 9,
      codigo: "",
      nombre: "",
      precio: 0,
      cantidad: 0,
      subtotal: 0,
      stock: 0,
      categoria: "",
      imagen: IMAGEN_PLACEHOLDER,
    });
  });
});

describe("mapearCategoria", () => {
  it("maps backend category names and counts", () => {
    expect(mapearCategoria({ name: "Frenos", count: 12 })).toEqual({
      nombre: "Frenos",
      cantidad: 12,
    });
  });

  it("defaults missing category values", () => {
    expect(mapearCategoria({})).toEqual({ nombre: "", cantidad: 0 });
  });
});
