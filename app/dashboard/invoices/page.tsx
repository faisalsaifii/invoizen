import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { searchInvoices, listCurrencies, type InvoicesFilters } from "@/lib/data";
import { InvoicesFilter } from "./invoices-filter";
import { InvoiceStatusBadge } from "@/components/invoice/status-badge";
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

  const currencies = await listCurrencies();
  const { invoices, total } = await searchInvoices(user.id, filters);

  const needsReviewCount = invoices.filter((i) => i.status === "needs_review").length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Invoices</h1>
        <p className="text-sm text-muted-foreground mt-1">
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
          initialSearch={params.search ?? ""}
          initialStatus={params.status ?? ""}
          initialCurrency={params.currency ?? ""}
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
    </div>
  );
}