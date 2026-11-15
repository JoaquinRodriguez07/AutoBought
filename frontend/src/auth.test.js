// Tests de la sesión (auth.js).

import {
  RENEWAL_MARGIN_MS,
  destinationAfterLogin,
  isAdmin,
  isSeller,
  saveSession,
  msUntilRenewal,
  getSession,
} from "./auth";
import { createToken } from "./testTokens";

const MIN = 60 * 1000;
const NOW = 1_800_000_000_000;

describe("msUntilRenewal", () => {
  it("falls MARGEN_RENOVACION_MS before the token expires", () => {
    expect(RENEWAL_MARGIN_MS).toBe(5 * MIN);

    // Token recién emitido (60 min de vida): se renueva al minuto 55.
    expect(msUntilRenewal(createToken(NOW + 60 * MIN), NOW)).toBe(55 * MIN);
  });

  it("returns 0 once the renewal moment has passed, even if the token is still valid", () => {
    expect(msUntilRenewal(createToken(NOW + 3 * MIN), NOW)).toBe(0);
    expect(msUntilRenewal(createToken(NOW - MIN), NOW)).toBe(0);
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
    localStorage.setItem("autobought-sesion", JSON.stringify({ token: "old" }));

    saveSession({ token: "newItem" });

    expect(JSON.parse(localStorage.getItem("autobought-sesion"))).toEqual({ token: "newItem" });
    expect(sessionStorage.getItem("autobought-sesion")).toBeNull();
    expect(getSession()).toEqual({ token: "newItem" });
  });

  it("keeps a non-remembered session in sessionStorage", () => {
    sessionStorage.setItem("autobought-sesion", JSON.stringify({ token: "old" }));

    saveSession({ token: "newItem" });

    expect(JSON.parse(sessionStorage.getItem("autobought-sesion"))).toEqual({ token: "newItem" });
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
    expect(isSeller({ displayName: "Ana" })).toBe(false);
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

describe("destinationAfterLogin", () => {
  const client = { userType: "client" };
  const seller = { userType: "employee" };

  it("goes back to the page that asked for a session", () => {
    expect(destinationAfterLogin("/historial", client)).toBe("/historial");
    expect(destinationAfterLogin("/pago?pedido=7&payment_id=9", client)).toBe("/pago?pedido=7&payment_id=9");
    expect(destinationAfterLogin("/dashboard/pedidos/3", seller)).toBe("/dashboard/pedidos/3");
  });

  it("without a page to go back to, uses the usual one for each role", () => {
    expect(destinationAfterLogin(undefined, client)).toBe("/");
    expect(destinationAfterLogin(undefined, seller)).toBe("/dashboard");
  });

  it("does not send a role to the screens of the other", () => {
    expect(destinationAfterLogin("/dashboard", client)).toBe("/");
    expect(destinationAfterLogin("/carrito", seller)).toBe("/dashboard");
  });

  it.each(["https://otro-sitio.example", "//otro-sitio.example", "/\\otro-sitio.example", "historial", 7, null])(
    "ignores %p: only routes of the store",
    (from) => {
      expect(destinationAfterLogin(from, client)).toBe("/");
    }
  );
});
