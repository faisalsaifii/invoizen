/**
 * Row shapes for the Supabase tables, kept in sync with
 * `supabase/migrations/20260914010000_create_invoices_schema.sql`.
 */

export type DocumentStatus = "pending" | "processing" | "needs_review" | "ready" | "failed";
export type InvoiceStatus = "needs_review" | "ready";

export interface DocumentRow {
  id: string;
  user_id: string;
  storage_path: string;
  filename: string;
  size_bytes: number;
  mime_type: string;
  status: DocumentStatus;
  status_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceRow {
  id: string;
  document_id: string;
  user_id: string;
  vendor_name: string | null;
  vendor_email: string | null;
  vendor_address: string | null;
  vendor_tax_id: string | null;
  invoice_number: string | null;
  po_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  currency: string | null;
  subtotal: number | null;
  tax: number | null;
  tax_rate: number | null;
  discount: number | null;
  shipping: number | null;
  total: number | null;
  payment_method: string | null;
  notes: string | null;
  status: InvoiceStatus;
  confidence: Record<string, number>;
  flags: string[];
  raw_data: Record<string, unknown>;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceItemRow {
  id: string;
  invoice_id: string;
  position: number;
  sku: string | null;
  description: string;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
  created_at: string;
}

export interface InvoiceWithDocument extends InvoiceRow {
  documents: Pick<DocumentRow, "filename" | "storage_path" | "status" | "status_message" | "created_at">;
}

export function isDocumentStatus(v: string): v is DocumentStatus {
  return ["pending", "processing", "needs_review", "ready", "failed"].includes(v);
}

export function isInvoiceStatus(v: string): v is InvoiceStatus {
  return ["needs_review", "ready"].includes(v);
}