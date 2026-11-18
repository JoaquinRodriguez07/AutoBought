import { facetCounts, filterParts } from "./filterParts";

const pastillas = {
  displayName: "Pastillas de freno",
  code: "FRE-001",
  fabricante: "Bosch",
  categoria: "Frenos",
  price: 3000,
  marca: "Chevrolet Fiat",
  brands: ["Chevrolet", "Fiat"],
  models: ["Onix", "Cronos"],
  stock: 4,
};
const bujia = {
  displayName: "Bujía",
  code: "ENC-002",
  fabricante: "NGK",
  categoria: "Encendido",
  price: 500,
  marca: "Toyota",
  brands: ["Toyota"],
  models: ["Hilux"],
  stock: 0,
};
const aceite = {
  displayName: "Aceite",
  code: "LUB-003",
  fabricante: "Shell",
  categoria: "Lubricantes",
  price: 1500,
  marca: "Fiat",
  brands: ["Fiat"],
  models: ["Cronos"],
  stock: 9,
};
const catalogo = [pastillas, bujia, aceite];
const nombres = (lista) => lista.map((p) => p.displayName);

it("returns an empty list when there are no products", () => {
  expect(filterParts(null)).toEqual([]);
  expect(filterParts(undefined, { search: "freno" })).toEqual([]);
});

it("returns a new array and does not reorder the original", () => {
  const original = [...catalogo];

  const resultado = filterParts(original, { sort: "Menor precio" });

  expect(resultado).not.toBe(original);
  expect(original).toEqual(catalogo);
});

describe("text search", () => {
  it("ignores case and accents", () => {
    expect(nombres(filterParts(catalogo, { search: "BUJIA" }))).toEqual(["Bujía"]);
  });

  it("needs every word, in any order, across different fields", () => {
    expect(nombres(filterParts(catalogo, { search: "onix pastillas" }))).toEqual(["Pastillas de freno"]);
    expect(filterParts(catalogo, { search: "onix aceite" })).toEqual([]);
  });

  it("finds a part by any of its compatible brands, not only the first one", () => {
    expect(nombres(filterParts(catalogo, { search: "fiat" }))).toEqual(["Pastillas de freno", "Aceite"]);
  });

  it("finds a part by a partial code", () => {
    expect(nombres(filterParts(catalogo, { search: "lub-0" }))).toEqual(["Aceite"]);
  });

  it("takes precedence over the selected category", () => {
    expect(nombres(filterParts(catalogo, { categoria: "Frenos", search: "aceite" }))).toEqual(["Aceite"]);
  });

  it("treats a search with only spaces as empty", () => {
    expect(nombres(filterParts(catalogo, { categoria: "Frenos", search: "   " }))).toEqual([
      "Pastillas de freno",
    ]);
  });
});

describe("filters", () => {
  it("filters by category", () => {
    expect(nombres(filterParts(catalogo, { categoria: "Encendido" }))).toEqual(["Bujía"]);
  });

  it("filters by the checked manufacturers", () => {
    expect(nombres(filterParts(catalogo, { manufacturers: ["Bosch", "Shell"] }))).toEqual([
      "Pastillas de freno",
      "Aceite",
    ]);
  });

  it("filters by the checked car brands", () => {
    expect(nombres(filterParts(catalogo, { brandsCar: ["Toyota"] }))).toEqual(["Bujía"]);
  });

  it("includes both price limits", () => {
    expect(nombres(filterParts(catalogo, { priceMin: 500, priceMax: "1500" }))).toEqual(["Bujía", "Aceite"]);
  });

  it.each(["", null, undefined])("treats a price of %p as no limit", (precio) => {
    expect(filterParts(catalogo, { priceMin: precio, priceMax: precio })).toHaveLength(3);
  });

  it("keeps a limit of zero", () => {
    expect(filterParts(catalogo, { priceMax: 0 })).toEqual([]);
  });

  it("hides the parts without stock on request", () => {
    expect(nombres(filterParts(catalogo, { onlyWithStock: true }))).toEqual(["Pastillas de freno", "Aceite"]);
  });

  it("treats a part without stock data as out of stock", () => {
    expect(filterParts([{ ...aceite, stock: undefined }], { onlyWithStock: true })).toEqual([]);
  });
});

describe("order", () => {
  it("sorts by lowest price", () => {
    expect(nombres(filterParts(catalogo, { sort: "Menor precio" }))).toEqual([
      "Bujía",
      "Aceite",
      "Pastillas de freno",
    ]);
  });

  it("sorts by highest price", () => {
    expect(nombres(filterParts(catalogo, { sort: "Mayor precio" }))).toEqual([
      "Pastillas de freno",
      "Aceite",
      "Bujía",
    ]);
  });

  it("sorts by name with accents in their place", () => {
    expect(nombres(filterParts(catalogo, { sort: "Nombre A-Z" }))).toEqual([
      "Aceite",
      "Bujía",
      "Pastillas de freno",
    ]);
  });

  it("puts the best sellers first, in their order, and keeps the rest as they were", () => {
    const withIds = [
      { id: "1", displayName: "Pastillas" },
      { id: "2", displayName: "Bujía" },
      { id: "3", displayName: "Aceite" },
      { id: "4", displayName: "Filtro" },
    ];
    expect(nombres(filterParts(withIds, { sort: "Más vendidos", bestSellerIds: [3, 2] }))).toEqual([
      "Aceite",
      "Bujía",
      "Pastillas",
      "Filtro",
    ]);
  });

  it("keeps the original order for any other value", () => {
    expect(nombres(filterParts(catalogo, { sort: "Relevancia" }))).toEqual(nombres(catalogo));
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
    expect(filterParts([crudo], { search: "mann dacia duster fil-010 filtros" })).toEqual([crudo]);
  });

  it("filters through the backend fields", () => {
    expect(
      filterParts([crudo], {
        categoria: "Filtros",
        manufacturers: ["Mann"],
        brandsCar: ["Renault"],
        priceMin: 800,
        onlyWithStock: true,
      })
    ).toEqual([crudo]);
  });

  it("tolerates a part with no data at all", () => {
    expect(filterParts([{}], { search: "x" })).toEqual([]);
    expect(filterParts([{}], { categoria: "Frenos" })).toEqual([]);
    expect(filterParts([{}], { brandsCar: ["Fiat"] })).toEqual([]);
    expect(filterParts([{}], { priceMin: 1 })).toEqual([]);
    expect(filterParts([{}, {}], { sort: "Nombre A-Z" })).toHaveLength(2);
  });
});

describe("facetCounts", () => {
  it("counts every option with no filters", () => {
    const counts = facetCounts(catalogo);

    expect(counts.manufacturers).toEqual([["Bosch", 1], ["NGK", 1], ["Shell", 1]]);
    expect(counts.brandsCar).toEqual([["Chevrolet", 1], ["Fiat", 2], ["Toyota", 1]]);
    expect(counts.withStock).toBe(2);
  });

  it("counts each group with the other filters applied", () => {
    const counts = facetCounts(catalogo, { onlyWithStock: true, priceMax: 2000 });

    // Solo el aceite tiene stock y cuesta hasta 2000: NGK y Bosch no aparecen.
    expect(counts.manufacturers).toEqual([["Shell", 1]]);
    expect(counts.brandsCar).toEqual([["Fiat", 1]]);
    // El grupo de stock no se cuenta contra sí mismo, pero sí contra el precio.
    expect(counts.withStock).toBe(1);
  });

  it("does not let an option narrow the counts of its own group", () => {
    const counts = facetCounts(catalogo, { manufacturers: ["Bosch"] });

    // Se puede sumar NGK o Shell a Bosch: siguen apareciendo.
    expect(counts.manufacturers).toEqual([["Bosch", 1], ["NGK", 1], ["Shell", 1]]);
    // Las otras secciones sí se cuentan con Bosch tildado.
    expect(counts.brandsCar).toEqual([["Chevrolet", 1], ["Fiat", 1]]);
  });

  it("keeps a checked option even when nothing is left for it", () => {
    const counts = facetCounts(catalogo, { brandsCar: ["Renault"], manufacturers: ["Peugeot"] });

    expect(counts.brandsCar).toContainEqual(["Renault", 0]);
    expect(counts.manufacturers).toContainEqual(["Peugeot", 0]);
  });
});
