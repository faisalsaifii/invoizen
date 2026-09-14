"use server";

import { createClient } from "@/lib/supabase/server";
import { runExtractionFlow, type ExtractionFlowResult } from "./extraction-flow";

export type ProcessResult = ExtractionFlowResult;

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

  return runExtractionFlow(supabase, user.id, documentId);
}