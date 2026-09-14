import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getInvoiceDetail } from "@/lib/data";
import { ReviewForm } from "./review-form";

export const instant = false;

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { id } = await params;
  const detail = await getInvoiceDetail(user.id, id);
  if (!detail) notFound();

  const { invoice, items } = detail;

  let pdfUrl: string | null = null;
  if (invoice.documents?.storage_path) {
    const { data } = await supabase.storage
      .from("invoices")
      .createSignedUrl(invoice.documents.storage_path, 3600);
    pdfUrl = data?.signedUrl ?? null;
  }

  return (
    <Suspense>
      <ReviewForm
        invoice={invoice}
        items={items}
        pdfUrl={pdfUrl}
        pdfName={invoice.documents?.filename ?? "original.pdf"}
      />
    </Suspense>
  );
}