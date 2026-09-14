import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

/**
 * Generates a syntactically-plausible invoice PDF on the fly. Used by the
 * "Try a sample invoice" button so a brand-new user can walk through upload →
 * extraction → review without hunting for a PDF on their machine.
 *
 * Two variants exist on purpose: `us` uses US number formatting ("$1,234.56")
 * and `eu` uses European formatting ("1.234,56 €"). Running the eu variant
 * through the pipeline is a live demo of the locale-aware number parser.
 */

export type SampleVariant = "us" | "eu";

const COLORS = {
  ink: rgb(0.15, 0.15, 0.2),
  muted: rgb(0.45, 0.45, 0.5),
  accent: rgb(0.16, 0.35, 0.65),
  line: rgb(0.85, 0.85, 0.88),
};

interface SampleData {
  company: string;
  companyAddress: string;
  customer: string;
  invoiceNo: string;
  date: string;
  due: string;
  currency: string;
  fmt: (n: number) => string;
  columns: Array<{ sku: string; description: string; qty: number; unit: number }>;
  taxRate: number;
}

const US: SampleData = {
  company: "Acme Office Supplies, Inc.",
  companyAddress: "1000 Market Street · Springfield, IL 62704 · US",
  customer: "Northwind Traders LLC\nAttn: Accounts Payable",
  invoiceNo: "INV-2026-0417",
  date: "2026-08-21",
  due: "2026-09-20",
  currency: "USD",
  fmt: (n) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  taxRate: 8,
  columns: [
    { sku: "A4-PAPER", description: "Premium A4 paper, 500 sheets (case of 3)", qty: 3, unit: 8.5 },
    { sku: "TNK-COLOR", description: "Color ink cartridge, XL", qty: 4, unit: 289.75 },
    { sku: "STPLR-HD", description: "Heavy-duty stapler, 20-sheet", qty: 2, unit: 34.25 },
  ],
};

const EU: SampleData = {
  company: "Musterfirma GmbH",
  companyAddress: "Hauptstraße 42 · 10115 Berlin · Deutschland",
  customer: "Beispiel Kundschaft KG\nz. Hd. Frau Beispiel",
  invoiceNo: "RE-2026-0482",
  date: "01.12.2026",
  due: "15.12.2026",
  currency: "EUR",
  fmt: (n) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  taxRate: 19,
  columns: [
    { sku: "D-1001", description: "Beratungsleistung, 10 Stunden", qty: 10, unit: 95 },
    { sku: "S-0230", description: "Softwarelizenz (Jahresabo)", qty: 1, unit: 284.56 },
  ],
};

interface GeneratedSample {
  bytes: Uint8Array;
  filename: string;
  displayName: string;
}

export async function generateSampleInvoice(variant: SampleVariant): Promise<GeneratedSample> {
  const data = variant === "us" ? US : EU;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const page = doc.addPage([595.28, 841.89]); // A4 portrait
  const { width } = page.getSize();

  drawHeader(page, doc, font, bold, data, width);
  drawMeta(page, bold, font, data, width);
  drawItems(page, bold, font, data, width);
  drawTotals(page, bold, font, data, width);

  const bytes = await doc.save();
  const displayName = `${data.company.replace(/[^a-zA-Z0-9]+/g, "-")}-sample-invoice.pdf`;
  return { bytes, filename: displayName, displayName };
}

function drawHeader(
  page: PDFPage,
  doc: PDFDocument,
  font: PDFFont,
  bold: PDFFont,
  data: SampleData,
  width: number,
) {
  const y = 760;
  drawWrapped(page, bold, data.company, 40, y, 16, COLORS.ink, 320);
  drawWrapped(page, font, "Sample invoice for demo purposes", 40, y - 22, 9, COLORS.muted, 320);
  drawWrapped(page, font, data.companyAddress, 40, y - 38, 9, COLORS.muted, 320);

  page.drawRectangle({ x: width - 240, y: 720, width: 200, height: 60, color: rgb(0.93, 0.95, 0.98) });
  page.drawText("INVOICE", { x: width - 228, y: 754, size: 18, font: bold, color: COLORS.accent });
  page.drawText(data.invoiceNo, { x: width - 228, y: 734, size: 11, font: bold, color: COLORS.ink });
}

function drawMeta(page: PDFPage, bold: PDFFont, font: PDFFont, data: SampleData, width: number) {
  let y = 660;
  const label = (text: string) => page.drawText(text, { x: 40, y, size: 8, font: bold, color: COLORS.muted });
  const value = (text: string, dx = 0) => page.drawText(text, { x: 40 + dx, y: y - 14, size: 9, font: font, color: COLORS.ink });

  label("BILLED TO");
  drawWrapped(page, font, data.customer, 40, y - 24, 9, COLORS.ink, 240);

  const rightX = width - 250;
  const right = (k: string, v: string) => {
    label(k);
    value(v, 8);
  };
  right("INVOICE DATE", data.date);
  page.drawText(data.date, { x: rightX + 8, y: y - 14, size: 9, font, color: COLORS.ink });
  label("DUE DATE");
  page.drawText(data.due, { x: rightX + 8, y: y - 30, size: 9, font, color: COLORS.ink });
  label("CURRENCY");
  page.drawText(data.currency, { x: rightX + 8, y: y - 46, size: 9, font, color: COLORS.ink });

  y -= 60;
  page.drawLine({ start: { x: 40, y }, end: { x: width - 40, y }, thickness: 1, color: COLORS.line });
}

function drawItems(
  page: PDFPage,
  bold: PDFFont,
  font: PDFFont,
  data: SampleData,
  width: number,
) {
  const startY = 560;
  const headY = startY + 18;
  page.drawText("ITEM", { x: 60, y: headY, size: 8, font: bold, color: COLORS.muted });
  page.drawText("QTY", { x: 340, y: headY, size: 8, font: bold, color: COLORS.muted });
  page.drawText("UNIT PRICE", { x: 400, y: headY, size: 8, font: bold, color: COLORS.muted });
  page.drawText("AMOUNT", { x: 490, y: headY, size: 8, font: bold, color: COLORS.muted });
  page.drawLine({ start: { x: 40, y: headY - 8 }, end: { x: width - 40, y: headY - 8 }, thickness: 1, color: COLORS.line });

  let y = startY;
  for (const row of data.columns) {
    page.drawText(row.sku, { x: 50, y, size: 8, font: bold, color: COLORS.muted });
    drawWrapped(page, font, row.description, 90, y, 9, COLORS.ink, 230);
    page.drawText(String(row.qty), { x: 340, y, size: 9, font, color: COLORS.ink });
    page.drawText(data.fmt(row.unit), { x: 400, y, size: 9, font, color: COLORS.ink });
    page.drawText(data.fmt(row.qty * row.unit), { x: 490, y, size: 9, font: bold, color: COLORS.ink });
    y -= 26;
  }
}

function drawTotals(
  page: PDFPage,
  bold: PDFFont,
  font: PDFFont,
  data: SampleData,
  width: number,
) {
  const subtotal = data.columns.reduce((acc, c) => acc + c.unit * c.qty, 0);
  const tax = Math.round(subtotal * data.taxRate) / 100;
  const total = subtotal + tax;

  const col = width - 260;
  let y = 300;
  const row = (label: string, value: string, useBold: boolean) => {
    const f = useBold ? bold : font;
    page.drawText(label, { x: col, y, size: 9, font: f, color: COLORS.muted });
    page.drawText(value, { x: col + 100, y, size: 9, font: f, color: COLORS.ink });
    y -= 18;
  };

  row("Subtotal", data.fmt(subtotal), false);
  row(`VAT ${data.taxRate}%`, data.fmt(tax), false);
  page.drawLine({ start: { x: col, y: y + 4 }, end: { x: width - 40, y: y + 4 }, thickness: 1, color: COLORS.line });
  row("TOTAL", `${data.fmt(total)} ${data.currency}`, true);

  drawWrapped(
    page,
    font,
    `Payment due by ${data.due}. Please remit to ${data.company}. This is a generated sample invoice used for demonstration.`,
    col,
    y - 24,
    8,
    COLORS.muted,
    220,
  );
}

function drawWrapped(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  size: number,
  color: ReturnType<typeof rgb>,
  maxWidth: number,
) {
  const words = text.split(" ");
  let line = "";
  let yPos = y;
  const indent = x;
  for (const word of words) {
    const test = line === "" ? word : `${line} ${word}`;
    if (maxWidth > 0 && font.widthOfTextAtSize(test, size) > maxWidth && line !== "") {
      page.drawText(line, { x: indent, y: yPos, size, font, color });
      yPos -= size + 2;
      line = word;
    } else {
      line = test;
    }
  }
  if (line !== "") {
    page.drawText(line, { x: indent, y: yPos, size, font, color });
  }
}