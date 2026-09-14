type LogLevel = "info" | "warn" | "error";

/** Flat, JSON-serializable context attached to a log line. */
export interface LogContext {
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * Minimal structured logger. Emits one JSON object per line so cloud log
 * sinks (Vercel, Datadog, CloudWatch) can parse it without an SDK.
 *
 * Only operational metadata is logged here — never API keys, PDF contents,
 * or invoice/customer data.
 */
function emit(level: LogLevel, op: string, msg: string, context?: LogContext): void {
  const entry: Record<string, string | number | boolean | null> = {
    time: new Date().toISOString(),
    level,
    op,
    msg,
  };
  if (context) {
    for (const [key, value] of Object.entries(context)) {
      if (value !== undefined) entry[key] = value;
    }
  }

  const line = JSON.stringify(entry);
  // Errors and warnings to stderr so they're not mixed into request output.
  if (level === "error" || level === "warn") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info(op: string, msg: string, context?: LogContext): void {
    emit("info", op, msg, context);
  },
  warn(op: string, msg: string, context?: LogContext): void {
    emit("warn", op, msg, context);
  },
  error(op: string, msg: string, context?: LogContext): void {
    emit("error", op, msg, context);
  },
};