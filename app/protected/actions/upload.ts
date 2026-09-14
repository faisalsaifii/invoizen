"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type UploadResult = {
  success: boolean;
  error?: string;
  path?: string;
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
    return { success: false, error: uploadError.message };
  }

  revalidatePath("/protected");

  return { success: true, path: filePath };
}
