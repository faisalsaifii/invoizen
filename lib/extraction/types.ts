/**
 * Domain types for the invoice extraction pipeline.
 *
 * The pipeline has three stages:
 *   1. A model reads the PDF and returns a `ModelOutput` (raw, verbatim
 *      strings from the document — amounts and dates are NOT interpreted by
 *      the model, we do that ourselves).
 *   2. `normalize.ts` turns those raw strings into numbers and ISO dates
 *      using locale-aware heuristics.
 *   3. `reconcile.ts` cross-checks the numbers (does total = subtotal + tax - discount + shipping?
 *      does the sum of line items match the subtotal?) and derives confidence.
 */

export type ExtractionFlag =
  | "not_an_invoice"
  | "missing_total"
  | "total_mismatch"
  | "subtotal_mismatch"
  | "total_derived"
  | "subtotal_derived"
  | "line_item_mismatch"
  | "tax_mismatch"
  | "missing_vendor"
  | "missing_invoice_number"
  | "ambiguous_date"
  | "unknown_currency"
  | "unparseable_amount"
  | "edited_by_user";

/** Amounts come back from the model as verbatim strings ("€ 1.234,56", "US$1,234.56"). */
export interface ModelLineItem {
  position: number;
  sku: string | null;
  description: string;
  quantity: string | null;
  unitPrice: string | null;
  amount: string | null;
}

export interface ModelConfidence {
  vendorName: number;
  vendorEmail: number;
  vendorAddress: number;
  vendorTaxId: number;
  invoiceNumber: number;
  poNumber: number;
  invoiceDate: number;
  dueDate: number;
  currency: number;
  subtotal: number;
  tax: number;
  taxRate: number;
  discount: number;
  shipping: number;
  total: number;
  paymentMethod: number;
  notes: number;
  items: number;
}

export interface ModelOutput {
  isInvoice: boolean;
  documentDescription: string;
  vendorName: string | null;
  vendorEmail: string | null;
  vendorAddress: string | null;
  vendorTaxId: string | null;
  invoiceNumber: string | null;
  poNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  currency: string | null;
  subtotal: string | null;
  tax: string | null;
  taxRate: string | null;
  discount: string | null;
  shipping: string | null;
  total: string | null;
  paymentMethod: string | null;
  notes: string | null;
  items: ModelLineItem[];
  confidence: ModelConfidence;
}

export interface NormalizedLineItem {
  position: number;
  sku: string | null;
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
}

export interface ExtractedInvoice {
  isInvoice: boolean;
  documentDescription: string;
  vendorName: string | null;
  vendorEmail: string | null;
  vendorAddress: string | null;
  vendorTaxId: string | null;
  invoiceNumber: string | null;
  poNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  currency: string | null;
  subtotal: number | null;
  tax: number | null;
  taxRate: number | null;
  discount: number | null;
  shipping: number | null;
  total: number | null;
  paymentMethod: string | null;
  notes: string | null;
  items: NormalizedLineItem[];
  confidence: ModelConfidence;
  flags: ExtractionFlag[];
}

/** Fields that are critical to a usable invoice. */
export const CRITICAL_FIELDS = [
  "vendorName",
  "invoiceNumber",
  "invoiceDate",
  "currency",
  "total",
] as const;

export const CONFIDENCE_FIELDS = [
  "vendorName",
  "vendorEmail",
  "vendorAddress",
  "vendorTaxId",
  "invoiceNumber",
  "poNumber",
  "invoiceDate",
  "dueDate",
  "currency",
  "subtotal",
  "tax",
  "taxRate",
  "discount",
  "shipping",
  "total",
  "paymentMethod",
  "notes",
  "items",
] as const;

export type ConfidenceField = (typeof CONFIDENCE_FIELDS)[number];

export function clampConfidence(v: number): number {
  return Math.round(Math.min(1, Math.max(0, v)) * 100) / 100;
}

export function emptyConfidence(): ModelConfidence {
  return Object.fromEntries(
    CONFIDENCE_FIELDS.map((f) => [f, 0]),
  ) as unknown as ModelConfidence;
}