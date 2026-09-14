import { Badge } from "@/components/ui/badge";
import type { DocumentStatus, InvoiceStatus } from "@/lib/db";

const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, string> = {
  pending: "Queued",
  processing: "Extracting",
  needs_review: "Needs review",
  ready: "Ready",
  failed: "Failed",
};

export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  const variant =
    status === "ready"
      ? "secondary"
      : status === "failed"
        ? "destructive"
        : status === "needs_review"
          ? "default"
          : "outline";
  return <Badge variant={variant}>{DOCUMENT_STATUS_LABEL[status]}</Badge>;
}

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return status === "ready" ? (
    <Badge variant="secondary">Ready</Badge>
  ) : (
    <Badge>Needs review</Badge>
  );
}