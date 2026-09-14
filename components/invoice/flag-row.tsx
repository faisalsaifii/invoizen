import type { ExtractionFlag } from "@/lib/extraction/types";
import { AlertTriangle, Check, Eye } from "lucide-react";

/**
 * Human-readable explanations for the flags the extraction pipeline can raise.
 * These surface in the review UI so a human knows exactly why their invoice
 * was flagged rather than trusting a magic score.
 */
export const FLAG_META: Record<ExtractionFlag, { label: string; tone: "warn" | "info" }> = {
  not_an_invoice: { label: "Doesn't look like an invoice", tone: "warn" },
  missing_total: { label: "No total found", tone: "warn" },
  total_mismatch: { label: "Total doesn't add up", tone: "warn" },
  subtotal_mismatch: { label: "Line items don't match subtotal", tone: "warn" },
  total_derived: { label: "Total was calculated, not read", tone: "info" },
  subtotal_derived: { label: "Subtotal was calculated from items", tone: "info" },
  line_item_mismatch: { label: "A line item doesn't add up", tone: "warn" },
  tax_mismatch: { label: "Tax doesn't match the stated rate", tone: "warn" },
  missing_vendor: { label: "No vendor found", tone: "warn" },
  missing_invoice_number: { label: "No invoice number found", tone: "warn" },
  ambiguous_date: { label: "Date format is ambiguous", tone: "info" },
  unknown_currency: { label: "Unknown currency", tone: "warn" },
  unparseable_amount: { label: "An amount couldn't be read", tone: "warn" },
  edited_by_user: { label: "Edited for review", tone: "info" },
};

export function FlagRow({ flags }: { flags: string[] }) {
  if (flags.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
        <Check size={15} />
        All numbers reconcile. Nothing to review.
      </div>
    );
  }
  return (
    <ul className="space-y-1.5">
      {flags.map((f) => {
        const meta = FLAG_META[f as ExtractionFlag] ?? { label: f, tone: "warn" as const };
        const Icon = meta.tone === "warn" ? AlertTriangle : Eye;
        return (
          <li key={f} className="flex items-start gap-2 text-sm">
            <Icon
              size={15}
              className={`mt-0.5 shrink-0 ${meta.tone === "warn" ? "text-amber-600 dark:text-amber-400" : "text-sky-600 dark:text-sky-400"}`}
            />
            <span>{meta.label}</span>
          </li>
        );
      })}
    </ul>
  );
}