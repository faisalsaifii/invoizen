"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { tryCreateProvider } from "@/lib/extraction/factory";
import { runExtraction } from "@/lib/extraction/pipeline";
import { errorKindMessage, ExtractionError, type ExtractionErrorKind } from "@/lib/extraction/errors";
import { logger } from "@/lib/logger";

export interface ReviewLineItemInput {
  position: number;
  sku?: string | null;
  description: string;
  quantity?: number | null;
  unit_price?: number | null;
  amount?: number | null;
}

export interface ReviewInvoiceInput {
  invoiceId: string;
  vendorName?: string | null;
  vendorEmail?: string | null;
  vendorAddress?: string | null;
  vendorTaxId?: string | null;
  invoiceNumber?: string | null;
  poNumber?: string | null;
  invoiceDate?: string | null;
  dueDate?: string | null;
  currency?: string | null;
  subtotal?: number | null;
  tax?: number | null;
  taxRate?: number | null;
  discount?: number | null;
  shipping?: number | null;
  total?: number | null;
  paymentMethod?: string | null;
  notes?: string | null;
  items: ReviewLineItemInput[];
}

export type ActionResult = {
  success: boolean;
  error?: string;
};

export type ReprocessResult = ActionResult & {
  status?: "ready" | "needs_review" | "failed";
  invoiceId?: string;
  message?: string;
};

function toNullableString(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}

function toNullableNumber(v: number | null | undefined): number | null {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  return v;
}

export async function reviewInvoice(input: ReviewInvoiceInput): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "You must be logged in." };

  const { data: existing } = await supabase
    .from("invoices")
    .select("id, document_id")
    .eq("id", input.invoiceId)
    .eq("user_id", user.id)
    .single();
  if (!existing) return { success: false, error: "Invoice not found." };

  const { data: doc } = await supabase
    .from("documents")
    .select("id")
    .eq("id", existing.document_id)
    .eq("user_id", user.id)
    .single();
  if (!doc) return { success: false, error: "Document not found." };

  const flags = ["edited_by_user"];

  const { error: updateError } = await supabase
    .from("invoices")
    .update({
      vendor_name: toNullableString(input.vendorName),
      vendor_email: toNullableString(input.vendorEmail),
      vendor_address: toNullableString(input.vendorAddress),
      vendor_tax_id: toNullableString(input.vendorTaxId),
      invoice_number: toNullableString(input.invoiceNumber),
      po_number: toNullableString(input.poNumber),
      invoice_date: toNullableString(input.invoiceDate),
      due_date: toNullableString(input.dueDate),
      currency: toNullableString(input.currency)?.toUpperCase() ?? null,
      subtotal: toNullableNumber(input.subtotal),
      tax: toNullableNumber(input.tax),
      tax_rate: toNullableNumber(input.taxRate),
      discount: toNullableNumber(input.discount),
      shipping: toNullableNumber(input.shipping),
      total: toNullableNumber(input.total),
      payment_method: toNullableString(input.paymentMethod),
      notes: toNullableString(input.notes),
      status: "ready",
      flags,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", input.invoiceId);

  if (updateError) {
    logger.error("invoices.review", "Failed to save invoice review", {
      invoiceId: input.invoiceId,
      error: updateError.message,
    });
    return {
      success: false,
      error: `Could not save your changes: ${updateError.message ?? updateError}`,
    };
  }

  // Replace line items wholesale — cheapest correct approach for review.
  const { error: deleteItemsError } = await supabase
    .from("invoice_items")
    .delete()
    .eq("invoice_id", input.invoiceId);
  if (deleteItemsError) {
    logger.error("invoices.review", "Failed to replace invoice line items", {
      invoiceId: input.invoiceId,
      error: deleteItemsError.message,
    });
  }
  if (input.items.length > 0) {
    const { error: itemsError } = await supabase.from("invoice_items").insert(
      input.items.map((it, i) => ({
        invoice_id: input.invoiceId,
        position: it.position ?? i + 1,
        sku: toNullableString(it.sku),
        description: it.description ?? "",
        quantity: toNullableNumber(it.quantity),
        unit_price: toNullableNumber(it.unit_price),
        amount: toNullableNumber(it.amount),
      })),
    );
    if (itemsError) {
      logger.error("invoices.review", "Failed to insert reviewed line items", {
        invoiceId: input.invoiceId,
        error: itemsError.message,
      });
      return {
        success: false,
        error: `Could not save line items: ${itemsError.message ?? itemsError}`,
      };
    }
  }

  await supabase
    .from("documents")
    .update({ status: "ready", status_message: null })
    .eq("id", existing.document_id);

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/invoices");
  revalidatePath(`/dashboard/invoices/${input.invoiceId}`);

  return { success: true };
}

export async function deleteInvoice(invoiceId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "You must be logged in." };

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, document_id, documents(storage_path)")
    .eq("id", invoiceId)
    .eq("user_id", user.id)
    .single();

  if (!invoice) return { success: false, error: "Invoice not found." };

  const storagePath = (invoice.documents as unknown as { storage_path: string } | null)?.storage_path;
  if (storagePath) {
    await supabase.storage.from("invoices").remove([storagePath]);
  }

  // Deleting the document cascades to invoices and items.
  const { error } = await supabase
    .from("documents")
    .delete()
    .eq("id", invoice.document_id);

  if (error) {
    logger.error("documents.delete", "Failed to delete invoice document", {
      invoiceId,
      documentId: invoice.document_id,
      error: error.message,
    });
    return { success: false, error: "Could not delete the invoice." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/invoices");
  return { success: true };
}

export async function reprocessInvoice(
  invoiceId: string,
): Promise<ReprocessResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "You must be logged in." };

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, document_id")
    .eq("id", invoiceId)
    .eq("user_id", user.id)
    .single();
  if (!invoice) return { success: false, error: "Invoice not found." };

  return processExistingDocument(invoice.document_id);
}

export async function reprocessDocument(documentId: string): Promise<ReprocessResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "You must be logged in." };

  const { data: doc } = await supabase
    .from("documents")
    .select("id")
    .eq("id", documentId)
    .eq("user_id", user.id)
    .single();
  if (!doc) return { success: false, error: "Document not found." };

  return processExistingDocument(documentId);
}

async function processExistingDocument(documentId: string): Promise<ReprocessResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "You must be logged in." };

  const provider = tryCreateProvider();
  if (!provider) {
    logger.warn("extraction.reprocess", "Extraction not configured (missing GEMINI_API_KEY)", {
      documentId,
    });
    return { success: false, error: errorKindMessage("not-configured") };
  }

  // Clear any previous extracted data up front so a partial failure doesn't
  // leave a stale invoice around.
  const { data: existingInvoices } = await supabase
    .from("invoices")
    .select("id")
    .eq("document_id", documentId)
    .eq("user_id", user.id);
  for (const inv of existingInvoices ?? []) {
    await supabase.from("invoice_items").delete().eq("invoice_id", inv.id);
    await supabase.from("invoices").delete().eq("id", inv.id);
  }

  await supabase
    .from("documents")
    .update({ status: "processing", status_message: null })
    .eq("id", documentId);

  const { data: doc } = await supabase
    .from("documents")
    .select("storage_path")
    .eq("id", documentId)
    .eq("user_id", user.id)
    .single();
  if (!doc) return { success: false, error: "Document not found." };

  const { data: blob } = await supabase.storage.from("invoices").download(doc.storage_path);
  if (!blob) {
    logger.error("extraction.reprocess", "Failed to read document from storage", {
      documentId,
      storagePath: doc.storage_path,
    });
    await supabase
      .from("documents")
      .update({ status: "failed", status_message: "Could not read the file from storage." })
      .eq("id", documentId);
    return { success: false, error: "Could not read the file from storage." };
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());

  let result;
  try {
    result = await runExtraction(bytes, provider);
  } catch (err) {
    const kind: ExtractionErrorKind =
      err instanceof ExtractionError ? err.kind : "server-error";
    const detail = err instanceof Error ? err.message : "Unknown extraction failure.";
    logger.error("extraction.reprocess", "Reprocessing failed", {
      documentId,
      kind,
      error: detail,
    });
    await supabase
      .from("documents")
      .update({ status: "failed", status_message: detail })
      .eq("id", documentId);
    return { success: false, error: errorKindMessage(kind), status: "failed", message: detail };
  }

  if (!result.ok || !result.invoice) {
    const kind = result.reason as ExtractionErrorKind;
    const message = result.message ?? errorKindMessage(kind);
    await supabase
      .from("documents")
      .update({ status: "failed", status_message: message })
      .eq("id", documentId);
    return { success: false, status: result.status, message, error: message };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("invoices")
    .insert({
      document_id: documentId,
      user_id: user.id,
      vendor_name: result.invoice.vendorName,
      vendor_email: result.invoice.vendorEmail,
      vendor_address: result.invoice.vendorAddress,
      vendor_tax_id: result.invoice.vendorTaxId,
      invoice_number: result.invoice.invoiceNumber,
      po_number: result.invoice.poNumber,
      invoice_date: result.invoice.invoiceDate,
      due_date: result.invoice.dueDate,
      currency: result.invoice.currency,
      subtotal: result.invoice.subtotal,
      tax: result.invoice.tax,
      tax_rate: result.invoice.taxRate,
      discount: result.invoice.discount,
      shipping: result.invoice.shipping,
      total: result.invoice.total,
      payment_method: result.invoice.paymentMethod,
      notes: result.invoice.notes,
      status: result.status,
      confidence: result.invoice.confidence,
      flags: result.invoice.flags,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    logger.error("extraction.reprocess", "Failed to save the re-extracted invoice", {
      documentId,
      error: insertError?.message,
    });
    await supabase
      .from("documents")
      .update({ status: "failed", status_message: "Could not save the extracted invoice." })
      .eq("id", documentId);
    return { success: false, error: "Could not save the extracted invoice." };
  }

  if (result.invoice.items.length > 0) {
    const { error: insertItemsError } = await supabase.from("invoice_items").insert(
      result.invoice.items.map((it) => ({
        invoice_id: inserted.id,
        position: it.position,
        sku: it.sku,
        description: it.description,
        quantity: it.quantity,
        unit_price: it.unitPrice,
        amount: it.amount,
      })),
    );
    if (insertItemsError) {
      logger.error("extraction.reprocess", "Failed to insert re-extracted line items", {
        documentId,
        invoiceId: inserted.id,
        error: insertItemsError.message,
      });
    }
  }

  await supabase
    .from("documents")
    .update({ status: result.status, status_message: null })
    .eq("id", documentId);

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/invoices");
  revalidatePath(`/dashboard/invoices/${inserted.id}`);

  return { success: true, status: result.status, invoiceId: inserted.id };
}