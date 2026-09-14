import type { ModelConfidence } from "@/lib/extraction/types";

function tone(v: number): string {
  if (v >= 0.7) return "bg-green-500";
  if (v >= 0.4) return "bg-amber-500";
  return "bg-red-500";
}

interface Props {
  value: number;
  field: string;
  confidence: ModelConfidence;
}

/**
 * A tiny confidence dot shown next to a field. Hovering reveals the "why"
 * (whether the model read it verbatim, was uncertain, or it was absent).
 */
export function ConfidenceDot({ value, field }: Props) {
  const label =
    value >= 0.7
      ? `${field} read with high confidence`
      : value >= 0.4
        ? `${field} uncertain`
        : value === 0
          ? `${field} not found`
          : `${field} guessed`;
  return (
    <span
      title={`${label} (${Math.round(value * 100)}%)`}
      className={`inline-block h-2 w-2 rounded-full ${tone(value)} shrink-0`}
    />
  );
}