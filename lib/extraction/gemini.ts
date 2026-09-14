import { EXTRACTION_PROMPT } from "./prompt";
import { geminiResponseSchema, modelOutputSchema, type ParsedModelOutput } from "./schema";
import { ExtractionError } from "./errors";
import { logger } from "@/lib/logger";
import type { ExtractionProvider } from "./provider";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

interface GeminiOptions {
  apiKey: string;
  model: string;
  /** Cheaper models tried on retry, in order. Falls back to `model` when empty. */
  fallbackModels?: string[];
  timeoutMs: number;
  /** Max retries for transient failures (429, 5xx, network). Defaults to 3. */
  maxRetries?: number;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

const MAX_RETRY_DELAY_MS = 8_000;
const BACKOFF_BASE_MS = 1_000;

/**
 * Gemini provider. Sends the PDF inline as base64 — Gemini's native vision
 * reads both text-based and scanned PDFs without a separate OCR step, which
 * is the whole reason we can treat every "messy" invoice the same way.
 * Structured output is enforced server-side with a response schema so the
 * result always parses.
 */
export class GeminiProvider implements ExtractionProvider {
  readonly name = "gemini";

  constructor(private readonly opts: GeminiOptions) {}

  async extract(pdfBytes: Uint8Array): Promise<ParsedModelOutput> {
    const {
      apiKey,
      model,
      fallbackModels = [],
      timeoutMs,
      fetchImpl = fetch,
      maxRetries = 3,
    } = this.opts;

    if (pdfBytes.byteLength === 0) {
      throw new ExtractionError("invalid-pdf", "Empty PDF.");
    }
    if (!isPdf(pdfBytes)) {
      throw new ExtractionError(
        "invalid-pdf",
        "File does not start with the PDF magic bytes.",
      );
    }

    const base64 = arrayBufferToBase64(pdfBytes);
    const headers = {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    };
    const body = JSON.stringify({
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: "application/pdf",
                data: base64,
              },
            },
            { text: EXTRACTION_PROMPT },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: geminiResponseSchema,
      },
    });

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      const currentModel = modelForAttempt(model, fallbackModels, attempt);
      const url = `${GEMINI_BASE_URL}/models/${currentModel}:generateContent`;
      const started = Date.now();

      let res: Response;
      try {
        res = await fetchImpl(url, {
          method: "POST",
          headers,
          body,
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        const durationMs = Date.now() - started;
        const timedOut = err instanceof Error && err.name === "TimeoutError";
        if (timedOut) {
          logger.error("gemini.extract", "Gemini request timed out", {
            currentModel,
            attempt,
            durationMs,
          });
        } else {
          logger.error("gemini.extract", "Gemini request failed at the network layer", {
            currentModel,
            attempt,
            durationMs,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        if (attempt <= maxRetries) {
          await waitBeforeRetry(attempt, null);
          continue;
        }
        if (timedOut) {
          throw new ExtractionError("timeout", "Gemini call timed out.");
        }
        throw new ExtractionError(
          "network",
          err instanceof Error ? err.message : "Unknown network error.",
        );
      }

      const durationMs = Date.now() - started;

      if (res.status === 429) {
        const retryAfter = res.headers.get("retry-after");
        logger.warn("gemini.extract", "Gemini rate limited", {
          currentModel,
          attempt,
          retryAfter: retryAfter ?? "",
          durationMs,
        });
        if (attempt <= maxRetries) {
          await waitBeforeRetry(attempt, retryAfter);
          continue;
        }
        throw new ExtractionError("rate-limited", "Gemini API rate limited.");
      }
      if (res.status >= 500) {
        const retryAfter = res.headers.get("retry-after");
        logger.error("gemini.extract", "Gemini server error", {
          currentModel,
          status: res.status,
          attempt,
          durationMs,
        });
        if (attempt <= maxRetries) {
          await waitBeforeRetry(attempt, retryAfter);
          continue;
        }
        throw new ExtractionError(
          "server-error",
          `Gemini API returned ${res.status}.`,
        );
      }
      if (!res.ok) {
        // The response body is kept only in the thrown error (the document's
        // status_message); it is dropped from the log since it may echo request
        // content.
        const errorBody = await safeText(res);
        logger.error("gemini.extract", "Gemini returned a non-success status", {
          currentModel,
          status: res.status,
          attempt,
          durationMs,
        });
        throw new ExtractionError(
          "bad-response",
          `Gemini API returned ${res.status}: ${errorBody}`,
        );
      }

      let data: unknown;
      try {
        data = await res.json();
      } catch {
        logger.error("gemini.extract", "Gemini returned non-JSON", {
          currentModel,
          durationMs,
        });
        throw new ExtractionError("bad-response", "Gemini returned non-JSON.");
      }

      const parsed = extractTextFromPayload(data, currentModel, durationMs);
      logger.info("gemini.extract", "Gemini extraction succeeded", {
        currentModel,
        attempt,
        durationMs,
      });
      return parsed;
    }

    throw new ExtractionError("server-error", "Gemini API request failed after retries.");
  }
}

function extractTextFromPayload(
  data: unknown,
  model: string,
  durationMs = 0,
): ParsedModelOutput {
  const payload = data as {
    candidates?: Array<{
      finishReason?: string;
      content?: { parts?: Array<{ text?: string }> };
    }>;
    error?: { message?: string };
  };

  if (payload.error?.message) {
    logger.error("gemini.extract", "Gemini returned an error payload", {
      model,
      error: payload.error.message,
      durationMs,
    });
    throw new ExtractionError(
      "bad-response",
      `Gemini error: ${payload.error.message}`,
    );
  }

  const candidate = payload.candidates?.[0];
  if (!candidate) {
    logger.error("gemini.extract", "Gemini returned no candidates", {
      model,
      durationMs,
    });
    throw new ExtractionError("bad-response", "Gemini returned no candidates.");
  }

  const finishReason = candidate.finishReason ?? "STOP";
  if (finishReason !== "STOP") {
    logger.warn("gemini.extract", "Gemini generation did not finish cleanly", {
      model,
      finishReason: String(finishReason),
      durationMs,
    });
    throw new ExtractionError(
      "blocked",
      `Gemini finished with reason: ${String(finishReason)}.`,
    );
  }

  const text = candidate.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const cleaned = stripCodeFence(text);

  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    logger.error("gemini.extract", "Gemini output was not JSON", {
      model,
      durationMs,
    });
    throw new ExtractionError(
      "bad-response",
      `Model output was not JSON (model=${model}).`,
    );
  }

  const parsed = modelOutputSchema.safeParse(json);
  if (!parsed.success) {
    logger.error("gemini.extract", "Gemini output failed schema validation", {
      model,
      issueCount: parsed.error.issues.length,
      durationMs,
    });
    throw new ExtractionError(
      "bad-response",
      `Model output failed schema validation: ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".") ?? "(root)"}`)
        .join(", ")}.`,
    );
  }
  return parsed.data;
}

/**
 * Which model to use for a given attempt. The first attempt always uses the
 * configured primary model; retries walk down the cheaper `fallbackModels`
 * list to cut cost (they only cost money when the first call already failed).
 */
function modelForAttempt(
  model: string,
  fallbackModels: readonly string[],
  attempt: number,
): string {
  if (attempt <= 1 || fallbackModels.length === 0) return model;
  const idx = attempt - 2;
  return fallbackModels[Math.min(idx, fallbackModels.length - 1)];
}

function retryDelayMs(retryAfter: string | null, attempt: number): number {
  const explicit = parseRetryAfter(retryAfter);
  if (explicit !== null) {
    return Math.min(explicit * 1000, MAX_RETRY_DELAY_MS);
  }
  // Exponential backoff with jitter. Attempt 1 -> ~1s, attempt 2 -> ~2s, ...
  const base = Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS);
  const jitter = Math.round(base * 0.2 * Math.random());
  return base + jitter;
}

/**
 * Resolve a `Retry-After` header to seconds, whether it is a delta-seconds
 * value or an HTTP-date. Returns null when absent/unparseable.
 */
function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const delta = Number(value);
  if (Number.isFinite(delta) && delta >= 0) return delta;
  const date = Date.parse(value);
  if (!Number.isNaN(date)) {
    const seconds = (date - Date.now()) / 1000;
    if (seconds > 0) return seconds;
  }
  return null;
}

/** Wait for the backoff window before the next attempt. */
function waitBeforeRetry(attempt: number, retryAfter: string | null): Promise<void> {
  const ms = retryDelayMs(retryAfter, attempt);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripCodeFence(text: string): string {
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/m.exec(text.trim());
  if (fence) return fence[1];
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }
  return text.trim();
}

function isPdf(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 5) return false;
  const head = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4]);
  return head === "%PDF-";
}

function safeText(res: Response): Promise<string> {
  return res.text().then((t) => t.slice(0, 500)).catch(() => "");
}

export function arrayBufferToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}