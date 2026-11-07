// Tests de la sesión (auth.js).

import {
  RENEWAL_MARGIN_MS,
  isAdmin,
  isSeller,
  saveSession,
  msUntilRenewal,
  getSession,
} from "./auth";
import { createToken } from "./testTokens";

const MIN = 60 * 1000;
const AHORA = 1_800_000_000_000;

describe("msUntilRenewal", () => {
  it("falls MARGEN_RENOVACION_MS before the token expires", () => {
    expect(RENEWAL_MARGIN_MS).toBe(5 * MIN);

    // Token recién emitido (60 min de vida): se renueva al minuto 55.
    expect(msUntilRenewal(createToken(AHORA + 60 * MIN), AHORA)).toBe(55 * MIN);
  });

  it("returns 0 once the renewal moment has passed, even if the token is still valid", () => {
    expect(msUntilRenewal(createToken(AHORA + 3 * MIN), AHORA)).toBe(0);
    expect(msUntilRenewal(createToken(AHORA - MIN), AHORA)).toBe(0);
  });

  it("returns null when there is nothing to schedule", () => {
    expect(msUntilRenewal(null)).toBeNull();
    expect(msUntilRenewal("no-es-un-jwt")).toBeNull();
    expect(msUntilRenewal(`x.${btoa(JSON.stringify({ sub: "1" }))}.y`)).toBeNull();
  });
});

describe("saveSession", () => {
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("keeps a remembered session in localStorage", () => {
    localStorage.setItem("autobought-sesion", JSON.stringify({ token: "viejo" }));

    saveSession({ token: "nuevo" });

    expect(JSON.parse(localStorage.getItem("autobought-sesion"))).toEqual({ token: "nuevo" });
    expect(sessionStorage.getItem("autobought-sesion")).toBeNull();
    expect(getSession()).toEqual({ token: "nuevo" });
  });

  it("keeps a non-remembered session in sessionStorage", () => {
    sessionStorage.setItem("autobought-sesion", JSON.stringify({ token: "viejo" }));

    saveSession({ token: "nuevo" });

    expect(JSON.parse(sessionStorage.getItem("autobought-sesion"))).toEqual({ token: "nuevo" });
    expect(localStorage.getItem("autobought-sesion")).toBeNull();
  });
});

describe("isSeller", () => {
  it("is true only for an employee session", () => {
    expect(isSeller({ userType: "employee" })).toBe(true);
    expect(isSeller({ userType: "client" })).toBe(false);
  });

  it("is false without a session or without a user type", () => {
    expect(isSeller(null)).toBe(false);
    expect(isSeller(undefined)).toBe(false);
    expect(isSeller({ nombre: "Ana" })).toBe(false);
  });
});

describe("isAdmin", () => {
  // El portal solo lee el payload del token.
  const createToken = (claims) => `x.${btoa(JSON.stringify({ sub: "1", ...claims }))}.y`;

  it("is true only for a seller whose token says admin", () => {
    expect(isAdmin({ userType: "employee", token: createToken({ admin: true }) })).toBe(true);
    expect(isAdmin({ userType: "employee", token: createToken({}) })).toBe(false);
    // Un cliente nunca, aunque el token dijera otra cosa.
    expect(isAdmin({ userType: "client", token: createToken({ admin: true }) })).toBe(false);
    expect(isAdmin({ userType: "employee" })).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });
});
