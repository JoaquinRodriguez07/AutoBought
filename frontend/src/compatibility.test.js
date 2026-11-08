import { compatibilitiesOf, isCompatible, normalizeText, productIsCompatible } from "./compatibility";

// true: compatible. false: no lo es. null: no se puede afirmar ninguna de las dos.

describe("normalizeText", () => {
  it("trims, collapses spaces and lowercases", () => {
    expect(normalizeText("  CHEVROLET   Onix ")).toBe("chevrolet onix");
  });

  it.each([undefined, null, "", "   "])("turns %p into an empty string", (valor) => {
    expect(normalizeText(valor)).toBe("");
  });
});

describe("compatibilitiesOf", () => {
  it("prefers the structured compatibilities over the text fitments", () => {
    expect(compatibilitiesOf({ compatibilidades: [{ brand: "Fiat" }], fitments: ["Toyota Hilux"] })).toEqual([
      { brand: "Fiat", formatText: false },
    ]);
  });

  it("falls back to the text fitments, trimmed and without blanks or non-text values", () => {
    expect(compatibilitiesOf({ compatibilidades: [], fitments: ["  Fiat Cronos ", "   ", 5, null] })).toEqual([
      { texto: "Fiat Cronos", formatText: true },
    ]);
  });

  it.each([
    ["no product", undefined],
    ["data that is not a list", { compatibilidades: null, fitments: "Fiat Cronos" }],
  ])("returns nothing for %s", (_caso, producto) => {
    expect(compatibilitiesOf(producto)).toEqual([]);
  });
});

describe("isCompatible", () => {
  it("cannot tell without a vehicle or without compatibility data", () => {
    expect(isCompatible([{ brand: "Fiat", formatText: false }], null)).toBeNull();
    expect(isCompatible([{ brand: "Fiat", formatText: false }], { brand: "  " })).toBeNull();
    expect(isCompatible([], { brand: "Fiat" })).toBeNull();
  });
});

describe("compatibility with text fitments", () => {
  const producto = { fitments: ["Fiat Cronos 2018", "Fiat Palio"] };

  it.each([
    ["another brand", { brand: "Toyota" }, false],
    ["only the brand", { brand: "Fiat" }, true],
    ["brand and model without a year", { brand: "Fiat", model: "Cronos" }, true],
    ["another model", { brand: "Fiat", model: "Uno" }, false],
    ["the year in the text", { brand: "Fiat", model: "Cronos", year: "2018" }, true],
    ["a year other than the one in the text", { brand: "Fiat", model: "Cronos", year: "2019" }, false],
    ["a text that names no year", { brand: "Fiat", model: "Palio", year: "2010" }, null],
  ])("gives the right verdict for %s", (_caso, vehiculo, esperado) => {
    expect(productIsCompatible(producto, vehiculo)).toBe(esperado);
  });

  it("ignores case and extra spaces in the vehicle", () => {
    expect(productIsCompatible(producto, { brand: "  FIAT ", model: " cronos  ", year: "2018" })).toBe(true);
  });
});

describe("compatibility with structured data", () => {
  const onix = { brand: "Chevrolet", model: "Onix", year_from: 2013, year_to: 2019 };
  const con = (...compatibilidades) => ({ compatibilidades });

  it.each([
    ["no brand in the data", con({ brand: "" }), { brand: "Chevrolet" }, null],
    ["another brand", con(onix), { brand: "Fiat" }, false],
    ["only the brand", con(onix), { brand: "Chevrolet" }, true],
    ["no model in the data", con({ brand: "Chevrolet" }), { brand: "Chevrolet", model: "Onix" }, null],
    ["another model", con(onix), { brand: "Chevrolet", model: "Prisma" }, false],
    ["brand and model without a year", con(onix), { brand: "Chevrolet", model: "Onix" }, true],
    ["the first year of the range", con(onix), { brand: "Chevrolet", model: "Onix", year: "2013" }, true],
    ["the last year of the range", con(onix), { brand: "Chevrolet", model: "Onix", year: "2019" }, true],
    ["a year before the range", con(onix), { brand: "Chevrolet", model: "Onix", year: "2012" }, false],
    ["a year after the range", con(onix), { brand: "Chevrolet", model: "Onix", year: "2020" }, false],
    ["a range without its start", con({ ...onix, year_from: null }), { brand: "Chevrolet", model: "Onix", year: "2015" }, null],
    ["a range without its end", con({ ...onix, year_to: undefined }), { brand: "Chevrolet", model: "Onix", year: "2015" }, null],
    ["years that are not numbers", con({ ...onix, year_from: "x" }), { brand: "Chevrolet", model: "Onix", year: "2015" }, null],
    ["a reversed range", con({ ...onix, year_from: 2019, year_to: 2013 }), { brand: "Chevrolet", model: "Onix", year: "2015" }, null],
    [
      "a second row that matches",
      con({ ...onix, year_to: 2014 }, { ...onix, year_from: 2015 }),
      { brand: "Chevrolet", model: "Onix", year: "2016" },
      true,
    ],
    [
      "a row that matches after one without data",
      con({ brand: "" }, onix),
      { brand: "Chevrolet", model: "Onix", year: "2016" },
      true,
    ],
  ])("gives the right verdict for %s", (_caso, producto, vehiculo, esperado) => {
    expect(productIsCompatible(producto, vehiculo)).toBe(esperado);
  });

  it("says it is not compatible only when every row was checked", () => {
    expect(productIsCompatible(con({ ...onix, year_to: 2014 }, { brand: "Fiat" }), { brand: "Chevrolet", model: "Onix", year: "2016" })).toBe(false);
  });
});
