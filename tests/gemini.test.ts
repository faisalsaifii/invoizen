import { describe, expect, it } from "vitest";
import { GeminiProvider } from "@/lib/extraction/gemini";
import { ExtractionError } from "@/lib/extraction/errors";
import { modelOutputSchema } from "@/lib/extraction/schema";

const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e]); // %PDF-1.

const VALID_PAYLOAD = {
  candidates: [
    {
      finishReason: "STOP",
      content: {
        parts: [
          {
            text: JSON.stringify(
              modelOutputSchema.parse({
                isInvoice: true,
                documentDescription: "A test invoice.",
                vendorName: "Acme",
                invoiceNumber: "INV-1",
                invoiceDate: "2026-09-01",
                currency: "USD",
                subtotal: "100.00",
                tax: "0.00",
                taxRate: "0",
                total: "100.00",
                items: [],
                confidence: {
                  vendorName: 1,
                  invoiceNumber: 1,
                  invoiceDate: 1,
                  currency: 1,
                  subtotal: 1,
                  tax: 1,
                  taxRate: 1,
                  total: 1,
                  items: 1,
                },
              }),
            ),
          },
        ],
      },
    },
  ],
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("GeminiProvider retry handling", () => {
  it("retries on 503 then succeeds", async () => {
    let calls = 0;
    const provider = new GeminiProvider({
      apiKey: "test-key",
      model: "gemini-test-flash",
      timeoutMs: 5_000,
      maxRetries: 3,
      fetchImpl: async () => {
        calls++;
        if (calls === 1) return new Response("", { status: 503 });
        return jsonResponse(200, VALID_PAYLOAD);
      },
    });

    const out = await provider.extract(PDF_MAGIC);
    expect(out.invoiceNumber).toBe("INV-1");
    expect(calls).toBe(2);
  });

  it("retries with the cheaper fallback model", async () => {
    const requestedUrls: string[] = [];
    let calls = 0;
    const provider = new GeminiProvider({
      apiKey: "test-key",
      model: "gemini-test-flash",
      fallbackModels: ["gemini-test-flash-lite"],
      timeoutMs: 5_000,
      maxRetries: 3,
      fetchImpl: async (url) => {
        requestedUrls.push(String(url));
        calls++;
        if (calls === 1) return new Response("", { status: 503 });
        if (calls === 2) return new Response("", { status: 503 });
        return jsonResponse(200, VALID_PAYLOAD);
      },
    });

    const out = await provider.extract(PDF_MAGIC);
    expect(out.invoiceNumber).toBe("INV-1");
    expect(requestedUrls[0]).toContain("gemini-test-flash");
    expect(requestedUrls[1]).toContain("gemini-test-flash-lite");
    expect(requestedUrls[2]).toContain("gemini-test-flash-lite");
    expect(calls).toBe(3);
  });

  it("always calls the primary model when no fallbacks are configured", async () => {
    const requestedUrls: string[] = [];
    let calls = 0;
    const provider = new GeminiProvider({
      apiKey: "test-key",
      model: "gemini-test-flash",
      timeoutMs: 5_000,
      maxRetries: 1,
      fetchImpl: async (url) => {
        requestedUrls.push(String(url));
        calls++;
        if (calls === 1) return new Response("", { status: 503 });
        return jsonResponse(200, VALID_PAYLOAD);
      },
    });

    const out = await provider.extract(PDF_MAGIC);
    expect(out.invoiceNumber).toBe("INV-1");
    expect(requestedUrls).toHaveLength(2);
    expect(requestedUrls[0]).toContain("gemini-test-flash");
    expect(requestedUrls[1]).toContain("gemini-test-flash");
  });

  it("retries on 429 then succeeds", async () => {
    let calls = 0;
    const provider = new GeminiProvider({
      apiKey: "test-key",
      model: "gemini-test-flash",
      timeoutMs: 5_000,
      maxRetries: 3,
      fetchImpl: async () => {
        calls++;
        if (calls === 1) {
          return new Response("", { status: 429, headers: { "Retry-After": "0" } });
        }
        return jsonResponse(200, VALID_PAYLOAD);
      },
    });

    const out = await provider.extract(PDF_MAGIC);
    expect(out.invoiceNumber).toBe("INV-1");
    expect(calls).toBe(2);
  });

  it("throws server-error after exhausting retries", async () => {
    const provider = new GeminiProvider({
      apiKey: "test-key",
      model: "gemini-test-flash",
      timeoutMs: 5_000,
      maxRetries: 2,
      fetchImpl: async () => new Response("", { status: 503 }),
    });

    const err = await provider.extract(PDF_MAGIC).catch((e) => e);
    expect(err).toBeInstanceOf(ExtractionError);
    expect(err.kind).toBe("server-error");
  });

  it("accepts senders' Retry-After even as an HTTP-date", async () => {
    let calls = 0;
    const provider = new GeminiProvider({
      apiKey: "test-key",
      model: "gemini-test-flash",
      timeoutMs: 5_000,
      maxRetries: 1,
      fetchImpl: async () => {
        calls++;
        if (calls === 1) {
          return new Response("", {
            status: 503,
            headers: { "Retry-After": new Date(Date.now() + 1000).toUTCString() },
          });
        }
        return jsonResponse(200, VALID_PAYLOAD);
      },
    });

    const out = await provider.extract(PDF_MAGIC);
    expect(out.invoiceNumber).toBe("INV-1");
    expect(calls).toBe(2);
  });
});