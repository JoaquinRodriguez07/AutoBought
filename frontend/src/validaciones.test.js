import {
  detectarMarca,
  formatearNumeroTarjeta,
  pasaLuhn,
  tarjetaVencida,
  validarDireccion,
  validarNombrePersona,
  validarPassword,
  validarTarjeta,
  validarVencimiento,
} from "./validaciones";

const HOY = new Date(2026, 9, 15); // 15 de octubre de 2026

describe("detectarMarca", () => {
  it.each([
    ["4111111111111111", "Visa"],
    ["5500000000000004", "Mastercard"],
    ["2221000000000009", "Mastercard"],
    ["2720990000000007", "Mastercard"],
    ["378282246310005", "American Express"],
    ["341111111111111", "American Express"],
  ])("detects %s as %s", (numero, marca) => {
    expect(detectarMarca(numero)).toBe(marca);
  });

  it.each(["5899123412341234", "2220000000000000", "2721000000000000", "6011111111111117", ""])(
    "does not guess a brand for %s",
    (numero) => {
      expect(detectarMarca(numero)).toBeNull();
    }
  );
});

describe("pasaLuhn", () => {
  it("accepts valid card numbers and rejects a changed digit", () => {
    expect(pasaLuhn("4111 1111 1111 1111")).toBe(true);
    expect(pasaLuhn("378282246310005")).toBe(true);
    expect(pasaLuhn("4111111111111112")).toBe(false);
    expect(pasaLuhn("")).toBe(false);
  });
});

describe("formatearNumeroTarjeta", () => {
  it("groups by 4, and Amex as 4-6-5", () => {
    expect(formatearNumeroTarjeta("4111111111111111", "Visa")).toBe("4111 1111 1111 1111");
    expect(formatearNumeroTarjeta("378282246310005", "American Express")).toBe("3782 822463 10005");
    expect(formatearNumeroTarjeta("37828", "American Express")).toBe("3782 8");
  });
});

describe("vencimiento", () => {
  it("is valid until the last day of its month", () => {
    expect(tarjetaVencida("10/26", HOY)).toBe(false);
    expect(tarjetaVencida("09/26", HOY)).toBe(true);
    expect(validarVencimiento("10/26", HOY)).toBeNull();
  });

  it("rejects bad formats, expired and far away dates", () => {
    expect(validarVencimiento("13/30", HOY)).toBe("El vencimiento tiene que tener el formato MM/AA.");
    expect(validarVencimiento("01/20", HOY)).toBe("La tarjeta está vencida.");
    expect(validarVencimiento("01/47", HOY)).toBe("Revisá el vencimiento: es demasiado lejano.");
  });
});

describe("validarTarjeta", () => {
  const tarjeta = { tipo: "Visa", titular: "Ana Pérez", numero: "4111111111111111", vencimiento: "12/28", cvv: "123" };

  it("accepts a valid card", () => {
    expect(validarTarjeta(tarjeta, HOY)).toEqual({});
  });

  it("rejects a number of another brand than the chosen one", () => {
    expect(validarTarjeta({ ...tarjeta, tipo: "Mastercard" }, HOY).numero).toBe(
      "Ese número es de una tarjeta Visa, no Mastercard."
    );
  });

  it("checks the length of each brand", () => {
    expect(validarTarjeta({ ...tarjeta, numero: "41111111111111" }, HOY).numero).toBe(
      "Una tarjeta Visa tiene 13, 16 o 19 dígitos."
    );
    expect(validarTarjeta({ ...tarjeta, tipo: "OCA", numero: "589912341234" }, HOY).numero).toBe(
      "Una tarjeta OCA tiene 14, 15 o 16 dígitos."
    );
  });

  it("does not apply Luhn to OCA", () => {
    expect(validarTarjeta({ ...tarjeta, tipo: "OCA", numero: "5899123412341234" }, HOY)).toEqual({});
  });
});

describe("validarNombrePersona", () => {
  it.each(["Lucía Gómez", "O'Neill", "María-José", "D’Agostino", "  Ana   Paz "])("accepts %s", (nombre) => {
    expect(validarNombrePersona(nombre)).toBeNull();
  });

  it.each(["123", "Ana 2", "@@@", "A", "   "])("rejects %s", (nombre) => {
    expect(validarNombrePersona(nombre)).not.toBeNull();
  });
});

describe("validarPassword", () => {
  it.each([
    ["clave12", "La contraseña tiene que tener al menos 8 caracteres."],
    ["abcdefgh", "La contraseña tiene que tener al menos una letra y un número."],
    ["12345678", "La contraseña tiene que tener al menos una letra y un número."],
    ["Password1", "Esa contraseña es muy común. Elegí otra."],
    ["Lucia2026", "La contraseña no puede contener tu correo."],
    ["ñ".repeat(37) + "1", "La contraseña es demasiado larga."],
  ])("rejects %s", (password, mensaje) => {
    expect(validarPassword(password, "lucia@example.com")).toBe(mensaje);
  });

  it("accepts a password with letters and numbers", () => {
    expect(validarPassword("mi auto 4x4", "lucia@example.com")).toBeNull();
  });
});

describe("validarDireccion", () => {
  const direccion = {
    nombre: "Casa", calle: "18 de Julio", numero: "1234 bis", apartamento: "3B",
    ciudad: "Montevideo", departamento: "Montevideo", codigoPostal: "11200",
  };

  it("accepts a valid address, and S/N as door number", () => {
    expect(validarDireccion(direccion)).toEqual({});
    expect(validarDireccion({ ...direccion, numero: "s/n" })).toEqual({});
  });

  it("rejects a city named as another department, ignoring accents and case", () => {
    expect(validarDireccion({ ...direccion, ciudad: "PAYSANDU", departamento: "Artigas" }).departamento).toBe(
      "PAYSANDU no está en el departamento de Artigas."
    );
  });
});
