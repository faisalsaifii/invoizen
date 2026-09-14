import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  getDashboardStats,
  getRecentDocuments,
  listCurrencies,
} from "@/lib/data";
import { InvoiceUploader } from "./invoice-uploader";
import { DocumentStatusBadge } from "@/components/invoice/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCompactMoney, formatDateTime } from "@/lib/format";
import { InvoicesLink } from "./invoices-link";
import {
  CircleDollarSign,
  FileText,
  AlertTriangle,
  FileWarning,
  ArrowRight,
  Inbox,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const instant = false;

function StatCard({
  icon,
  label,
  value,
  sub,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  href?: string;
}) {
  const body = (
    <Card className="h-full transition-colors hover:border-primary/40">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function StatsGridSkeleton() {
  return (
    <div className="grid gap-4 grid-cols-2">
      {[0, 1, 2, 3].map((i) => (
        <Card key={i} className="h-full">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-4" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-3 w-28 mt-2" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function RecentDocsSkeleton() {
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Recent documents</h2>
        <InvoicesLink />
      </div>
      <Card>
        <CardContent className="flex flex-col divide-y">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Skeleton className="h-5 w-20 shrink-0" />
                <div className="min-w-0 flex flex-col gap-1">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-3 w-52" />
                </div>
              </div>
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

async function DashboardStats({ userId }: { userId: string }) {
  const [stats, currencies] = await Promise.all([
    getDashboardStats(userId),
    listCurrencies(),
  ]);

  const primaryCurrency =
    stats.totalByCurrency.find((c) => c.currency === "USD") ??
    stats.totalByCurrency[0] ??
    null;

  return (
    <>
      <div className="grid gap-4 grid-cols-2">
        <StatCard
          icon={<AlertTriangle size={16} className="text-amber-500" />}
          label="Needs review"
          value={stats.needsReviewCount}
          href={
            stats.needsReviewCount > 0
              ? "/dashboard/invoices?status=needs_review"
              : undefined
          }
        />
        <StatCard
          icon={<CircleDollarSign size={16} className="text-primary" />}
          label="Total"
          value={
            primaryCurrency
              ? formatCompactMoney(
                  primaryCurrency.total,
                  primaryCurrency.currency,
                )
              : "—"
          }
          href={
            primaryCurrency
              ? `/dashboard/invoices?currency=${primaryCurrency.currency}`
              : undefined
          }
        />
        <StatCard
          icon={<FileText size={16} className="text-sky-500" />}
          label="Invoices extracted"
          value={stats.invoiceCount}
          href="/dashboard/invoices"
        />
        <StatCard
          icon={<FileWarning size={16} className="text-red-500" />}
          label="Failed documents"
          value={stats.failedCount}
          href={
            stats.failedCount > 0
              ? `/dashboard/invoices?status=failed`
              : undefined
          }
        />
      </div>

      {currencies.length > 1 && (
        <p className="text-xs text-muted-foreground">
          Tracking {currencies.length} currencies:{" "}
          {currencies.slice(0, 6).join(", ")}
          {currencies.length > 6 ? "…" : ""}
        </p>
      )}
    </>
  );
}

async function RecentDocuments({ userId }: { userId: string }) {
  const recent = await getRecentDocuments(userId, 8);

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Recent documents</h2>
        <InvoicesLink />
      </div>
      {recent.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Inbox size={32} className="text-muted-foreground/50" />
            <div>
              <p className="text-sm font-medium">No invoices yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Upload a PDF above, or generate a sample invoice to see the
                whole flow in action.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg divide-y overflow-hidden bg-card">
          {recent.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <DocumentStatusBadge status={doc.status} />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {doc.invoice_id && doc.vendor_name
                      ? doc.vendor_name
                      : doc.filename}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {doc.filename} · {formatDateTime(doc.created_at)}
                  </p>
                </div>
              </div>
              {doc.status === "failed" && doc.status_message && (
                <span className="text-xs text-muted-foreground hidden md:block max-w-64 truncate">
                  {doc.status_message}
                </span>
              )}
              <div className="flex items-center gap-2 shrink-0">
                {doc.invoice_id ? (
                  <Link
                    href={`/dashboard/invoices/${doc.invoice_id}`}
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    Open <ArrowRight size={14} />
                  </Link>
                ) : doc.status === "pending" ? (
                  <span className="text-xs text-muted-foreground">
                    Waiting to be processed
                  </span>
                ) : doc.status === "failed" ? (
                  <span className="text-xs text-muted-foreground">
                    Upload it again
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Invoice inbox</h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Upload messy invoice PDFs. Invoizen extracts the fields, checks the
          math, and flags anything it isn&apos;t sure about for review.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
        <div className="flex flex-col gap-8 min-w-0 lg:sticky lg:top-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Upload an invoice</CardTitle>
              <CardDescription>
                US and European number formats, line items, and tax — handled
                automatically.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <InvoiceUploader />
            </CardContent>
          </Card>

          <Suspense fallback={<StatsGridSkeleton />}>
            <DashboardStats userId={user.id} />
          </Suspense>
        </div>

        <Suspense fallback={<RecentDocsSkeleton />}>
          <RecentDocuments userId={user.id} />
        </Suspense>
      </div>
    </div>
  );
}
