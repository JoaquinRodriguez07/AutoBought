// Tests del texto del plazo para pagar.

import { payBefore, paymentDeadlineText } from "./paymentDeadline";

describe("paymentDeadlineText", () => {
  const now = new Date(2026, 9, 29, 21, 0);

  test("only the time when the deadline is today", () => {
    expect(paymentDeadlineText(new Date(2026, 9, 29, 22, 45).toISOString(), now)).toBe("las 22:45");
  });

  test("the day and the time when it is another day", () => {
    expect(paymentDeadlineText(new Date(2026, 9, 30, 0, 15).toISOString(), now)).toBe("el 30/10 a las 00:15");
  });

  test("nothing for orders without a deadline", () => {
    expect(paymentDeadlineText(null, now)).toBe("");
  });
});

describe("payBefore", () => {
  const now = new Date(2026, 9, 29, 21, 0);

  test("today: 'antes de las ...'", () => {
    expect(payBefore(new Date(2026, 9, 29, 22, 45).toISOString(), now)).toBe("Pagalo antes de las 22:45");
  });

  test("another day: 'antes del ...' (not 'de el')", () => {
    expect(payBefore(new Date(2026, 9, 30, 0, 15).toISOString(), now)).toBe("Pagalo antes del 30/10 a las 00:15");
  });

  test("nothing without a deadline", () => {
    expect(payBefore(null, now)).toBe("");
  });
});
