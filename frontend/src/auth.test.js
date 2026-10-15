import {
  MARGEN_RENOVACION_MS,
  guardarSesion,
  msHastaRenovacion,
  obtenerSesion,
} from "./auth";
import { crearToken } from "./testTokens";

const MIN = 60 * 1000;
const AHORA = 1_800_000_000_000;

describe("msHastaRenovacion", () => {
  it("falls MARGEN_RENOVACION_MS before the token expires", () => {
    expect(MARGEN_RENOVACION_MS).toBe(5 * MIN);

    // Token recién emitido (60 min de vida): se renueva al minuto 55.
    expect(msHastaRenovacion(crearToken(AHORA + 60 * MIN), AHORA)).toBe(55 * MIN);
  });

  it("returns 0 once the renewal moment has passed, even if the token is still valid", () => {
    expect(msHastaRenovacion(crearToken(AHORA + 3 * MIN), AHORA)).toBe(0);
    expect(msHastaRenovacion(crearToken(AHORA - MIN), AHORA)).toBe(0);
  });

  it("returns null when there is nothing to schedule", () => {
    expect(msHastaRenovacion(null)).toBeNull();
    expect(msHastaRenovacion("no-es-un-jwt")).toBeNull();
    expect(msHastaRenovacion(`x.${btoa(JSON.stringify({ sub: "1" }))}.y`)).toBeNull();
  });
});

describe("guardarSesion", () => {
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("keeps a remembered session in localStorage", () => {
    localStorage.setItem("autobought-sesion", JSON.stringify({ token: "viejo" }));

    guardarSesion({ token: "nuevo" });

    expect(JSON.parse(localStorage.getItem("autobought-sesion"))).toEqual({ token: "nuevo" });
    expect(sessionStorage.getItem("autobought-sesion")).toBeNull();
    expect(obtenerSesion()).toEqual({ token: "nuevo" });
  });

  it("keeps a non-remembered session in sessionStorage", () => {
    sessionStorage.setItem("autobought-sesion", JSON.stringify({ token: "viejo" }));

    guardarSesion({ token: "nuevo" });

    expect(JSON.parse(sessionStorage.getItem("autobought-sesion"))).toEqual({ token: "nuevo" });
    expect(localStorage.getItem("autobought-sesion")).toBeNull();
  });
});
