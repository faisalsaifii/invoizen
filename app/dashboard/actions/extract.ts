"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { tryCreateProvider } from "@/lib/extraction/factory";
import { runExtraction } from "@/lib/extraction/pipeline";
import { errorKindMessage, ExtractionError, type ExtractionErrorKind } from "@/lib/extraction/errors";
import { logger } from "@/lib/logger";
import type { ExtractedInvoice } from "@/lib/extraction/types";

export type ProcessResult = {
  success: boolean;
  error?: string;
  status?: "ready" | "needs_review" | "failed";
  invoiceId?: string;
  /** Human message on failure (e.g. "not an invoice"). */
  message?: string;
};

export async function getDocumentBytes(documentId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: doc } = await supabase
    .from("documents")
    .select("storage_path")
    .eq("id", documentId)
    .eq("user_id", user.id)
    .single();

  if (!doc) return null;

  const { data: blob } = await supabase.storage
    .from("invoices")
    .download(doc.storage_path);
  if (!blob) return null;

  return { bytes: new Uint8Array(await blob.arrayBuffer()), userId: user.id };
}

/**
 * Run the extraction pipeline for a previously uploaded document. The client
 * calls this after `uploadInvoice` returns, so the upload itself feels
 * instant and this step can run (and retry) independently.
 */
export async function processDocument(
  documentId: string,
): Promise<ProcessResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: "You must be logged in." };

  const { data: doc } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .eq("user_id", user.id)
    .single();

  if (!doc) {
    logger.warn("documents.process", "Document not found for processing", { documentId });
    return { success: false, error: "Document not found." };
  }

  await supabase
    .from("documents")
    .update({ status: "processing", status_message: null })
    .eq("id", documentId);

  const { data: blob } = await supabase.storage
    .from("invoices")
    .download(doc.storage_path);

  if (!blob) {
    logger.error("extraction.process", "Failed to read document from storage", {
      documentId,
      storagePath: doc.storage_path,
    });
    await failDocument(documentId, "bad-response", "Could not read the uploaded file from storage.");
    return { success: false, error: "Could not read the uploaded file." };
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());

  const provider = tryCreateProvider();
  if (!provider) {
    logger.warn("extraction.process", "Extraction not configured (missing GEMINI_API_KEY)", {
      documentId,
    });
    await failDocument(documentId, "not-configured", errorKindMessage("not-configured"));
    return { success: false, error: errorKindMessage("not-configured") };
  }

  let result;
  try {
    result = await runExtraction(bytes, provider);
  } catch (err) {
    const kind: ExtractionErrorKind =
      err instanceof ExtractionError ? err.kind : "server-error";
    const detail = err instanceof Error ? err.message : "Unknown extraction failure.";
    logger.error("extraction.process", "Extraction failed", {
      documentId,
      kind,
      error: detail,
    });
    const message = errorKindMessage(kind);
    await failDocument(documentId, kind, detail);
    return { success: false, error: message, message: detail };
  }

  if (!result.ok || !result.invoice) {
    await failDocument(
      documentId,
      result.reason as ExtractionErrorKind,
      result.message ?? result.reason ?? "This document could not be processed.",
    );
    return {
      success: false,
      status: result.status,
      message: result.message ?? "This document could not be processed.",
    };
  }

  const invoiceId = await persistInvoice(supabase, user.id, documentId, result.invoice, result.status);
  if (!invoiceId) {
    logger.error("extraction.process", "Failed to save the extracted invoice", { documentId });
    await failDocument(documentId, "server-error", "Could not save the extracted invoice.");
    return { success: false, error: "Could not save the extracted invoice." };
  }

  await supabase
    .from("documents")
    .update({ status: result.status, status_message: null })
    .eq("id", documentId);

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/invoices");

  logger.info("extraction.process", "Document processed", {
    documentId,
    status: result.status,
    invoiceId,
  });

  return {
    success: true,
    status: result.status,
    invoiceId,
  };
}

async function failDocument(
  documentId: string,
  kind: ExtractionErrorKind,
  message: string,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("documents")
    .update({ status: "failed", status_message: message })
    .eq("id", documentId);
  if (error) {
    logger.error("documents.fail", "Could not mark document as failed", {
      documentId,
      kind,
      error: error.message,
    });
  }
}

async function persistInvoice(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  documentId: string,
  invoice: ExtractedInvoice,
  status: "ready" | "needs_review" | "failed",
): Promise<string | null> {
  const { data, error } = await supabase
    .from("invoices")
    .insert({
      document_id: documentId,
      user_id: userId,
      vendor_name: invoice.vendorName,
      vendor_email: invoice.vendorEmail,
      vendor_address: invoice.vendorAddress,
      vendor_tax_id: invoice.vendorTaxId,
      invoice_number: invoice.invoiceNumber,
      po_number: invoice.poNumber,
      invoice_date: invoice.invoiceDate,
      due_date: invoice.dueDate,
      currency: invoice.currency,
      subtotal: invoice.subtotal,
      tax: invoice.tax,
      tax_rate: invoice.taxRate,
      discount: invoice.discount,
      shipping: invoice.shipping,
      total: invoice.total,
      payment_method: invoice.paymentMethod,
      notes: invoice.notes,
      status,
      confidence: invoice.confidence,
      flags: invoice.flags,
      raw_data: {
        documentType: invoice.documentDescription,
        itemCount: invoice.items.length,
        currencyText: invoice.currency,
      },
    })
    .select("id")
    .single();

  if (error || !data) {
    logger.error("extraction.persist", "Failed to insert invoice row", {
      documentId,
      error: error?.message,
    });
    return null;
  }

  if (invoice.items.length > 0) {
    const { error: itemsError } = await supabase.from("invoice_items").insert(
      invoice.items.map((it) => ({
        invoice_id: data.id,
        position: it.position,
        sku: it.sku,
        description: it.description,
        quantity: it.quantity,
        unit_price: it.unitPrice,
        amount: it.amount,
      })),
    );
    if (itemsError) {
      logger.error("extraction.persist", "Failed to insert invoice line items", {
        documentId,
        invoiceId: data.id,
        error: itemsError.message,
      });
      return null;
    }
  }

  return data.id;
}