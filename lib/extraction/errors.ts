export type ExtractionErrorKind =
  | "not-configured"
  | "invalid-pdf"
  | "bad-response"
  | "blocked"
  | "timeout"
  | "network"
  | "rate-limited"
  | "server-error";

export class ExtractionError extends Error {
  constructor(
    public readonly kind: ExtractionErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ExtractionError";
  }
}

/** Human-readable message mapped from an error kind. */
export function errorKindMessage(kind: ExtractionErrorKind): string {
  switch (kind) {
    case "not-configured":
      return "Extraction is not configured. Add GEMINI_API_KEY to your environment.";
    case "invalid-pdf":
      return "The file is not a readable PDF.";
    case "bad-response":
      return "The extraction model returned an unreadable response. Please retry.";
    case "blocked":
      return "The file could not be processed (content was blocked).";
    case "timeout":
      return "Extraction took too long and timed out. Please retry.";
    case "network":
      return "Could not reach the extraction service. Check your network and try again.";
    case "rate-limited":
      return "The extraction service is rate-limited right now. Please try again in a minute.";
    case "server-error":
      return "The extraction service had an error. Please retry.";
  }
}