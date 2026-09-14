import { describe, expect, it } from "vitest";
import { reconcile } from "@/lib/extraction/reconcile";
import { emptyConfidence } from "@/lib/extraction/types";

function makeConfidence(overrides: Partial<Record<keyof ReturnType<typeof emptyConfidence>, number>> = {}) {
  return { ...emptyConfidence(), ...overrides };
}

describe("reconcile", () => {
  it("accepts a clean invoice", () => {
    const out = reconcile({
      subtotal: 100,
      tax: 20,
      taxRate: 20,
      discount: null,
      shipping: null,
      total: 120,
      items: [{ position: 1, description: "Widget", sku: null, quantity: 2, unitPrice: 50, amount: 100 }],
      confidence: makeConfidence(),
    });
    expect(out.flags).toHaveLength(0);
    expect(out.subtotal).toBe(100);
    expect(out.total).toBe(120);
  });

  it("flags a total that does not match subtotal + tax", () => {
    const out = reconcile({
      subtotal: 100,
      tax: 20,
      taxRate: null,
      discount: null,
      shipping: null,
      total: 130,
      items: [],
      confidence: makeConfidence(),
    });
    expect(out.flags).toContain("total_mismatch");
    expect(out.confidence.total).toBeLessThanOrEqual(0.3);
  });

  it("tolerates small rounding differences", () => {
    const out = reconcile({
      subtotal: 100,
      tax: 20,
      taxRate: null,
      discount: null,
      shipping: null,
      total: 120.01,
      items: [],
      confidence: makeConfidence(),
    });
    expect(out.flags).not.toContain("total_mismatch");
  });

  it("derives a missing total from reliable parts", () => {
    const out = reconcile({
      subtotal: 100,
      tax: 20,
      taxRate: null,
      discount: null,
      shipping: null,
      total: null,
      items: [],
      confidence: makeConfidence({ total: 0 }),
    });
    expect(out.total).toBe(120);
    expect(out.flags).toContain("total_derived");
    expect(out.confidence.total).toBeLessThanOrEqual(0.7);
  });

  it("marks a missing total when parts are unavailable", () => {
    const out = reconcile({
      subtotal: null,
      tax: null,
      taxRate: null,
      discount: null,
      shipping: null,
      total: null,
      items: [],
      confidence: makeConfidence(),
    });
    expect(out.flags).toContain("missing_total");
    expect(out.confidence.total).toBe(0);
  });

  it("flags a sum of line items that mismatches the subtotal", () => {
    const out = reconcile({
      subtotal: 100,
      tax: null,
      taxRate: null,
      discount: null,
      shipping: null,
      total: 100,
      items: [
        { position: 1, description: "A", sku: null, quantity: 1, unitPrice: 30, amount: 30 },
        { position: 2, description: "B", sku: null, quantity: 1, unitPrice: 60, amount: 60 },
      ],
      confidence: makeConfidence(),
    });
    expect(out.flags).toContain("subtotal_mismatch");
    expect(out.confidence.subtotal).toBeLessThanOrEqual(0.4);
  });

  it("fills a missing line-item amount from qty x unit price", () => {
    const items = [
      { position: 1, description: "A", sku: null, quantity: 2, unitPrice: 15.5, amount: null },
    ];
    const out = reconcile({
      subtotal: null,
      tax: null,
      taxRate: null,
      discount: null,
      shipping: null,
      total: null,
      items,
      confidence: makeConfidence(),
    });
    expect(items[0].amount).toBe(31);
    expect(out.flags).toContain("subtotal_derived");
  });

  it("flags an internally inconsistent line item", () => {
    const out = reconcile({
      subtotal: 100,
      tax: null,
      taxRate: null,
      discount: null,
      shipping: null,
      total: 100,
      items: [
        { position: 1, description: "A", sku: null, quantity: 2, unitPrice: 50, amount: 40 },
      ],
      confidence: makeConfidence(),
    });
    expect(out.flags).toContain("line_item_mismatch");
  });

  it("flags a tax rate that contradicts the tax amount", () => {
    const out = reconcile({
      subtotal: 100,
      tax: 5,
      taxRate: 20,
      discount: null,
      shipping: null,
      total: 105,
      items: [],
      confidence: makeConfidence(),
    });
    expect(out.flags).toContain("tax_mismatch");
    expect(out.confidence.tax).toBeLessThanOrEqual(0.4);
  });

  it("accounts for discount and shipping in the total", () => {
    const out = reconcile({
      subtotal: 100,
      tax: 20,
      taxRate: null,
      discount: 10,
      shipping: 5,
      total: 115,
      items: [],
      confidence: makeConfidence(),
    });
    expect(out.flags).not.toContain("total_mismatch");
  });

  it("compares total against line-item sums when subtotal is missing", () => {
    const out = reconcile({
      subtotal: null,
      tax: 20,
      taxRate: null,
      discount: null,
      shipping: null,
      total: 145,
      items: [{ position: 1, description: "A", sku: null, quantity: 1, unitPrice: 110, amount: 110 }],
      confidence: makeConfidence(),
    });
    expect(out.flags).toContain("total_mismatch");
  });
});