import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { searchInvoices, listCurrencies, type InvoicesFilters } from "@/lib/data";
import { InvoicesFilter } from "./invoices-filter";
import { InvoiceStatusBadge } from "@/components/invoice/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney, formatDate } from "@/lib/format";
import { SearchX, AlertTriangle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { InvoiceWithDocument } from "@/lib/db";

export const instant = false;

function InvoicesContentSkeleton() {
  return (
    <>
      <div className="flex items-center gap-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-28 ml-auto" />
      </div>
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3.5 w-64" />
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 py-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-4 border-b py-2 last:border-b-0"
              >
                <div className="min-w-0 flex-1 flex flex-col gap-1">
                  <Skeleton className="h-3.5 w-36" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-3.5 w-16" />
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-5 w-20" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}

async function InvoicesContent({
  userId,
  filters,
  searchParams,
}: {
  userId: string;
  filters: InvoicesFilters;
  searchParams: { search?: string; status?: string; currency?: string };
}) {
  const [currencies, { invoices, total }] = await Promise.all([
    listCurrencies(),
    searchInvoices(userId, filters),
  ]);

  const needsReviewCount = invoices.filter((i) => i.status === "needs_review").length;

  return (
    <>
      <div>
        <p className="text-sm text-muted-foreground">
          {total} {total === 1 ? "result" : "results"}
          {Object.keys(filters).length > 0 && " with active filters"}
          {needsReviewCount > 0
            ? ` · ${needsReviewCount} need${needsReviewCount === 1 ? "s" : ""} your review`
            : ""}
        </p>
      </div>

      <Suspense fallback={null}>
        <InvoicesFilter
          currencies={currencies}
          initialSearch={searchParams.search ?? ""}
          initialStatus={searchParams.status ?? ""}
          initialCurrency={searchParams.currency ?? ""}
        />
      </Suspense>

      {invoices.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <SearchX size={32} className="text-muted-foreground/50" />
            <p className="text-sm font-medium">
              {Object.keys(filters).length > 0
                ? "No invoices match those filters"
                : "No invoices yet"}
            </p>
            <p className="text-xs text-muted-foreground">
              {Object.keys(filters).length > 0
                ? "Try a different search or clear the filters."
                : "Upload a PDF from the dashboard to get started."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Extracted invoices</CardTitle>
            <CardDescription>
              Click a row to review, correct, or reprocess the extraction.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Vendor</th>
                    <th className="pb-2 pr-4 font-medium">Invoice no.</th>
                    <th className="pb-2 pr-4 font-medium">Date</th>
                    <th className="pb-2 pr-4 font-medium">Total</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 font-medium">Review</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {invoices.map((inv: InvoiceWithDocument) => (
                    <tr key={inv.id} className="group">
                      <td className="py-3 pr-4">
                        <Link
                          href={`/dashboard/invoices/${inv.id}`}
                          className="font-medium hover:text-primary transition-colors"
                        >
                          {inv.vendor_name ?? "Unknown vendor"}
                        </Link>
                        {inv.vendor_email && (
                          <p className="text-xs text-muted-foreground">{inv.vendor_email}</p>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {inv.invoice_number ?? <span className="text-muted-foreground/60">—</span>}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {formatDate(inv.invoice_date)}
                      </td>
                      <td className="py-3 pr-4 font-medium whitespace-nowrap">
                        {formatMoney(inv.total, inv.currency)}
                      </td>
                      <td className="py-3 pr-4">
                        <InvoiceStatusBadge status={inv.status} />
                      </td>
                      <td className="py-3">
                        {inv.status === "needs_review" ? (
                          <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400 text-xs font-medium">
                            <AlertTriangle size={13} />
                            {(inv.flags ?? []).length} item
                            {((inv.flags ?? []).length ?? 1) === 1 ? "" : "s"}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; currency?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const params = await searchParams;

  const filters: InvoicesFilters = {};
  if (params.search && params.search.trim()) filters.search = params.search.trim();
  if (params.status === "needs_review" || params.status === "ready") {
    filters.status = params.status;
  }
  if (params.currency && params.currency.trim()) filters.currency = params.currency.trim();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">Invoices</h1>

      <Suspense fallback={<InvoicesContentSkeleton />}>
        <InvoicesContent userId={user.id} filters={filters} searchParams={params} />
      </Suspense>
    </div>
  );
}