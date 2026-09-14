import type { ParsedModelOutput } from "./schema";

/**
 * Any model that can read a PDF and return our `ModelOutput` shape is a valid
 * extraction provider. This keeps the pipeline decoupled from a specific
 * vendor — the only provider today is Gemini, but the interface documents the
 * seam (a self-hosted model or a local OCR+LLM combination could slot in
 * without touching `pipeline.ts`).
 */
export interface ExtractionProvider {
  readonly name: string;
  extract(pdfBytes: Uint8Array, filename: string): Promise<ParsedModelOutput>;
}