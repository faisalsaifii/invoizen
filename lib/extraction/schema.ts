import { z } from "zod";
import { CONFIDENCE_FIELDS } from "./types";

/**
 * Validation schema for the model's raw JSON output.
 *
 * Amounts and dates are strings (not numbers) — we parse them ourselves using
 * locale-aware heuristics, which is testable and predictable. The model is
 * told to copy them verbatim from the document.
 *
 * Empty strings ("") from the model become null. Missing keys also become
 * null (via .optional() on each field).
 */

const STRING_FIELD = z
  .union([z.string(), z.null()])
  .transform((v) => (v === null || v.trim() === "" ? null : v.trim()));

const OPT = z
  .union([z.string(), z.null()])
  .default(null)
  .transform((v) => (v === null || v.trim() === "" ? null : v.trim()));
const confidenceFieldSchema = () => z.number().min(0).max(1).default(0);

const lineItemSchema = z.object({
  position: z.number().int().positive(),
  sku: OPT,
  description: z.string(),
  quantity: OPT,
  unitPrice: OPT,
  amount: OPT,
});

export const modelOutputSchema = z.object({
  isInvoice: z.boolean(),
  documentDescription: STRING_FIELD,
  vendorName: OPT,
  vendorEmail: OPT,
  vendorAddress: OPT,
  vendorTaxId: OPT,
  invoiceNumber: OPT,
  poNumber: OPT,
  invoiceDate: OPT,
  dueDate: OPT,
  currency: OPT,
  subtotal: OPT,
  tax: OPT,
  taxRate: OPT,
  discount: OPT,
  shipping: OPT,
  total: OPT,
  paymentMethod: OPT,
  notes: OPT,
  items: z.array(lineItemSchema).default([]),
  confidence: z.object(
    Object.fromEntries(
      CONFIDENCE_FIELDS.map((f) => [f, confidenceFieldSchema()]),
    ),
  ),
});

export type ParsedModelOutput = z.infer<typeof modelOutputSchema>;

/**
 * The JSON Schema sent to Gemini to constrain its output. Must be kept in
 * lockstep with `modelOutputSchema`. Restricted to the subset that Gemini's
 * structured output mode supports (no $ref, no oneOf).
 */
export const geminiResponseSchema = {
  type: "object",
  properties: {
    isInvoice: { type: "boolean" },
    documentDescription: { type: "string" },
    vendorName: { type: "string" },
    vendorEmail: { type: "string" },
    vendorAddress: { type: "string" },
    vendorTaxId: { type: "string" },
    invoiceNumber: { type: "string" },
    poNumber: { type: "string" },
    invoiceDate: { type: "string" },
    dueDate: { type: "string" },
    currency: { type: "string" },
    subtotal: { type: "string" },
    tax: { type: "string" },
    taxRate: { type: "string" },
    discount: { type: "string" },
    shipping: { type: "string" },
    total: { type: "string" },
    paymentMethod: { type: "string" },
    notes: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          position: { type: "integer" },
          sku: { type: "string" },
          description: { type: "string" },
          quantity: { type: "string" },
          unitPrice: { type: "string" },
          amount: { type: "string" },
        },
        required: ["position", "description"],
      },
    },
    confidence: {
      type: "object",
      properties: Object.fromEntries(
        CONFIDENCE_FIELDS.map((f) => [f, { type: "number" }]),
      ),
    },
  },
  required: ["isInvoice", "documentDescription", "items", "confidence"],
} as const;