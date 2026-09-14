import { mapCurrency, parseAmount, parseDate, parsePercent, roundMoney } from "./normalize";
import { reconcile } from "./reconcile";
import type {
  ExtractionFlag,
  ExtractedInvoice,
  ModelConfidence,
  NormalizedLineItem,
} from "./types";
import { clampConfidence, emptyConfidence } from "./types";
import { CRITICAL_FIELDS } from "./types";
import { ExtractionError } from "./errors";
import type { ExtractionProvider } from "./provider";
import type { ParsedModelOutput } from "./schema";

export interface PipelineResult {
  ok: boolean;
  /** When !ok, one of the ExtractionError kinds (excluding not-configured). */
  reason?: string;
  message?: string;
  /** Computed status for the document, e.g. "ready". */
  status: "ready" | "needs_review" | "failed";
  invoice?: ExtractedInvoice;
}

/** Flags that always force a human review, regardless of confidence. */
const REVIEW_FLAGS: ReadonlySet<ExtractionFlag> = new Set([
  "total_mismatch",
  "subtotal_mismatch",
  "line_item_mismatch",
  "tax_mismatch",
  "missing_total",
  "ambiguous_date",
  "unknown_currency",
  "unparseable_amount",
  "total_derived",
  "subtotal_derived",
]);

/**
 * Pipeline: validate the PDF → read it with the provider → normalize every
 * field → reconcile the math → decide whether the result needs human review.
 *
 * Pure with respect to I/O: the provider is injected, so tests can run the
 * whole pipeline against a fake model and fixture PDFs without a network
 * call.
 */
export async function runExtraction(
  pdfBytes: Uint8Array,
  provider: ExtractionProvider,
): Promise<PipelineResult> {
  if (pdfBytes.byteLength === 0) {
    return fail("invalid-pdf", "The file is empty.");
  }
  const head = String.fromCharCode(
    pdfBytes[0] ?? 0,
    pdfBytes[1] ?? 0,
    pdfBytes[2] ?? 0,
    pdfBytes[3] ?? 0,
    pdfBytes[4] ?? 0,
  );
  if (head !== "%PDF-") {
    return fail("invalid-pdf", "This file is not a PDF (missing PDF header).");
  }

  let model: ParsedModelOutput;
  try {
    model = await provider.extract(pdfBytes, "");
  } catch (err) {
    if (err instanceof ExtractionError) {
      // Keep the provider's real message (HTTP status, model error body,
      // rate-limit detail) instead of the generic kind text, so the UI and
      // the document's failure reason are actionable.
      return fail(err.kind, err.message);
    }
    throw err;
  }

  if (!model.isInvoice) {
    return {
      ok: false,
      reason: "not-an-invoice",
      message: model.documentDescription || "This document is not an invoice.",
      status: "failed",
    };
  }

  const invoice = normalizeModelOutput(model);
  return {
    ok: true,
    status: decideStatus(invoice),
    invoice,
  };
}

/**
 * Turn raw model output into a sanitized, normalized, reconciled invoice.
 * Exported separately from `runExtraction` so the deterministic parts are
 * unit-testable end-to-end without a fake provider.
 */
export function normalizeModel(model: ParsedModelOutput): ExtractedInvoice {
  return normalizeModelOutput(model);
}

function normalizeModelOutput(model: ParsedModelOutput): ExtractedInvoice {
  const confidence: ModelConfidence = { ...emptyConfidence() };
  for (const key of Object.keys(model.confidence) as Array<keyof ModelConfidence>) {
    confidence[key] = clampConfidence(model.confidence[key]);
  }

  const flags: ExtractionFlag[] = [];

  // ---------- Dates ----------
  const invoiceDate = normalizeDate(model.invoiceDate, "invoiceDate", confidence, flags);
  const dueDate = normalizeDate(model.dueDate, "dueDate", confidence, flags);

  // ---------- Currency ----------
  const currencyRes = mapCurrency(model.currency);
  if (!currencyRes.code) {
    if (currencyRes.unknown) flags.push("unknown_currency");
    if (currencyRes.unknown) confidence.currency = clampConfidence(confidence.currency * 0.5);
    else confidence.currency = 0;
  } else {
    confidence.currency = clampConfidence(Math.max(confidence.currency, 0.4));
  }

  // ---------- Amounts ----------
  const subtotal = parseAmountChecked(model.subtotal, flags);
  const tax = parseAmountChecked(model.tax, flags);
  const taxRate = model.taxRate ? parsePercent(model.taxRate) : null;
  const discount = parseAmountChecked(model.discount, flags);
  const shipping = parseAmountChecked(model.shipping, flags);
  const total = parseAmountChecked(model.total, flags);
  if (subtotal === null) confidence.subtotal = 0;

  // ---------- Line items ----------
  const items: NormalizedLineItem[] = model.items.map((it) => ({
    position: it.position,
    sku: it.sku,
    description: it.description ?? "",
    quantity: parseAmountChecked(it.quantity, flags),
    unitPrice: parseAmountChecked(it.unitPrice, flags),
    amount: parseAmountChecked(it.amount, flags),
  }));

  // ---------- Missing-critical-info flags ----------
  if (!model.vendorName) flags.push("missing_vendor");
  if (!model.invoiceNumber) flags.push("missing_invoice_number");

  // ---------- Reconcile + derive ----------
  const reconciled = reconcile({
    subtotal,
    tax,
    taxRate,
    discount,
    shipping,
    total,
    items,
    confidence,
  });

  flags.push(...reconciled.flags);

  // ---------- Assemble ----------
  const n = (v: string | null | undefined): string | null => v ?? null;
  return {
    isInvoice: true,
    documentDescription: model.documentDescription ?? "",
    vendorName: n(model.vendorName),
    vendorEmail: n(model.vendorEmail),
    vendorAddress: n(model.vendorAddress),
    vendorTaxId: n(model.vendorTaxId),
    invoiceNumber: n(model.invoiceNumber),
    poNumber: n(model.poNumber),
    invoiceDate: invoiceDate.value,
    dueDate: dueDate.value,
    currency: currencyRes.code,
    subtotal: roundMoneyNumerics(reconciled.subtotal),
    tax: roundMoneyNumerics(tax),
    taxRate,
    discount: roundMoneyNumerics(discount),
    shipping: roundMoneyNumerics(shipping),
    total: roundMoneyNumerics(reconciled.total),
    paymentMethod: n(model.paymentMethod),
    notes: n(model.notes),
    items,
    confidence,
    flags,
  };
}

function normalizeDate(
  raw: string | null,
  field: "invoiceDate" | "dueDate",
  confidence: ModelConfidence,
  flags: ExtractionFlag[],
): { value: string | null } {
  const parsed = parseDate(raw);
  if (parsed.value === null) {
    confidence[field] = 0;
    return { value: null };
  }
  if (parsed.ambiguous) {
    flags.push("ambiguous_date");
    confidence[field] = clampConfidence(Math.min(confidence[field], 0.4));
  }
  return { value: parsed.value };
}

function parseAmountChecked(
  raw: string | null | undefined,
  flags: ExtractionFlag[],
): number | null {
  const value = parseAmount(raw);
  if (raw && raw.trim() !== "" && value === null) {
    flags.push("unparseable_amount");
  }
  return value;
}

function roundMoneyNumerics(v: number | null): number | null {
  return v === null ? null : roundMoney(v);
}

function decideStatus(invoice: ExtractedInvoice): "ready" | "needs_review" | "failed" {
  const forced = invoice.flags.some((f) => REVIEW_FLAGS.has(f));
  if (forced) return "needs_review";

  const lowConfidence = (CRITICAL_FIELDS as readonly string[]).some(
    (f) => invoice.confidence[f as keyof ModelConfidence] < 0.7,
  );
  if (lowConfidence) return "needs_review";

  return "ready";
}

function fail(reason: string, message: string): PipelineResult {
  return { ok: false, reason, message, status: "failed" };
}

export type { ExtractionProvider };