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
        part_code: "PF-42",
        category: "Frenos",
        price: 1299.5,
        stock: 8,
        compatible_brands: ["Chevrolet", "Volkswagen"],
      })
    ).toEqual({
      id: "42",
      partId: 42,
      nombre: "Pastillas de freno",
      codigo: "PF-42",
      categoria: "Frenos",
      precio: 1299.5,
      stock: 8,
      marca: "Chevrolet Volkswagen",
      marcaPrincipal: "Chevrolet",
      imagen: IMAGEN_PLACEHOLDER,
    });
  });

  it("uses UI defaults when optional backend values are missing", () => {
    expect(mapearRepuesto({ id: 0 })).toEqual({
      id: "0",
      partId: 0,
      nombre: "",
      codigo: "",
      categoria: "",
      precio: 0,
      stock: 0,
      marca: "",
      marcaPrincipal: "",
      imagen: IMAGEN_PLACEHOLDER,
    });
  });
});

describe("mapearItemCarrito", () => {
  it("translates a backend cart item and normalizes its ID", () => {
    expect(
      mapearItemCarrito({
        part_id: 17,
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
