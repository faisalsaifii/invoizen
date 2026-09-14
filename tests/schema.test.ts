import { describe, expect, it } from "vitest";
import { modelOutputSchema } from "@/lib/extraction/schema";
import { emptyConfidence } from "@/lib/extraction/types";

function valid() {
  return {
    isInvoice: true,
    documentDescription: "A one-page invoice.",
    vendorName: "Acme",
    invoiceNumber: "INV-1",
    items: [{ position: 1, description: "Widget", quantity: "2", unitPrice: "$10.00", amount: "$20.00" }],
    confidence: emptyConfidence(),
  };
}

describe("modelOutputSchema", () => {
  it("accepts a valid model response", () => {
    const out = modelOutputSchema.parse(valid());
    expect(out.vendorName).toBe("Acme");
    expect(out.items).toHaveLength(1);
  });

  it("turns empty strings into null", () => {
    const out = modelOutputSchema.parse({
      ...valid(),
      vendorName: "   ",
      invoiceNumber: "",
      items: [],
    });
    expect(out.vendorName).toBeNull();
    expect(out.invoiceNumber).toBeNull();
  });

  it("tolerates omitted optional fields", () => {
    const out = modelOutputSchema.parse(valid());
    expect(out.dueDate).toBeNull();
    expect(out.shipping).toBeNull();
  });

  it("defaults missing confidence entries to 0", () => {
    const out = modelOutputSchema.parse({
      ...valid(),
      confidence: { vendorName: 1 },
    });
    expect(out.confidence.vendorName).toBe(1);
    expect(out.confidence.total).toBe(0);
  });

  it("rejects a non-boolean isInvoice", () => {
    expect(() =>
      modelOutputSchema.parse({ ...valid(), isInvoice: "yes" }),
    ).toThrow();
  });

  it("rejects items without a description", () => {
    expect(() =>
      modelOutputSchema.parse({
        ...valid(),
        items: [{ position: 1 }],
      }),
    ).toThrow();
  });

  it("rejects out-of-range confidence", () => {
    expect(() =>
      modelOutputSchema.parse({
        ...valid(),
        confidence: { total: 7 },
      }),
    ).toThrow();
  });
});