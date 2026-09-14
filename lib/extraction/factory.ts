import { getExtractionConfig } from "./config";
import { ExtractionError } from "./errors";
import { GeminiProvider } from "./gemini";
import type { ExtractionProvider } from "./provider";

/**
 * Build the extraction provider from the environment, or throw a descriptive
 * error when it is not configured. This is the single place that knows about
 * the GEMINI_API_KEY env var.
 */
export function createProvider(): ExtractionProvider {
  const config = getExtractionConfig();
  if (!config.geminiApiKey) {
    throw new ExtractionError(
      "not-configured",
      "GEMINI_API_KEY is not set in the environment.",
    );
  }
  return new GeminiProvider({
    apiKey: config.geminiApiKey,
    model: config.geminiModel,
    fallbackModels: config.geminiFallbackModels,
    timeoutMs: config.timeoutMs,
  });
}

/** Returns undefined (not throws) when the provider isn't configured. */
export function tryCreateProvider(): ExtractionProvider | undefined {
  try {
    return createProvider();
  } catch (err) {
    if (err instanceof ExtractionError && err.kind === "not-configured") {
      return undefined;
    }
    throw err;
  }
}