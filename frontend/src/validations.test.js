// Tests de las validaciones de los formularios.

import {
  validateAddress,
  validatePersonName,
  validatePassword,
} from "./validations";

describe("validatePersonName", () => {
  it.each(["Lucía Gómez", "O'Neill", "María-José", "D’Agostino", "  Ana   Paz "])("accepts %s", (nombre) => {
    expect(validatePersonName(nombre)).toBeNull();
  });

  it.each(["123", "Ana 2", "@@@", "A", "   "])("rejects %s", (nombre) => {
    expect(validatePersonName(nombre)).not.toBeNull();
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
  ])("rejects %s", (password, mensaje) => {
    expect(validatePassword(password, "lucia@example.com")).toBe(mensaje);
  });

  it("accepts a password with letters and numbers", () => {
    expect(validatePassword("mi auto 4x4", "lucia@example.com")).toBeNull();
  });
});

describe("validateAddress", () => {
  const direccion = {
    nombre: "Casa", calle: "18 de Julio", numero: "1234 bis", apartamento: "3B",
    ciudad: "Montevideo", departamento: "Montevideo", codigoPostal: "11200",
  };

  it("accepts a valid address, and S/N as door number", () => {
    expect(validateAddress(direccion)).toEqual({});
    expect(validateAddress({ ...direccion, numero: "s/n" })).toEqual({});
  });

  it("rejects a city named as another department, ignoring accents and case", () => {
    expect(validateAddress({ ...direccion, ciudad: "PAYSANDU", departamento: "Artigas" }).departamento).toBe(
      "PAYSANDU no está en el departamento de Artigas."
    );
  });
});
