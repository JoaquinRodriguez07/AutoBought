import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { TIPOS_REPUESTO, imagenDeTipo, tipoDeRepuesto } from "./imagenesRepuestos";
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
  it("uses the image of the part type", () => {
    expect(imagenDeTipo("Radiador Valeo")).toBe("/repuestos/radiador.webp");
    expect(imagenDeRepuesto("Radiador Valeo")).toBe("/repuestos/radiador.webp");
  });

  it("falls back to the generic image when the type is unknown", () => {
    expect(imagenDeRepuesto("Volante deportivo")).toBe(IMAGEN_PLACEHOLDER);
    expect(imagenDeRepuesto("")).toBe(IMAGEN_PLACEHOLDER);
  });
});

describe("TIPOS_REPUESTO", () => {
  it("has unique file names without accents or spaces", () => {
    const archivos = TIPOS_REPUESTO.map((tipo) => tipo.archivo);
    expect(new Set(archivos).size).toBe(archivos.length);
    archivos.forEach((archivo) => expect(archivo).toMatch(/^[a-z0-9-]+$/));
  });

  it("covers every part of the catalog", () => {
    const { parts } = JSON.parse(readFileSync(CATALOGO, "utf-8"));
    const sinTipo = parts.filter((part) => !tipoDeRepuesto(part.name)).map((part) => part.name);

    expect(sinTipo).toEqual([]);
  });

  it("has a generated image for every type", () => {
    const faltan = TIPOS_REPUESTO.filter(
      (tipo) => !existsSync(join(RAIZ_FRONTEND, "public", "repuestos", `${tipo.archivo}.webp`))
    ).map((tipo) => tipo.archivo);

    expect(faltan).toEqual([]);
  });
});
