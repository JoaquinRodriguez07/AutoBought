// Tests de las imágenes de los repuestos.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  PART_TYPES,
  toSlug,
  imageForType,
  expectedImages,
  extraImagesForType,
  partTypeOf,
  expectedViews,
} from "./partImages";
import { PLACEHOLDER_IMAGE, partImage } from "./mapPart";

const RAIZ_FRONTEND = join(__dirname, "..");
const CATALOGO = join(RAIZ_FRONTEND, "..", "backend", "data", "parts.json");

describe("partTypeOf", () => {
  it("recognizes the type by how the name starts, whatever the manufacturer", () => {
    expect(partTypeOf("Discos de freno delanteros Brembo").archivo).toBe("discos-freno");
    expect(partTypeOf("Bujía NGK 1.4 8V").archivo).toBe("bujia");
    expect(partTypeOf("Batería 12V 90Ah Willard").archivo).toBe("bateria");
  });

  it("returns null for an unknown or missing name", () => {
    expect(partTypeOf("Volante deportivo")).toBeNull();
    expect(partTypeOf(undefined)).toBeNull();
  });
});

describe("partImage", () => {
  it("uses the base image of the type for its main manufacturer", () => {
    expect(imageForType("Radiador Valeo")).toBe("/repuestos/radiador.webp");
    expect(partImage("Bujía NGK 1.4 8V")).toBe("/repuestos/bujia.webp");
  });

  it("uses the manufacturer's version for the other manufacturers", () => {
    expect(imageForType("Radiador Nissens")).toBe("/repuestos/radiador-nissens.webp");
    expect(imageForType("Batería 12V 90Ah Willard")).toBe("/repuestos/bateria-willard.webp");
    // NGK es el principal de las bujías, pero no de las bobinas.
    expect(imageForType("Bobina de encendido NGK 1.4 8V")).toBe("/repuestos/bobina-encendido-ngk.webp");
  });

  it("falls back to the generic image when the type is unknown", () => {
    expect(partImage("Volante deportivo")).toBe(PLACEHOLDER_IMAGE);
    expect(partImage("")).toBe(PLACEHOLDER_IMAGE);
  });
});

describe("extraImagesForType", () => {
  it("adds the second view of the part's own image", () => {
    expect(extraImagesForType("Batería 12V 90Ah Willard")).toEqual(["/repuestos/bateria-willard-vista.webp"]);
    expect(extraImagesForType("Radiador Valeo")).toEqual(["/repuestos/radiador-vista.webp"]);
    expect(extraImagesForType("Volante deportivo")).toEqual([]);
  });
});

describe("toSlug", () => {
  it("turns a manufacturer into a file name", () => {
    expect(toSlug("Mann-Filter")).toBe("mann-filter");
    expect(toSlug("Fábrica Única")).toBe("fabrica-unica");
  });
});

describe("TIPOS_REPUESTO", () => {
  it("has unique file names without accents or spaces", () => {
    const archivos = PART_TYPES.map((tipo) => tipo.archivo);
    expect(new Set(archivos).size).toBe(archivos.length);
    archivos.forEach((archivo) => expect(archivo).toMatch(/^[a-z0-9-]+$/));
  });

  it("covers every part of the catalog, and every manufacturer has its image", () => {
    const { parts } = JSON.parse(readFileSync(CATALOGO, "utf-8"));
    const withoutType = parts.filter((part) => !partTypeOf(part.name)).map((part) => part.name);
    expect(withoutType).toEqual([]);

    // Cada fabricante del catálogo es el principal (imagen base) o tiene su versión.
    const expected = new Set(expectedImages().map((image) => `/repuestos/${image.archivo}.webp`));
    const withoutOwnImage = parts.filter((part) => !expected.has(imageForType(part.name)));
    expect(withoutOwnImage).toEqual([]);

    const combinations = new Set(parts.map((part) => imageForType(part.name)));
    expect(combinations.size).toBe(expectedImages().length);
  });

  it("has a second view description for every type", () => {
    PART_TYPES.forEach((tipo) => expect(tipo.vista).toEqual(expect.any(String)));
    expect(expectedViews()).toHaveLength(expectedImages().length);
  });

  it("has a generated second view for every image", () => {
    const faltan = expectedViews()
      .filter((vista) => !existsSync(join(RAIZ_FRONTEND, "public", "repuestos", `${vista.archivo}.webp`)))
      .map((vista) => vista.archivo);

    expect(faltan).toEqual([]);
  });

  it("has a generated image for every type and manufacturer", () => {
    const faltan = expectedImages()
      .filter((image) => !existsSync(join(RAIZ_FRONTEND, "public", "repuestos", `${image.archivo}.webp`)))
      .map((image) => image.archivo);

    expect(faltan).toEqual([]);
  });
});
