import { clampConfidence } from "./types";

/**
 * Locale-aware normalization of the text the model copied verbatim from the
 * document.
 *
 * The genuinely hard part of "messy invoices" is that there is no standard
 * number or date format in the wild: "1,234.56" (US), "1.234,56" (most of
 * Europe), "1 234,56", "1'234.56", "1,234" (JPY, zero decimals). A model
 * asked to return a number directly will occasionally get these wrong; a
 * deterministic parser with explicit heuristics is testable and predictable.
 *
 * There is no way to be 100% correct on every input — "1.234" is one and a
 * quarter thousand in the US and one and a quarter in Germany. These
 * functions encode the conventional accounting heuristics, and where the
 * format is genuinely ambiguous we say so via a flag rather than guess
 * silently.
 */

const NUMBER_TOKEN = /(-?\d[\d\s.,'’\u00A0\u202F]*)/u;
const CURRENCY_SYMBOLS = /[€$£¥₩₹฿₿₴₼₸₦₪₫\u20A0-\u20BF]/g;
const LETTERS = /[A-Za-z]+/g;
const COMPACT = /[\s'’\u00A0\u202F]/g;

/**
 * Parse a printed amount into a number. Handles European and US separators,
 * currency symbols, ISO codes and punctuation.
 *
 * Heuristics (in order of determinism):
 * - mixed separators ("1.234,56" / "1,234.56"): the last separator is the
 *   decimal one; everything else is grouping.
 * - single separator:
 *   - 1–2 digits after → definitely decimal ("1,23" → 1.23)
 *   - 0 digits after → the separator was punctuation ("50." → 50)
 *   - 3 digits after → grouping, except "0,123" where the leading zero means
 *     three decimal places (0.123). "1,234" → 1234, "1.500" → 1500.
 */
export function parseAmount(raw: string | null | undefined): number | null {
  if (!raw || raw.trim() === "") return null;

  const s = raw.replace(CURRENCY_SYMBOLS, "").replace(LETTERS, "").trim();

  const match = s.match(NUMBER_TOKEN);
  if (!match) return null;
  let token = match[1].trim();
  token = token.replace(COMPACT, "");
  if (token === "" || token === "-") return null;

  let negative = false;
  if (token.startsWith("-")) {
    negative = true;
    token = token.slice(1);
  }

  // token now is digits, possibly with ',' and/or '.' separators
  const commaCount = (token.match(/,/g) ?? []).length;
  const dotCount = (token.match(/\./g) ?? []).length;

  if (commaCount === 0 && dotCount === 0) {
    const n = parseInt(token, 10);
    if (!Number.isFinite(n)) return null;
    return negative ? -n : n;
  }

  if (commaCount > 0 && dotCount > 0) {
    // Both separators present: last one is the decimal separator.
    const lastSep = Math.max(token.lastIndexOf(","), token.lastIndexOf("."));
    const integerPart = token.slice(0, lastSep).replace(/[.,]/g, "");
    const decimalPart = token.slice(lastSep + 1);
    return toNumber(integerPart, decimalPart, negative);
  }

  // Exactly one separator kind.
  const sep = commaCount > 0 ? "," : ".";
  const parts = token.split(sep === "." ? /\./ : /,/);
  const intPart = parts[0];
  const decPart = parts.slice(1).join("");

  if (decPart.length === 0) {
    // Trailing punctuation, e.g. "50." from a swallowed sentence period.
    const n = parseInt(intPart, 10);
    return Number.isFinite(n) ? (negative ? -n : n) : null;
  }

  if (decPart.length === 3) {
    if (intPart === "0") {
      // "0.123" / "0,123" → three decimal places
      return toNumber(intPart, decPart, negative);
    }
    // Grouping separator: "1.500" → 1500, "1,234" → 1234, "12.345" → 12345
    const n = parseInt(intPart + decPart, 10);
    return Number.isFinite(n) ? (negative ? -n : n) : null;
  }

  // 1–2 digits after the separator → decimal.
  return toNumber(intPart, decPart, negative);
}

function toNumber(
  intPart: string,
  decPart: string,
  negative: boolean,
): number | null {
  const sig = `${intPart || "0"}.${decPart || "0"}`;
  const n = parseFloat(sig);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/** Parse a percentage like "19", "19%", "7,5" into 19 / 7.5. */
export function parsePercent(raw: string | null | undefined): number | null {
  if (!raw || raw.trim() === "") return null;
  const v = parseAmount(raw.replace("%", " "));
  if (v === null || v < 0 || v > 100) return null;
  return v;
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

export interface ParsedDate {
  /** ISO 8601 date string, or null when unparseable. */
  value: string | null;
  /** True when the written format could mean two different days. */
  ambiguous: boolean;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parse a printed date into ISO 8601.
 *
 * Ambiguity handling: "03/05/2026" is 5 March in the US and 3 May almost
 * everywhere else. We return `ambiguous: true` (and default to day-first)
 * rather than silently picking the user's locale.
 */
export function parseDate(raw: string | null | undefined): ParsedDate {
  if (!raw || raw.trim() === "") return { value: null, ambiguous: false };
  const s = raw.trim();

  // ISO already
  const iso = s.match(ISO_DATE);
  if (iso) {
    return buildDate(Number(iso[3]), Number(iso[2]), iso[1], false);
  }

  // Month-name formats: "14 September 2026", "Sept 14 2026", "14 Sept., 2026"
  const monthName =
    /(\d{1,2})[./-]?\s*([A-Za-z]{3,9})[.,]?\s*(\d{2,4})/.exec(s) ??
    /([A-Za-z]{3,9})[.,]?\s+(\d{1,2})[.,]?\s*(\d{2,4})/.exec(s);
  if (monthName) {
    const g1 = monthName[1];
    const monthKey = monthName[2].toLowerCase();
    const yearPart = monthName[3];
    const month = /^\d{1,2}$/.test(g1) ? undefined : MONTHS[g1.toLowerCase()];
    const day = /^\d{1,2}$/.test(g1) ? parseInt(g1, 10) : parseInt(monthName[2], 10);
    const monthNum = month ?? MONTHS[monthKey];
    return buildDate(day, monthNum, padYear(yearPart), false);
  }

  // Numeric formats separated by / . - (fall back to splitting on anything
  // that isn't a digit for space-separated input like "14 09 2026").
  const time = /[./-]/.test(s) ? /[./-]/ : /[^\d]/;
  const nums = s.split(time).filter(Boolean);
  if (nums.length < 3) return { value: null, ambiguous: false };

  const numsArr = nums.map(Number);
  const [a, b] = numsArr;
  let c = numsArr[2];
  if (c < 100) c = 2000 + c;
  if (c < 1000 || c > 9999) return { value: null, ambiguous: false };

  if (a <= 12 && b > 12) {
    // MM/DD/YYYY
    return buildDate(b, a, String(c), false);
  }
  if (a > 12 && b <= 12) {
    // DD/MM/YYYY
    return buildDate(a, b, String(c), false);
  }
  if (a <= 12 && b <= 12) {
    // Both plausible → genuinely ambiguous. Default to day-first.
    return buildDate(a, b, String(c), true);
  }
  return { value: null, ambiguous: false };
}

function padYear(y: string | number): string {
  const n = Number(y);
  if (Number.isNaN(n)) return "";
  if (n < 100) return String(2000 + n);
  return String(n);
}

function buildDate(
  day: number,
  month: number | undefined,
  year: string,
  ambiguous: boolean,
): ParsedDate {
  if (!month || day < 1 || day > 31 || year.length !== 4) {
    return { value: null, ambiguous: false };
  }
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  const date = new Date(Date.UTC(Number(year), month - 1, day));
  const valid =
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
  if (!valid) return { value: null, ambiguous: false };
  return { value: `${year}-${mm}-${dd}`, ambiguous };
}

const ISO_CODES = new Set([
  "AED", "AUD", "BHD", "BRL", "CAD", "CHF", "CNY", "DKK", "EUR", "GBP",
  "HKD", "HUF", "IDR", "ILS", "INR", "JPY", "KRW", "KWD", "MXN", "MYR",
  "NOK", "NZD", "OMR", "PHP", "PLN", "QAR", "RON", "SAR", "SEK", "SGD",
  "THB", "TRY", "TWD", "USD", "ZAR",
]);

const SYMBOL_TO_ISO: Record<string, string> = {
  $: "USD",
  "€": "EUR",
  "£": "GBP",
  "₩": "KRW",
  "₹": "INR",
  "฿": "THB",
  "₺": "TRY",
  zł: "PLN",
  R$: "BRL",
};

const NAME_TO_ISO: Record<string, string> = {
  usd: "USD", dollar: "USD", dollars: "USD", usdollar: "USD",
  eur: "EUR", euro: "EUR", euros: "EUR",
  gbp: "GBP", pound: "GBP", pounds: "GBP", sterling: "GBP",
  jpy: "JPY", yen: "JPY",
  cad: "CAD",
  aud: "AUD",
  inr: "INR", rupee: "INR",
  chf: "CHF", franc: "CHF",
};

export interface ParsedCurrency {
  /** ISO 4217 code or null when unknown. */
  code: string | null;
  /** True when the raw value mentioned a currency we could not identify. */
  unknown: boolean;
}

/**
 * Map whatever the model copied (symbol, ISO code, currency name, or a mix)
 * to an ISO 4217 code. "¥" is deliberately NOT auto-resolved: it is both JPY
 * and CNY, and guessing the wrong one corrupts money math.
 */
export function mapCurrency(raw: string | null | undefined): ParsedCurrency {
  if (!raw || raw.trim() === "") return { code: null, unknown: false };
  const s = raw.trim();

  const symbol = (s.match(CURRENCY_SYMBOLS) ?? [])[0];
  if (symbol) {
    if (symbol === "¥") return { code: null, unknown: true };
    const code = SYMBOL_TO_ISO[symbol];
    if (code) return { code, unknown: false };
    // Recognized as a currency symbol but we can't map it (₿, ₴, ₼, ...).
    return { code: null, unknown: true };
  }

  const letters = (s.match(LETTERS) ?? []).join("").toLowerCase();
  if (/^[a-z]{3}$/.test(s.toLowerCase()) && ISO_CODES.has(s.toUpperCase())) {
    return { code: s.toUpperCase(), unknown: false };
  }
  const byName = NAME_TO_ISO[letters];
  if (byName) return { code: byName, unknown: false };
  if (letters) return { code: null, unknown: true };

  return { code: null, unknown: false };
}

/** Round to 2 decimals for storage in numeric(14,2). */
export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Cap a confidence value to a maximum (used when reconciliation degrades a
 * field's trust, e.g. totals that don't add up).
 */
export function capConfidence(v: number, max: number): number {
  return clampConfidence(Math.min(v, max));
}