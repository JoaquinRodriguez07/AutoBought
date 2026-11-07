// Tests de las validaciones de los formularios.

import {
  validateAddress,
  validatePersonName,
  validatePassword,
} from "./validations";

describe("validatePersonName", () => {
  it.each(["Lucía Gómez", "O'Neill", "María-José", "D’Agostino", "  Ana   Paz "])("accepts %s", (displayName) => {
    expect(validatePersonName(displayName)).toBeNull();
  });

  it.each(["123", "Ana 2", "@@@", "A", "   "])("rejects %s", (displayName) => {
    expect(validatePersonName(displayName)).not.toBeNull();
  });
});

describe("validatePassword", () => {
  it.each([
    ["clave12", "La contraseña tiene que tener al menos 8 caracteres."],
    ["abcdefgh", "La contraseña tiene que tener al menos una letra y un número."],
    ["12345678", "La contraseña tiene que tener al menos una letra y un número."],
    ["Password1", "Esa contraseña es muy común. Elegí otra."],
    ["Lucia2026", "La contraseña no puede contener tu correo."],
    ["ñ".repeat(37) + "1", "La contraseña es demasiado larga."],
  ])("rejects %s", (password, message) => {
    expect(validatePassword(password, "lucia@example.com")).toBe(message);
  });

  it("accepts a password with letters and numbers", () => {
    expect(validatePassword("mi auto 4x4", "lucia@example.com")).toBeNull();
  });
});

describe("validateAddress", () => {
  const shippingAddress = {
    displayName: "Casa", street: "18 de Julio", number: "1234 bis", apartamento: "3B",
    city: "Montevideo", departamento: "Montevideo", codePostal: "11200",
  };

  it("accepts a valid address, and S/N as door number", () => {
    expect(validateAddress(shippingAddress)).toEqual({});
    expect(validateAddress({ ...shippingAddress, number: "s/n" })).toEqual({});
  });

  it("rejects a city named as another department, ignoring accents and case", () => {
    expect(validateAddress({ ...shippingAddress, city: "PAYSANDU", departamento: "Artigas" }).departamento).toBe(
      "PAYSANDU no está en el departamento de Artigas."
    );
  });
});
