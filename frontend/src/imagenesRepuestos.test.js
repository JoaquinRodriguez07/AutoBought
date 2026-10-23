import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { TIPOS_REPUESTO, aSlug, imagenDeTipo, imagenesEsperadas, tipoDeRepuesto } from "./imagenesRepuestos";
import { IMAGEN_PLACEHOLDER, imagenDeRepuesto } from "./mapearRepuesto";

const RAIZ_FRONTEND = join(__dirname, "..");
const CATALOGO = join(RAIZ_FRONTEND, "..", "backend", "data", "parts.json");

describe("tipoDeRepuesto", () => {
  it("recognizes the type by how the name starts, whatever the manufacturer", () => {
    expect(tipoDeRepuesto("Discos de freno delanteros Brembo").archivo).toBe("discos-freno");
    expect(tipoDeRepuesto("Bujía NGK 1.4 8V").archivo).toBe("bujia");
    expect(tipoDeRepuesto("Batería 12V 90Ah Willard").archivo).toBe("bateria");
  });

  it("returns null for an unknown or missing name", () => {
    expect(tipoDeRepuesto("Volante deportivo")).toBeNull();
    expect(tipoDeRepuesto(undefined)).toBeNull();
  });
});

describe("imagenDeRepuesto", () => {
  it("uses the base image of the type for its main manufacturer", () => {
    expect(imagenDeTipo("Radiador Valeo")).toBe("/repuestos/radiador.webp");
    expect(imagenDeRepuesto("Bujía NGK 1.4 8V")).toBe("/repuestos/bujia.webp");
  });

  it("uses the manufacturer's version for the other manufacturers", () => {
    expect(imagenDeTipo("Radiador Nissens")).toBe("/repuestos/radiador-nissens.webp");
    expect(imagenDeTipo("Batería 12V 90Ah Willard")).toBe("/repuestos/bateria-willard.webp");
    // NGK es el principal de las bujías, pero no de las bobinas.
    expect(imagenDeTipo("Bobina de encendido NGK 1.4 8V")).toBe("/repuestos/bobina-encendido-ngk.webp");
  });

  it("falls back to the generic image when the type is unknown", () => {
    expect(imagenDeRepuesto("Volante deportivo")).toBe(IMAGEN_PLACEHOLDER);
    expect(imagenDeRepuesto("")).toBe(IMAGEN_PLACEHOLDER);
  });
});

describe("aSlug", () => {
  it("turns a manufacturer into a file name", () => {
    expect(aSlug("Mann-Filter")).toBe("mann-filter");
    expect(aSlug("Fábrica Única")).toBe("fabrica-unica");
  });
});

describe("TIPOS_REPUESTO", () => {
  it("has unique file names without accents or spaces", () => {
    const archivos = TIPOS_REPUESTO.map((tipo) => tipo.archivo);
    expect(new Set(archivos).size).toBe(archivos.length);
    archivos.forEach((archivo) => expect(archivo).toMatch(/^[a-z0-9-]+$/));
  });

  it("covers every part of the catalog, and every manufacturer has its image", () => {
    const { parts } = JSON.parse(readFileSync(CATALOGO, "utf-8"));
    const sinTipo = parts.filter((part) => !tipoDeRepuesto(part.name)).map((part) => part.name);
    expect(sinTipo).toEqual([]);

    // Cada fabricante del catálogo es el principal (imagen base) o tiene su versión.
    const esperadas = new Set(imagenesEsperadas().map((imagen) => `/repuestos/${imagen.archivo}.webp`));
    const sinImagenPropia = parts.filter((part) => !esperadas.has(imagenDeTipo(part.name)));
    expect(sinImagenPropia).toEqual([]);

    const combinaciones = new Set(parts.map((part) => imagenDeTipo(part.name)));
    expect(combinaciones.size).toBe(imagenesEsperadas().length);
  });

  it("has a generated image for every type and manufacturer", () => {
    const faltan = imagenesEsperadas()
      .filter((imagen) => !existsSync(join(RAIZ_FRONTEND, "public", "repuestos", `${imagen.archivo}.webp`)))
      .map((imagen) => imagen.archivo);

    expect(faltan).toEqual([]);
  });
});
