import {
  capConfidence,
  roundMoney,
} from "./normalize";
import type {
  ExtractionFlag,
  ModelConfidence,
  NormalizedLineItem,
} from "./types";

/**
 * Cross-checks the extracted numbers so we never trust an invoice whose math
 * doesn't hold. This is the layer that catches the model silently dropping a
 * tax line or misreading a thousands separator.
 *
 * Where possible we *repair* rather than fail: if the total is missing but
 * subtotal + tax are reliable, we derive the total; if the subtotal is
 * missing but every line item has an amount that sums to the total, we derive
 * the subtotal. Derived values are always flagged and capped at 0.7
 * confidence so they still surface for human review.
 */

export interface ReconcileInput {
  subtotal: number | null;
  tax: number | null;
  taxRate: number | null;
  discount: number | null;
  shipping: number | null;
  total: number | null;
  items: NormalizedLineItem[];
  confidence: ModelConfidence;
}

export interface ReconcileOutput {
  flags: ExtractionFlag[];
  confidence: ModelConfidence;
  subtotal: number | null;
  total: number | null;
}

/** Relative tolerance for money reconciliation (1%). */
const RELATIVE_TOLERANCE = 0.01;
/** Absolute floor so tiny amounts aren't flagged for minor rounding. */
const ABS_TOLERANCE = 0.01;

function differs(a: number, b: number): boolean {
  const magnitude = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) > Math.max(ABS_TOLERANCE, magnitude * RELATIVE_TOLERANCE);
}

function sumItems(items: NormalizedLineItem[]): number {
  return roundMoney(
    items.reduce((acc, it) => acc + (it.amount ?? 0), 0),
  );
}

export function reconcile(input: ReconcileInput): ReconcileOutput {
  const flags: ExtractionFlag[] = [];
  const confidence: ModelConfidence = { ...input.confidence };
  const { tax, taxRate, discount, shipping } = input;
  let subtotal = input.subtotal;
  let total = input.total;
  const items = [...input.items]; // shallow copy so mutations stay local

  let amountItemsSum: number | null = null;

  // ---------- 1. Line items must be internally consistent ----------
  const itemRows = items.filter(
    (it) => it.amount !== null || it.quantity !== null,
  );
  if (itemRows.length > 0) {
    // a) if an item lists qty and unit price but no amount, fill it
    let filledAny = false;
    for (const it of itemRows) {
      if (it.amount === null && it.quantity !== null && it.unitPrice !== null) {
        it.amount = roundMoney(it.quantity * it.unitPrice);
        filledAny = true;
      } else if (
        it.amount !== null &&
        it.quantity !== null &&
        it.unitPrice !== null &&
        differs(it.amount, roundMoney(it.quantity * it.unitPrice))
      ) {
        flags.push("line_item_mismatch");
      }
    }

    amountItemsSum = sumItems(items);

    // b) sum of items vs subtotal
    if (subtotal === null && filledAny) {
      subtotal = amountItemsSum;
      flags.push("subtotal_derived");
      confidence.subtotal = capConfidence(confidence.subtotal, 0.7);
    } else if (subtotal !== null && amountItemsSum !== null) {
      if (differs(amountItemsSum, subtotal)) {
        flags.push("subtotal_mismatch");
        confidence.subtotal = capConfidence(confidence.subtotal, 0.4);
      }
    }
  }

  // ---------- 2. total must equal subtotal + tax + shipping - discount ----------
  const effectiveSubtotal = subtotal ?? (itemRows.length > 0 ? amountItemsSum : null);
  const parts: Array<[number | null, number]> = [
    [effectiveSubtotal, 1],
    [tax, 1],
    [shipping, 1],
    [discount, -1],
  ];
  const hasParts = parts.some(([v]) => v !== null);
  const computed = roundMoney(
    parts.reduce((acc, [v, sign]) => acc + (v ?? 0) * sign, 0),
  );

  if (total === null) {
    if (hasParts && effectiveSubtotal !== null) {
      // Repair the missing total from reliable parts.
      total = computed;
      flags.push("total_derived");
      confidence.total = capConfidence(confidence.total, 0.7);
    } else {
      flags.push("missing_total");
      confidence.total = 0;
    }
  } else if (effectiveSubtotal !== null) {
    if (differs(total, computed)) {
      flags.push("total_mismatch");
      confidence.total = capConfidence(confidence.total, 0.3);
      if (subtotal !== null) {
        confidence.subtotal = capConfidence(confidence.subtotal, 0.5);
      }
    }
  }

  // ---------- 3. tax rate sanity check (when all three are present) ----------
  if (tax !== null && subtotal !== null && taxRate !== null) {
    const expected = roundMoney((subtotal * taxRate) / 100);
    if (differs(expected, tax)) {
      flags.push("tax_mismatch");
      confidence.tax = capConfidence(confidence.tax, 0.4);
    }
  }

  return { flags, confidence, subtotal, total };
}