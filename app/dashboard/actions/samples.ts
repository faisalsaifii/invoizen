"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { generateSampleInvoice, type SampleVariant } from "@/lib/samples";
import { logger } from "@/lib/logger";

export type SampleResult = {
  success: boolean;
  error?: string;
  documentId?: string;
};

/**
 * Generates a sample invoice PDF, stores it exactly like a user upload, and
 * returns the document id so the client can kick off extraction. This makes
 * the very first-run experience demonstrable in one click.
 */
export async function uploadSampleInvoice(variant: SampleVariant = "us"): Promise<SampleResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "You must be logged in." };
  }

  let generated;
  try {
    generated = await generateSampleInvoice(variant);
  } catch (err) {
    logger.error("samples.generate", "Sample invoice generation failed", {
      variant,
      error: err instanceof Error ? err.message : String(err),
    });
    return { success: false, error: "Could not generate the sample invoice." };
  }

  const timestamp = Date.now();
  const filePath = `${user.id}/${timestamp}_${generated.filename}`;

  const { error: uploadError } = await supabase.storage
    .from("invoices")
    .upload(filePath, generated.bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
  if (uploadError) {
    logger.warn("storage.upload", "Sample invoice upload failed", {
      variant,
      error: uploadError.message,
    });
    return { success: false, error: uploadError.message };
  }

  const { data: doc, error: insertError } = await supabase
    .from("documents")
    .insert({
      user_id: user.id,
      storage_path: filePath,
      filename: generated.displayName,
      size_bytes: generated.bytes.byteLength,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertError) {
    logger.error("documents.insert", "Failed to record sample document", {
      variant,
      error: insertError.message,
    });
    await supabase.storage.from("invoices").remove([filePath]);
    return { success: false, error: "Could not record the sample invoice." };
  }

  revalidatePath("/dashboard");
  return { success: true, documentId: doc.id };
}