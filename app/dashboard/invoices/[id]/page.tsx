import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getInvoiceDetail } from "@/lib/data";
import { Skeleton } from "@/components/ui/skeleton";
import { ReviewForm } from "./review-form";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";

export const instant = false;

function InvoiceReviewSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Skeleton className="h-8 w-36" />
      </div>
      <Card className="border-amber-300">
        <CardContent className="pt-6">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-3 w-80 mt-2" />
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3.5 w-56" />
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <Skeleton className="h-5 w-28" />
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

async function InvoiceReview({
  userId,
  invoiceId,
  supabase,
}: {
  userId: string;
  invoiceId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const detail = await getInvoiceDetail(userId, invoiceId);
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
    <ReviewForm
      invoice={invoice}
      items={items}
      pdfUrl={pdfUrl}
      pdfName={invoice.documents?.filename ?? "original.pdf"}
    />
  );
}

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

  return (
    <div className="flex flex-col gap-4 pb-10">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/invoices"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={15} />
          Invoices
        </Link>
      </div>

      <Suspense fallback={<InvoiceReviewSkeleton />}>
        <InvoiceReview userId={user.id} invoiceId={id} supabase={supabase} />
      </Suspense>
    </div>
  );
}