import { createClient } from "@/lib/supabase/server";
import type {
  DocumentRow,
  InvoiceItemRow,
  InvoiceWithDocument,
} from "@/lib/db";

export interface InvoicesFilters {
  search?: string;
  status?: "needs_review" | "ready";
  currency?: string;
  vendor?: string;
  limit?: number;
  offset?: number;
}

export interface InvoicesPage {
  invoices: InvoiceWithDocument[];
  total: number;
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/**
 * Search invoices with Postgres trigram (pg_trgm) ILIKE matching. Invoice
 * numbers and vendor names are codes/proper nouns, so trigram matching beats
 * word-stemming full-text search for the queries people actually type.
 */
export async function searchInvoices(
  userId: string,
  filters: InvoicesFilters,
): Promise<InvoicesPage> {
  const supabase = await createClient();

  let query = supabase
    .from("invoices")
    .select("*, documents(filename, storage_path, status, status_message, created_at)", {
      count: "exact",
    })
    .eq("user_id", userId)
    .order("invoice_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (filters.search) {
    const term = escapeLike(filters.search.trim());
    query = query.or(
      `vendor_name.ilike.%${term}%,invoice_number.ilike.%${term}%,po_number.ilike.%${term}%,notes.ilike.%${term}%`,
    );
  }
  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.currency) {
    query = query.eq("currency", filters.currency.toUpperCase());
  }
  if (filters.vendor) {
    query = query.eq("vendor_name", filters.vendor);
  }

  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  if (offset > 0) {
    query = query.range(offset, offset + limit - 1);
  } else {
    query = query.limit(limit);
  }

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to search invoices: ${error.message}`);
  }

  return {
    invoices: (data ?? []) as InvoiceWithDocument[],
    total: count ?? data?.length ?? 0,
  };
}

export async function getInvoiceDetail(
  userId: string,
  invoiceId: string,
): Promise<{ invoice: InvoiceWithDocument; items: InvoiceItemRow[] } | null> {
  const supabase = await createClient();

  const { data: invoice, error } = await supabase
    .from("invoices")
    .select(
      "*, documents(filename, storage_path, status, status_message, created_at)",
    )
    .eq("id", invoiceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !invoice) return null;

  const { data: items } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("position", { ascending: true });

  return {
    invoice: invoice as InvoiceWithDocument,
    items: (items ?? []) as InvoiceItemRow[],
  };
}

export async function getDocumentForUser(
  userId: string,
  documentId: string,
): Promise<DocumentRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as DocumentRow) ?? null;
}

export interface DashboardStats {
  invoiceCount: number;
  needsReviewCount: number;
  documentCount: number;
  failedCount: number;
  /** Sum of totals grouped by currency, ready + needs_review invoices only. */
  totalByCurrency: Array<{ currency: string; total: number }>;
}

export async function getDashboardStats(userId: string): Promise<DashboardStats> {
  const supabase = await createClient();

  const { data: invoiceRows } = await supabase
    .from("invoices")
    .select("status, currency, total")
    .eq("user_id", userId);

  const { data: docRows } = await supabase
    .from("documents")
    .select("status")
    .eq("user_id", userId);

  const byCurrency = new Map<string, number>();
  let needsReview = 0;
  for (const row of invoiceRows ?? []) {
    if (row.status === "needs_review") needsReview += 1;
    if (row.currency && typeof row.total === "number") {
      byCurrency.set(row.currency, (byCurrency.get(row.currency) ?? 0) + row.total);
    }
  }

  let failed = 0;
  for (const row of docRows ?? []) {
    if (row.status === "failed") failed += 1;
  }

  return {
    invoiceCount: (invoiceRows ?? []).length,
    needsReviewCount: needsReview,
    documentCount: (docRows ?? []).length,
    failedCount: failed,
    totalByCurrency: [...byCurrency.entries()]
      .map(([currency, total]) => ({ currency, total: Math.round(total * 100) / 100 }))
      .sort((a, b) => b.total - a.total),
  };
}

export async function getRecentDocuments(
  userId: string,
  limit = 8,
): Promise<Array<DocumentRow & { invoice_id: string | null; vendor_name: string | null }>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("documents")
    .select("*, invoices(id, vendor_name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return [];

  return (data ?? []).map((d) => {
    const related = d.invoices as
      | Array<{ id: string; vendor_name: string | null }>
      | { id: string; vendor_name: string | null }
      | null;
    const invoices = related ? (Array.isArray(related) ? related : [related]) : [];
    const first = invoices.filter(Boolean).pop();
    return {
      ...(d as DocumentRow),
      invoice_id: first?.id ?? null,
      vendor_name: first?.vendor_name ?? null,
    };
  });
}

export async function listCurrencies() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invoices")
    .select("currency")
    .not("currency", "is", null);
  return [...new Set((data ?? []).map((d) => d.currency))];
}

export async function listVendors() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invoices")
    .select("vendor_name")
    .not("vendor_name", "is", null)
    .order("vendor_name", { ascending: true });
  const vendors = [...new Set((data ?? []).map((d) => d.vendor_name as string).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b),
  );
  return vendors;
}