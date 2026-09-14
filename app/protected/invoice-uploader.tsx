"use client";

import { useRef, useState, useTransition } from "react";
import { uploadInvoice, type UploadResult } from "./actions/upload";
import { Button } from "@/components/ui/button";
import { Upload, CheckCircle, AlertCircle } from "lucide-react";

export function InvoiceUploader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<UploadResult | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    startTransition(async () => {
      const res = await uploadInvoice(formData);
      setResult(res);
      if (res.success && inputRef.current) {
        inputRef.current.value = "";
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={handleChange}
      />
      <Button
        variant="outline"
        disabled={isPending}
        onClick={() => inputRef.current?.click()}
      >
        <Upload size={16} />
        {isPending ? "Uploading..." : "Upload Invoice PDF"}
      </Button>
      {result?.success && (
        <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
          <CheckCircle size={14} />
          Invoice uploaded successfully.
        </div>
      )}
      {result?.error && (
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertCircle size={14} />
          {result.error}
        </div>
      )}
    </div>
  );
}
