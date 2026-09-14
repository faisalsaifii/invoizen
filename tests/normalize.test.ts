import { describe, expect, it } from "vitest";
import { mapCurrency, parseAmount, parseDate, parsePercent } from "@/lib/extraction";

describe("parseAmount", () => {
  it("parses plain integers", () => {
    expect(parseAmount("123")).toBe(123);
    expect(parseAmount("0")).toBe(0);
  });

  it("parses US thousand separators", () => {
    expect(parseAmount("1,234.56")).toBe(1234.56);
    expect(parseAmount("1,234")).toBe(1234);
    expect(parseAmount("12,345,678.90")).toBe(12345678.9);
  });

  it("parses European decimal separators", () => {
    expect(parseAmount("1.234,56")).toBe(1234.56);
    expect(parseAmount("1,23")).toBe(1.23);
    expect(parseAmount("10,5")).toBe(10.5);
  });

  it("parses grouped-with-space and apostrophe styles", () => {
    expect(parseAmount("1 234,56")).toBe(1234.56);
    expect(parseAmount("1'234.56")).toBe(1234.56);
    expect(parseAmount("1 234 567")).toBe(1234567);
  });

  it("treats a single group-of-three separator as thousands", () => {
    expect(parseAmount("1.234")).toBe(1234);
    expect(parseAmount("1.500")).toBe(1500);
    expect(parseAmount("1,500")).toBe(1500);
    expect(parseAmount("12.345")).toBe(12345);
  });

  it("handles three decimal places when a leading zero indicates it", () => {
    expect(parseAmount("0.123")).toBe(0.123);
    expect(parseAmount("0,499")).toBe(0.499);
  });

  it("strips currency symbols and codes", () => {
    expect(parseAmount("US$1,234.56")).toBe(1234.56);
    expect(parseAmount("€ 1.234,56")).toBe(1234.56);
    expect(parseAmount("£99.99")).toBe(99.99);
    expect(parseAmount("$1,234.00")).toBe(1234);
    expect(parseAmount("EUR 1,234.56")).toBe(1234.56);
  });

  it("ignores trailing sentence punctuation", () => {
    expect(parseAmount("50.")).toBe(50);
    expect(parseAmount("1.234.")).toBe(1234);
  });

  it("handles negatives", () => {
    expect(parseAmount("-1,234.56")).toBe(-1234.56);
    expect(parseAmount("-12")).toBe(-12);
  });

  it("returns 0 for zero amounts", () => {
    expect(parseAmount("0,00")).toBe(0);
    expect(parseAmount("0.00")).toBe(0);
  });

  it("returns null for absent or garbage input", () => {
    expect(parseAmount(null)).toBeNull();
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("  n/a  ")).toBeNull();
  });
});

describe("parsePercent", () => {
  it("parses integer and fractional percentages", () => {
    expect(parsePercent("19")).toBe(19);
    expect(parsePercent("19%")).toBe(19);
    expect(parsePercent("7.5")).toBe(7.5);
    expect(parsePercent("7,5")).toBe(7.5);
  });

  it("returns null for nonsensical rates", () => {
    expect(parsePercent(null)).toBeNull();
    expect(parsePercent("")).toBeNull();
    expect(parsePercent("201")).toBeNull();
  });
});

describe("mapCurrency", () => {
  it("maps symbols to ISO codes", () => {
    expect(mapCurrency("$").code).toBe("USD");
    expect(mapCurrency("€").code).toBe("EUR");
    expect(mapCurrency("£").code).toBe("GBP");
    expect(mapCurrency("US$").code).toBe("USD");
  });

  it("accepts ISO codes directly", () => {
    expect(mapCurrency("USD").code).toBe("USD");
    expect(mapCurrency("eur").code).toBe("EUR");
  });

  it("maps currency names", () => {
    expect(mapCurrency("Euro").code).toBe("EUR");
    expect(mapCurrency("dollars").code).toBe("USD");
  });

  it("does not guess the ambiguous yen sign", () => {
    const yen = mapCurrency("¥");
    expect(yen.code).toBeNull();
    expect(yen.unknown).toBe(true);
  });

  it("flags unknown currencies", () => {
    expect(mapCurrency("Quatloos").unknown).toBe(true);
    expect(mapCurrency("₿").unknown).toBe(true);
  });
});

describe("parseDate", () => {
  it("parses ISO dates", () => {
    expect(parseDate("2026-09-14")).toEqual({ value: "2026-09-14", ambiguous: false });
  });

  it("parses day-first dates", () => {
    expect(parseDate("14/09/2026").value).toBe("2026-09-14");
    expect(parseDate("14.09.2026").value).toBe("2026-09-14");
    expect(parseDate("14-09-2026").value).toBe("2026-09-14");
  });

  it("parses month-first dates", () => {
    expect(parseDate("09/14/2026").value).toBe("2026-09-14");
  });

  it("flags genuinely ambiguous dates instead of guessing", () => {
    const got = parseDate("03/05/2026");
    expect(got.value).toBe("2026-05-03"); // day-first default
    expect(got.ambiguous).toBe(true);
  });

  it("parses month-name formats", () => {
    expect(parseDate("14 September 2026").value).toBe("2026-09-14");
    expect(parseDate("Sept 14, 2026").value).toBe("2026-09-14");
    expect(parseDate("14 May 2026").value).toBe("2026-05-14");
  });

  it("expands two-digit years", () => {
    expect(parseDate("14/09/26").value).toBe("2026-09-14");
  });

  it("rejects impossible dates", () => {
    expect(parseDate("31/02/2026").value).toBeNull();
    expect(parseDate("2026-13-40").value).toBeNull();
  });

  it("returns null for absent input", () => {
    expect(parseDate(null).value).toBeNull();
    expect(parseDate("").value).toBeNull();
  });
});