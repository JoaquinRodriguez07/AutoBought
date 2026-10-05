import { formatearTelefonoUY, normalizarTelefonoUY } from "./telefono";

describe("normalizarTelefonoUY", () => {
  it.each([
    ["099 123 456", "+59899123456"],
    ["099123456", "+59899123456"],
    ["091-234-567", "+59891234567"],
    ["+598 99 123 456", "+59899123456"],
    ["+598 099 123 456", "+59899123456"],
    ["00598 99123456", "+59899123456"],
    ["59899123456", "+59899123456"],
    ["2900 1234", "+59829001234"],
    ["4332 1234", "+59843321234"],
    ["(02) 900 1234", "+59829001234"],
  ])("accepts %s", (raw, esperado) => {
    expect(normalizarTelefonoUY(raw)).toBe(esperado);
  });

  it.each([
    "12345",
    "099 12 34",
    "090 123 456",
    "099 123 4567",
    "3123 4567",
    "+54 9 11 1234 5678",
    "+1 415 555 2671",
    "abc 123 456",
    "099-123-45a",
    "",
    null,
  ])("rejects %s", (raw) => {
    expect(normalizarTelefonoUY(raw)).toBeNull();
  });
});

describe("formatearTelefonoUY", () => {
  it("formats mobiles and landlines for display", () => {
    expect(formatearTelefonoUY("+59899123456")).toBe("099 123 456");
    expect(formatearTelefonoUY("+59829001234")).toBe("2900 1234");
  });

  it("returns an empty string for no phone and leaves unknown values untouched", () => {
    expect(formatearTelefonoUY(null)).toBe("");
    expect(formatearTelefonoUY(undefined)).toBe("");
    expect(formatearTelefonoUY("123")).toBe("123");
  });
});
