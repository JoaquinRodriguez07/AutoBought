import { textoPlazoPago } from "./plazoPago";

describe("textoPlazoPago", () => {
  const ahora = new Date(2026, 9, 29, 21, 0);

  test("only the time when the deadline is today", () => {
    expect(textoPlazoPago(new Date(2026, 9, 29, 22, 45).toISOString(), ahora)).toBe("las 22:45");
  });

  test("the day and the time when it is another day", () => {
    expect(textoPlazoPago(new Date(2026, 9, 30, 0, 15).toISOString(), ahora)).toBe("el 30/10 a las 00:15");
  });

  test("nothing for orders without a deadline", () => {
    expect(textoPlazoPago(null, ahora)).toBe("");
  });
});
