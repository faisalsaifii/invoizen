import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { tryCreateProvider } from "@/lib/extraction/factory";
import { runExtraction } from "@/lib/extraction/pipeline";
import { errorKindMessage, ExtractionError, type ExtractionErrorKind } from "@/lib/extraction/errors";
import { logger } from "@/lib/logger";
import type { ExtractedInvoice } from "@/lib/extraction/types";

export type ExtractionFlowResult = {
  success: boolean;
  error?: string;
  status?: "ready" | "needs_review" | "failed";
  invoiceId?: string;
  /** Human message on failure (e.g. "not an invoice"). */
  message?: string;
};

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Run the full extraction lifecycle for a document: mark it processing, pull
 * the PDF from storage, run the pipeline, persist the result, and surface the
 * failure reason on the document row. Shared by the first-time upload flow and
 * the reprocess flow — the only difference is whether a stale invoice should
 * be cleared before re-extracting.
 */
export async function runExtractionFlow(
  supabase: SupabaseClient,
  userId: string,
  documentId: string,
  options: { clearExisting?: boolean } = {},
): Promise<ExtractionFlowResult> {
  const { clearExisting = false } = options;

  const provider = tryCreateProvider();
  if (!provider) {
    logger.warn("extraction.process", "Extraction not configured (missing GEMINI_API_KEY)", {
      documentId,
    });
    return { success: false, error: errorKindMessage("not-configured") };
  }

  const { data: doc } = await supabase
    .from("documents")
    .select("storage_path")
    .eq("id", documentId)
    .eq("user_id", userId)
    .single();

  if (!doc) {
    logger.warn("extraction.process", "Document not found for processing", { documentId });
    return { success: false, error: "Document not found." };
  }

  // Reprocessing replaces any previous extraction so a partial failure can't
  // leave a stale invoice around. Runs after the ownership check above so it
  // never touches another user's data.
  if (clearExisting) {
    const { data: existingInvoices } = await supabase
      .from("invoices")
      .select("id")
      .eq("document_id", documentId)
      .eq("user_id", userId);
    for (const inv of existingInvoices ?? []) {
      await supabase.from("invoice_items").delete().eq("invoice_id", inv.id);
      await supabase.from("invoices").delete().eq("id", inv.id);
    }
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
    await failDocument(supabase, documentId, "bad-response", "Could not read the uploaded file.");
    return { success: false, error: "Could not read the uploaded file." };
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());

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
    await failDocument(supabase, documentId, kind, detail);
    return { success: false, status: "failed", error: errorKindMessage(kind), message: detail };
  }

  if (!result.ok || !result.invoice) {
    const message = result.message ?? "This document could not be processed.";
    await failDocument(supabase, documentId, result.reason as ExtractionErrorKind, message);
    return { success: false, status: result.status, message, error: message };
  }

  const invoiceId = await persistInvoice(supabase, userId, documentId, result.invoice, result.status);
  if (!invoiceId) {
    logger.error("extraction.process", "Failed to save the extracted invoice", { documentId });
    await failDocument(supabase, documentId, "server-error", "Could not save the extracted invoice.");
    return { success: false, error: "Could not save the extracted invoice." };
  }

  await supabase
    .from("documents")
    .update({ status: result.status, status_message: null })
    .eq("id", documentId);

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/invoices");
  revalidatePath(`/dashboard/invoices/${invoiceId}`);

  logger.info("extraction.process", "Document processed", {
    documentId,
    status: result.status,
    invoiceId,
  });

  return { success: true, status: result.status, invoiceId };
}

async function failDocument(
  supabase: SupabaseClient,
  documentId: string,
  kind: ExtractionErrorKind,
  message: string,
) {
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
  supabase: SupabaseClient,
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
      // Don't leave a half-written invoice behind.
      await supabase.from("invoices").delete().eq("id", data.id);
      return null;
    }
  }

  return data.id;
}