"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { uploadInvoice } from "./actions/upload";
import { processDocument } from "./actions/extract";
import { uploadSampleInvoice } from "./actions/samples";
import { Button } from "@/components/ui/button";
import {
  Upload,
  Wand2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Phase = "idle" | "uploading" | "processing" | "success" | "error";

const PROCESS_STEPS = [
  "Reading the PDF",
  "Extracting vendor and dates",
  "Parsing line items",
  "Checking the math",
];

export function InvoiceUploader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/dashboard") {
      setPhase("idle");
      setError(null);
    }
  }, [pathname]);

  function startProgress() {
    setPhase("processing");
    setStepIndex(0);
    return setInterval(() => {
      setStepIndex((i) => Math.min(i + 1, PROCESS_STEPS.length - 1));
    }, 4000);
  }

  async function runFlow(opts: {
    kickoff: () => Promise<{
      success: boolean;
      error?: string;
      documentId?: string;
    }>;
    kickoffMessage: string;
    processingMessage: string;
  }) {
    setError(null);
    setPhase("uploading");
    try {
      const up = await opts.kickoff();
      if (!up.success || !up.documentId) {
        setPhase("error");
        setError(up.error ?? opts.kickoffMessage);
        return;
      }

      const stepTimer = startProgress();
      try {
        const res = await processDocument(up.documentId);
        if (!res.success) {
          setPhase("error");
          setError(res.message ?? res.error ?? opts.processingMessage);
          return;
        }
        setPhase("success");
        if (res.invoiceId) {
          router.push(`/dashboard/invoices/${res.invoiceId}`);
        }
        router.refresh();
      } finally {
        clearInterval(stepTimer);
      }
    } catch {
      setPhase("error");
      setError(opts.processingMessage);
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    startTransition(async () => {
      await runFlow({
        kickoff: async () => {
          const formData = new FormData();
          formData.append(
            "file",
            new Blob([await file.arrayBuffer()], { type: file.type }),
            file.name,
          );
          return uploadInvoice(formData);
        },
        kickoffMessage: "Upload failed. Please try again.",
        processingMessage: "Something went wrong while processing the file.",
      });
    });
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleSample() {
    startTransition(async () => {
      await runFlow({
        kickoff: () => uploadSampleInvoice("eu"),
        kickoffMessage: "Could not generate the sample.",
        processingMessage: "Something went wrong while processing the sample.",
      });
    });
  }

  const busy = isPending || phase === "uploading" || phase === "processing";

  return (
    <div className="flex flex-col gap-4">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={handleFile}
      />

      <div className="flex items-center gap-3">
        <Button
          variant="default"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy && phase === "uploading" ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Upload size={16} />
          )}
          {phase === "uploading"
            ? "Uploading…"
            : phase === "processing"
              ? "Processing…"
              : "Upload invoice PDF"}
        </Button>
        <Button
          variant="outline"
          disabled={busy || pathname !== "/dashboard"}
          onClick={handleSample}
        >
          <Wand2 size={16} />
          Try a sample invoice
        </Button>
      </div>

      {phase === "processing" && (
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 size={16} className="animate-spin" />
            <span>
              {PROCESS_STEPS[stepIndex]}
              {stepIndex >= 3 ? "" : "…"}
            </span>
          </div>
          <div className="flex gap-1.5">
            {PROCESS_STEPS.map((s, i) => {
              const done = i < stepIndex;
              const active = i === stepIndex;
              return (
                <div
                  key={s}
                  title={s}
                  className={cn(
                    "h-1.5 flex-1 rounded-full transition-colors",
                    done && "bg-primary",
                    active && "bg-primary/50",
                    !done && !active && "bg-muted",
                  )}
                />
              );
            })}
          </div>
        </div>
      )}

      {phase === "success" && (
        <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
          <CheckCircle2 size={15} />
          Invoice processed — opening details…
        </div>
      )}

      {phase === "error" && error && (
        <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <div className="flex flex-col gap-1">
            <span>{error}</span>
            <span className="text-xs text-muted-foreground">
              You can delete it and upload again from the invoices list.
            </span>
          </div>
        </div>
      )}

      {phase === "idle" && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <FileText size={14} />
          PDF only, up to 10MB.
        </div>
      )}
    </div>
  );
}
