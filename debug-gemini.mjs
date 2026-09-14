// Temporary diagnostic: replicate lib/extraction/gemini.ts exactly against the live API.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { readFileSync } from "node:fs";

const key = process.env.GEMINI_API_KEY
  ?? readFileSync(".env.local", "utf8").match(/GEMINI_API_KEY=(.*)/)?.[1]?.trim();
const model = "gemini-3.5-flash";

// --- Build a small sample PDF with pdf-lib (same lib the app uses) ---
const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
const page = doc.addPage([595.28, 841.89]);
page.drawText("INVOICE INV-2026-0417", { x: 40, y: 780, size: 18, font, color: rgb(0.1, 0.1, 0.1) });
page.drawText("Acme Office Supplies, Inc.", { x: 40, y: 750, size: 12, font });
page.drawText("Date: 2026-08-21  Due: 2026-09-20  Currency: USD", { x: 40, y: 730, size: 10, font });
page.drawText("1x Premium A4 paper @ $8.50 = $8.50", { x: 40, y: 700, size: 10, font });
page.drawText("Subtotal: $8.50  VAT 8%: $0.68  TOTAL: $9.18 USD", { x: 40, y: 680, size: 10, font });
const pdfBytes = await doc.save();
console.log("PDF bytes:", pdfBytes.byteLength);

// --- base64 exactly like arrayBufferToBase64 in gemini.ts ---
const chunkSize = 0x8000;
let binary = "";
for (let i = 0; i < pdfBytes.length; i += chunkSize) {
  binary += String.fromCharCode(...pdfBytes.subarray(i, i + chunkSize));
}
const base64 = Buffer.from(binary, "binary").toString("base64");

const CONFIDENCE_FIELDS = [
  "vendorName","vendorEmail","vendorAddress","vendorTaxId","invoiceNumber","poNumber",
  "invoiceDate","dueDate","currency","subtotal","tax","taxRate","discount","shipping",
  "total","paymentMethod","notes","items",
];
const geminiResponseSchema = {
  type: "object",
  properties: {
    isInvoice: { type: "boolean" },
    documentDescription: { type: "string" },
    vendorName: { type: "string" }, vendorEmail: { type: "string" },
    vendorAddress: { type: "string" }, vendorTaxId: { type: "string" },
    invoiceNumber: { type: "string" }, poNumber: { type: "string" },
    invoiceDate: { type: "string" }, dueDate: { type: "string" },
    currency: { type: "string" }, subtotal: { type: "string" },
    tax: { type: "string" }, taxRate: { type: "string" },
    discount: { type: "string" }, shipping: { type: "string" },
    total: { type: "string" }, paymentMethod: { type: "string" },
    notes: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          position: { type: "integer" }, sku: { type: "string" },
          description: { type: "string" }, quantity: { type: "string" },
          unitPrice: { type: "string" }, amount: { type: "string" },
        },
        required: ["position", "description"],
      },
    },
    confidence: {
      type: "object",
      properties: Object.fromEntries(CONFIDENCE_FIELDS.map((f) => [f, { type: "number" }])),
    },
  },
  required: ["isInvoice", "documentDescription", "items", "confidence"],
};

const prompt = "You are an invoice extraction engine. Read the attached PDF and produce structured JSON. (test)";

const res = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [
        { parts: [{ inlineData: { mimeType: "application/pdf", data: base64 } }, { text: prompt }] },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: geminiResponseSchema,
      },
    }),
    signal: AbortSignal.timeout(50_000),
  },
);

console.log("HTTP status:", res.status);
const text = await res.text();
console.log("Body (first 2000 chars):", text.slice(0, 2000));
