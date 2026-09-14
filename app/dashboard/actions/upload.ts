"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export type UploadResult = {
  success: boolean;
  error?: string;
  documentId?: string;
};

export async function uploadInvoice(
  formData: FormData,
): Promise<UploadResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "You must be logged in to upload invoices." };
  }

  const file = formData.get("file") as File | null;

  if (!file) {
    return { success: false, error: "No file provided." };
  }

  if (file.type !== "application/pdf") {
    return { success: false, error: "Only PDF files are allowed." };
  }

  if (file.size > 10 * 1024 * 1024) {
    return { success: false, error: "File size must be less than 10MB." };
  }

  const timestamp = Date.now();
  const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `${user.id}/${timestamp}_${sanitized}`;

  const { error: uploadError } = await supabase.storage
    .from("invoices")
    .upload(filePath, file, {
      contentType: "application/pdf",
    });

  if (uploadError) {
    logger.warn("storage.upload", "Failed to upload invoice to storage", {
      error: uploadError.message,
    });
    return { success: false, error: uploadError.message };
  }

  // Record the document so the extraction lifecycle has a row to track.
  const { data: doc, error: insertError } = await supabase
    .from("documents")
    .insert({
      user_id: user.id,
      storage_path: filePath,
      filename: file.name,
      size_bytes: file.size,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertError) {
    logger.error("documents.insert", "Failed to record uploaded document", {
      error: insertError.message,
    });
    // Clean up the orphaned storage object so we don't leak files.
    await supabase.storage.from("invoices").remove([filePath]);
    return { success: false, error: "Could not record the upload. Please retry." };
  }

  revalidatePath("/dashboard");
  return { success: true, documentId: doc.id };
}