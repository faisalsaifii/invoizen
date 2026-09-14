/** Environment-driven configuration for the extraction pipeline. */

export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";

export interface ExtractionConfig {
  geminiApiKey: string | undefined;
  geminiModel: string;
  /**
   * Cheaper models tried on retry, in order. Derived by default (the primary
   * model's "-flash-lite" sibling) so retries stay cheap without config.
   */
  geminiFallbackModels: string[];
  /** Hard timeout for a single model call (ms). Kept under the 60s serverless cap. */
  timeoutMs: number;
}

export function getExtractionConfig(): ExtractionConfig {
  const geminiModel = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  return {
    geminiApiKey: process.env.GEMINI_API_KEY,
    geminiModel,
    geminiFallbackModels: resolveFallbackModels(geminiModel, process.env.GEMINI_FALLBACK_MODELS),
    timeoutMs: 50_000,
  };
}

function resolveFallbackModels(model: string, envValue: string | undefined): string[] {
  if (envValue?.trim()) {
    return envValue
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);
  }
  if (model.endsWith("-flash") && !model.endsWith("-flash-lite")) {
    return [`${model}-lite`];
  }
  return [];
}