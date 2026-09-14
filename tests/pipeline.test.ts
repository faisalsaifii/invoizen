import { describe, expect, it } from "vitest";
import { runExtraction } from "@/lib/extraction/pipeline";
import { modelOutputSchema, type ParsedModelOutput } from "@/lib/extraction/schema";
import { emptyConfidence } from "@/lib/extraction/types";
import type { ExtractionProvider } from "@/lib/extraction/provider";

const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e]); // %PDF-1.

function conf(partial: Partial<ParsedModelOutput["confidence"]> = {}) {
  return { ...emptyConfidence(), ...partial };
}

function makeProvider(
  shape: (raw: Partial<ParsedModelOutput>) => Partial<ParsedModelOutput>,
): ExtractionProvider {
  return {
    name: "fake",
    async extract() {
      return modelOutputSchema.parse(shape({ items: [], confidence: conf() }));
    },
  };
}

function usInvoice(): Partial<ParsedModelOutput> {
  return {
    isInvoice: true,
    documentDescription: "A one-page purchase invoice from Acme Office Supplies.",
    vendorName: "Acme Office Supplies",
    vendorEmail: "billing@acme.example",
    vendorAddress: "1000 Market St, Springfield",
    invoiceNumber: "INV-2026-0417",
    invoiceDate: "2026-08-21",
    dueDate: "2026-09-20",
    currency: "USD",
    subtotal: "US$1,184.50",
    tax: "US$94.76",
    taxRate: "8",
    total: "US$1,279.26",
    paymentMethod: "Visa •• 4242",
    items: [
      { position: 1, sku: "A4-PAPER", description: "Premium A4 paper (500 sheets x 3)", quantity: "3", unitPrice: "US$8.50", amount: "US$25.50" },
      { position: 2, sku: "TNK-COLOR", description: "Color ink cartridge", quantity: "4", unitPrice: "US$289.75", amount: "US$1,159.00" },
    ],
    confidence: conf({ vendorName: 1, invoiceNumber: 1, invoiceDate: 1, currency: 1, subtotal: 1, tax: 1, total: 1, items: 1 }),
  };
}

function euInvoice(): Partial<ParsedModelOutput> {
  return {
    isInvoice: true,
    documentDescription: "A one-page invoice from Musterfirma GmbH.",
    vendorName: "Musterfirma GmbH",
    invoiceNumber: "RE-2026-0482",
    invoiceDate: "01.12.2026",
    currency: "EUR",
    subtotal: "1.234,56",
    tax: "234,57",
    taxRate: "19",
    total: "1.469,13",
    items: [{ position: 1, sku: null, description: "Beratungsleistungen", quantity: "1", unitPrice: "1.234,56", amount: "1.234,56" }],
    confidence: conf({ vendorName: 1, invoiceNumber: 1, invoiceDate: 1, currency: 1, subtotal: 1, tax: 1, total: 1, items: 1 }),
  };
}

describe("runExtraction with a fake provider", () => {
  it("rejects non-PDF bytes", async () => {
    const provider = makeProvider((r) => r);
    const out = await runExtraction(new Uint8Array([1, 2, 3]), provider);
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("invalid-pdf");
  });

  it("extracts and normalizes a US invoice", async () => {
    const out = await runExtraction(PDF_MAGIC, makeProvider(() => usInvoice()));
    expect(out.ok).toBe(true);
    expect(out.status).toBe("ready");
    expect(out.invoice).toMatchObject({
      vendorName: "Acme Office Supplies",
      invoiceNumber: "INV-2026-0417",
      invoiceDate: "2026-08-21",
      currency: "USD",
      subtotal: 1184.5,
      tax: 94.76,
      total: 1279.26,
    });
    expect(out.invoice?.items).toHaveLength(2);
    expect(out.invoice?.items[1].amount).toBe(1159);
    expect(out.invoice?.flags).toHaveLength(0);
  });

  it("normalizes European separators and flags the ambiguous date", async () => {
    const out = await runExtraction(PDF_MAGIC, makeProvider(() => euInvoice()));
    expect(out.ok).toBe(true);
    expect(out.invoice?.subtotal).toBe(1234.56);
    expect(out.invoice?.tax).toBe(234.57);
    expect(out.invoice?.total).toBe(1469.13);
    expect(out.invoice?.items[0].unitPrice).toBe(1234.56);
    expect(out.invoice?.invoiceDate).toBe("2026-12-01");
    expect(out.invoice?.flags).toContain("ambiguous_date");
    expect(out.status).toBe("needs_review");
  });

  it("marks a non-invoice document as failed", async () => {
    const provider = makeProvider(() => ({
      isInvoice: false,
      documentDescription: "This is a bank statement, not an invoice.",
      confidence: conf(),
    }));
    const out = await runExtraction(PDF_MAGIC, provider);
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("not-an-invoice");
    expect(out.message).toContain("bank statement");
  });

  it("routes reconciliation failures to needs_review", async () => {
    const bad = usInvoice();
    bad.total = "US$9,999.00"; // won't match subtotal + tax
    const out = await runExtraction(PDF_MAGIC, makeProvider(() => bad));
    expect(out.status).toBe("needs_review");
    expect(out.invoice?.flags).toContain("total_mismatch");
  });

  it("routes low-confidence critical fields to needs_review", async () => {
    const shaky = usInvoice();
    shaky.confidence = conf({ total: 0.3 });
    const out = await runExtraction(PDF_MAGIC, makeProvider(() => shaky));
    expect(out.status).toBe("needs_review");
  });

  it("handles a document with no extractable fields gracefully", async () => {
    const empty = makeProvider(() => ({
      isInvoice: true,
      documentDescription: "A garbled scan.",
      confidence: conf(),
    }));
    const out = await runExtraction(PDF_MAGIC, empty);
    expect(out.status).toBe("needs_review");
    expect(out.invoice?.flags).toContain("missing_vendor");
    expect(out.invoice?.flags).toContain("missing_total");
  });
});