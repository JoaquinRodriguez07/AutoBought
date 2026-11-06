import { filtrarRepuestos } from "./filtrarRepuestos";

const pastillas = {
  nombre: "Pastillas de freno",
  codigo: "FRE-001",
  fabricante: "Bosch",
  categoria: "Frenos",
  precio: 3000,
  marca: "Chevrolet Fiat",
  marcas: ["Chevrolet", "Fiat"],
  modelos: ["Onix", "Cronos"],
  stock: 4,
};
const bujia = {
  nombre: "Bujía",
  codigo: "ENC-002",
  fabricante: "NGK",
  categoria: "Encendido",
  precio: 500,
  marca: "Toyota",
  marcas: ["Toyota"],
  modelos: ["Hilux"],
  stock: 0,
};
const aceite = {
  nombre: "Aceite",
  codigo: "LUB-003",
  fabricante: "Shell",
  categoria: "Lubricantes",
  precio: 1500,
  marca: "Fiat",
  marcas: ["Fiat"],
  modelos: ["Cronos"],
  stock: 9,
};
const catalogo = [pastillas, bujia, aceite];
const nombres = (lista) => lista.map((p) => p.nombre);

it("returns an empty list when there are no products", () => {
  expect(filtrarRepuestos(null)).toEqual([]);
  expect(filtrarRepuestos(undefined, { busqueda: "freno" })).toEqual([]);
});

it("returns a new array and does not reorder the original", () => {
  const original = [...catalogo];

  const resultado = filtrarRepuestos(original, { orden: "Menor precio" });

  expect(resultado).not.toBe(original);
  expect(original).toEqual(catalogo);
});

describe("text search", () => {
  it("ignores case and accents", () => {
    expect(nombres(filtrarRepuestos(catalogo, { busqueda: "BUJIA" }))).toEqual(["Bujía"]);
  });

  it("needs every word, in any order, across different fields", () => {
    expect(nombres(filtrarRepuestos(catalogo, { busqueda: "onix pastillas" }))).toEqual(["Pastillas de freno"]);
    expect(filtrarRepuestos(catalogo, { busqueda: "onix aceite" })).toEqual([]);
  });

  it("finds a part by any of its compatible brands, not only the first one", () => {
    expect(nombres(filtrarRepuestos(catalogo, { busqueda: "fiat" }))).toEqual(["Pastillas de freno", "Aceite"]);
  });

  it("finds a part by a partial code", () => {
    expect(nombres(filtrarRepuestos(catalogo, { busqueda: "lub-0" }))).toEqual(["Aceite"]);
  });

  it("takes precedence over the selected category", () => {
    expect(nombres(filtrarRepuestos(catalogo, { categoria: "Frenos", busqueda: "aceite" }))).toEqual(["Aceite"]);
  });

  it("treats a search with only spaces as empty", () => {
    expect(nombres(filtrarRepuestos(catalogo, { categoria: "Frenos", busqueda: "   " }))).toEqual([
      "Pastillas de freno",
    ]);
  });
});

describe("filters", () => {
  it("filters by category", () => {
    expect(nombres(filtrarRepuestos(catalogo, { categoria: "Encendido" }))).toEqual(["Bujía"]);
  });

  it("filters by the checked manufacturers", () => {
    expect(nombres(filtrarRepuestos(catalogo, { fabricantes: ["Bosch", "Shell"] }))).toEqual([
      "Pastillas de freno",
      "Aceite",
    ]);
  });

  it("filters by the checked car brands", () => {
    expect(nombres(filtrarRepuestos(catalogo, { marcasAuto: ["Toyota"] }))).toEqual(["Bujía"]);
  });

  it("includes both price limits", () => {
    expect(nombres(filtrarRepuestos(catalogo, { precioMin: 500, precioMax: "1500" }))).toEqual(["Bujía", "Aceite"]);
  });

  it.each(["", null, undefined])("treats a price of %p as no limit", (precio) => {
    expect(filtrarRepuestos(catalogo, { precioMin: precio, precioMax: precio })).toHaveLength(3);
  });

  it("keeps a limit of zero", () => {
    expect(filtrarRepuestos(catalogo, { precioMax: 0 })).toEqual([]);
  });

  it("hides the parts without stock on request", () => {
    expect(nombres(filtrarRepuestos(catalogo, { soloConStock: true }))).toEqual(["Pastillas de freno", "Aceite"]);
  });

  it("treats a part without stock data as out of stock", () => {
    expect(filtrarRepuestos([{ ...aceite, stock: undefined }], { soloConStock: true })).toEqual([]);
  });
});

describe("order", () => {
  it("sorts by lowest price", () => {
    expect(nombres(filtrarRepuestos(catalogo, { orden: "Menor precio" }))).toEqual([
      "Bujía",
      "Aceite",
      "Pastillas de freno",
    ]);
  });

  it("sorts by highest price", () => {
    expect(nombres(filtrarRepuestos(catalogo, { orden: "Mayor precio" }))).toEqual([
      "Pastillas de freno",
      "Aceite",
      "Bujía",
    ]);
  });

  it("sorts by name with accents in their place", () => {
    expect(nombres(filtrarRepuestos(catalogo, { orden: "Nombre A-Z" }))).toEqual([
      "Aceite",
      "Bujía",
      "Pastillas de freno",
    ]);
  });

  it("keeps the original order for any other value", () => {
    expect(nombres(filtrarRepuestos(catalogo, { orden: "Relevancia" }))).toEqual(nombres(catalogo));
  });
});

describe("raw backend shape", () => {
  const crudo = {
    name: "Filtro",
    part_code: "FIL-010",
    manufacturer: "Mann",
    category: "Filtros",
    price: 800,
    compatible_brands: ["Renault", "Dacia"],
    compatible_models: ["Duster"],
    stock: 2,
  };

  it("searches through the backend fields", () => {
    expect(filtrarRepuestos([crudo], { busqueda: "mann dacia duster fil-010 filtros" })).toEqual([crudo]);
  });

  it("filters through the backend fields", () => {
    expect(
      filtrarRepuestos([crudo], {
        categoria: "Filtros",
        fabricantes: ["Mann"],
        marcasAuto: ["Renault"],
        precioMin: 800,
        soloConStock: true,
      })
    ).toEqual([crudo]);
  });

  it("tolerates a part with no data at all", () => {
    expect(filtrarRepuestos([{}], { busqueda: "x" })).toEqual([]);
    expect(filtrarRepuestos([{}], { categoria: "Frenos" })).toEqual([]);
    expect(filtrarRepuestos([{}], { marcasAuto: ["Fiat"] })).toEqual([]);
    expect(filtrarRepuestos([{}], { precioMin: 1 })).toEqual([]);
    expect(filtrarRepuestos([{}, {}], { orden: "Nombre A-Z" })).toHaveLength(2);
  });
});
