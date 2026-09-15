"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { reviewInvoice, deleteInvoice, reprocessInvoice } from "../../actions/invoices";
import { FlagRow } from "@/components/invoice/flag-row";
import { ConfidenceDot } from "@/components/invoice/confidence-dot";
import { InvoiceStatusBadge } from "@/components/invoice/status-badge";
import { formatMoney, formatDateTime } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { InvoiceRow, InvoiceItemRow } from "@/lib/db";
import type { ModelConfidence } from "@/lib/extraction/types";
import {
  ExternalLink,
  RefreshCw,
  Save,
  Plus,
  X,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  Trash2,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ConfidenceMap {
  vendorName?: number;
  invoiceNumber?: number;
  invoiceDate?: number;
  currency?: number;
  total?: number;
  [key: string]: number | undefined;
}

export interface ReviewFormProps {
  invoice: InvoiceRow;
  items: InvoiceItemRow[];
  pdfUrl: string | null;
  pdfName: string;
}

function str(v: string | null | undefined): string {
  return v ?? "";
}

function num(v: number | null | undefined): string {
  return v === null || v === undefined ? "" : String(v);
}

function parseNum(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}

// Limits mirror the column precision in the invoices schema
// (numeric(14,2), numeric(5,2), numeric(14,4) from the migration).
const MONEY_LIMIT = 999_999_999_999.99;
const RATE_LIMIT = 999.99;
const QTY_LIMIT = 9_999_999_999.9999;

function checkBlocked(value: string, max: number, label: string): string | null {
  if (value.trim() === "") return null;
  const n = parseNum(value);
  if (n === null) return `${label} must be a valid number.`;
  if (Math.abs(n) > max) return `${label} is too large (max ${max.toLocaleString("en-US")}).`;
  return null;
}

function addLine(
  prev: Array<{ key: string; dupe: InvoiceItemRow }>,
  items: InvoiceItemRow[],
): Array<{ key: string; dupe: InvoiceItemRow }> {
  return [
    ...prev,
    {
      key: Math.random().toString(36).slice(2),
      dupe: {
        id: prev.length === 0 ? "new-line" : `${prev.length}-line`,
        invoice_id: "new",
        position: (items.length + prev.length) + 1,
        description: "",
        sku: null,
        quantity: 1,
        unit_price: 0,
        amount: 0,
        created_at: "now",
      },
    },
  ];
}

// Field labels kept inline next to their <Field> components for readability.

export function ReviewForm({ invoice, items, pdfUrl, pdfName }: ReviewFormProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busyAction, setBusyAction] = useState<"save" | "reprocess" | "delete" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [f, setF] = useState({
    vendorName: str(invoice.vendor_name),
    vendorEmail: str(invoice.vendor_email),
    vendorAddress: str(invoice.vendor_address),
    vendorTaxId: str(invoice.vendor_tax_id),
    invoiceNumber: str(invoice.invoice_number),
    poNumber: str(invoice.po_number),
    invoiceDate: str(invoice.invoice_date),
    dueDate: str(invoice.due_date),
    currency: str(invoice.currency),
    subtotal: num(invoice.subtotal),
    tax: num(invoice.tax),
    taxRate: num(invoice.tax_rate),
    discount: num(invoice.discount),
    shipping: num(invoice.shipping),
    total: num(invoice.total),
    paymentMethod: str(invoice.payment_method),
    notes: str(invoice.notes),
  });

  const [rows, setRows] = useState(() => items.map((it) => ({ key: it.id, dupe: { ...it } })));

  // Live sanity checks so reviewers see the arithmetic the pipeline ran.
  const computed = useMemo(() => {
    const st = parseNum(f.subtotal);
    const tx = parseNum(f.tax);
    const rate = parseNum(f.taxRate);
    const disc = parseNum(f.discount);
    const ship = parseNum(f.shipping);
    const tot = parseNum(f.total);
    const parts = [st ?? 0, tx ?? 0, ship ?? 0];
    if (disc && disc > 0) parts.push(-(disc ?? 0));
    const expected = parts.reduce((a, b) => a + b, 0);
    const itemsSum = rows.reduce((acc, r) => acc + (parseNum(num(r.dupe.amount)) ?? 0), 0);
    return {
      hasFigures: st !== null || tx !== null || tot !== null,
      totalOk: tot !== null && st !== null && tx !== null && Math.abs(tot - expected) < 0.005,
      totalsDefined: tot !== null && st !== null,
      itemsOk: st !== null && Math.abs(st - itemsSum) < 0.005,
      itemsHaveAmounts: rows.some((r) => parseNum(num(r.dupe.amount)) !== null),
      rateSanity: rate ? Math.abs(rate - ((tx ?? 0) / (st ?? 1)) * 100) < 1 : null,
      expected,
    };
  }, [f, rows]);

  const confidence = (invoice.confidence ?? {}) as ConfidenceMap;

  const blockers = useMemo(() => {
    const issues: string[] = [];
    const add = (issue: string | null) => {
      if (issue) issues.push(issue);
    };

    add(checkBlocked(f.subtotal, MONEY_LIMIT, "Subtotal"));
    add(checkBlocked(f.tax, MONEY_LIMIT, "Tax"));
    add(checkBlocked(f.discount, MONEY_LIMIT, "Discount"));
    add(checkBlocked(f.shipping, MONEY_LIMIT, "Shipping"));
    add(checkBlocked(f.total, MONEY_LIMIT, "Total"));
    add(checkBlocked(f.taxRate, RATE_LIMIT, "Tax rate"));

    if (f.currency.trim().length > 3) {
      issues.push("Currency must be a 3-letter code.");
    }

    rows.forEach((r, i) => {
      const line = i + 1;
      add(checkBlocked(num(r.dupe.quantity), QTY_LIMIT, `Line ${line} quantity`));
      add(checkBlocked(num(r.dupe.unit_price), MONEY_LIMIT, `Line ${line} unit price`));
      add(checkBlocked(num(r.dupe.amount), MONEY_LIMIT, `Line ${line} amount`));
    });

    return issues;
  }, [f, rows]);

  const canSave = blockers.length === 0;
  const flags = invoice.flags ?? [];
  const hasFlags = flags.length > 0;
  const isReady = invoice.status === "ready";

  function set<K extends keyof typeof f>(key: K, value: string) {
    setF((prev) => ({ ...prev, [key]: value }));
  }

  function rowAmount(idx: number) {
    return (candidate: string) => {
      setRows((prev) =>
        prev.map((r, i) => (i === idx ? { ...r, dupe: { ...r.dupe, amount: parseNum(candidate) } } : r)),
      );
    };
  }

  function rowQty(idx: number) {
    return (candidate: string) => {
      const qty = parseNum(candidate);
      setRows((prev) =>
        prev.map((r, i) => {
          if (i !== idx) return r;
          const d = { ...r.dupe, quantity: qty };
          const up = parseNum(num(r.dupe.unit_price));
          if (qty !== null && up !== null) d.amount = Math.round(qty * up * 100) / 100;
          return { ...r, dupe: d };
        }),
      );
    };
  }

  function rowPrice(idx: number) {
    return (candidate: string) => {
      const up = parseNum(candidate);
      setRows((prev) =>
        prev.map((r, i) => {
          if (i !== idx) return r;
          const d = { ...r.dupe, unit_price: up };
          const qty = parseNum(num(r.dupe.quantity));
          if (qty !== null && up !== null) d.amount = Math.round(qty * up * 100) / 100;
          return { ...r, dupe: d };
        }),
      );
    };
  }

  function handleSave() {
    if (busyAction) return;
    setBusyAction("save");
    setNotice(null);
    startTransition(async () => {
      const res = await reviewInvoice({
        invoiceId: invoice.id,
        vendorName: f.vendorName.trim() || null,
        vendorEmail: f.vendorEmail.trim() || null,
        vendorAddress: f.vendorAddress.trim() || null,
        vendorTaxId: f.vendorTaxId.trim() || null,
        invoiceNumber: f.invoiceNumber.trim() || null,
        poNumber: f.poNumber.trim() || null,
        invoiceDate: f.invoiceDate || null,
        dueDate: f.dueDate || null,
        currency: f.currency.trim() ? f.currency.trim().toUpperCase() : null,
        subtotal: parseNum(f.subtotal),
        tax: parseNum(f.tax),
        taxRate: parseNum(f.taxRate),
        discount: parseNum(f.discount),
        shipping: parseNum(f.shipping),
        total: parseNum(f.total),
        paymentMethod: f.paymentMethod.trim() || null,
        notes: f.notes.trim() || null,
        items: rows.map((r, i) => ({
          position: r.dupe.position ?? i + 1,
          sku: r.dupe.sku?.trim() || null,
          description: r.dupe.description ?? "",
          quantity: r.dupe.quantity,
          unit_price: r.dupe.unit_price,
          amount: r.dupe.amount,
        })),
      });
      setBusyAction(null);
      if (res.success) {
        setNotice("Saved — invoice marked ready.");
        router.refresh();
      } else {
        setNotice(res.error ?? "Could not save changes.");
      }
    });
  }

  function handleReprocess() {
    if (busyAction) return;
    setBusyAction("reprocess");
    setNotice(null);
    startTransition(async () => {
      const res = await reprocessInvoice(invoice.id);
      setBusyAction(null);
      if (res.success) {
        router.refresh();
        if (res.invoiceId && res.invoiceId !== invoice.id) {
          router.push(`/dashboard/invoices/${res.invoiceId}`);
        }
      } else {
        setNotice(res.error ?? res.message ?? "Could not reprocess the invoice.");
      }
    });
  }

  function handleDelete() {
    if (busyAction) return;
    if (!confirm("Delete this invoice and its original PDF? This cannot be undone.")) return;
    setBusyAction("delete");
    startTransition(async () => {
      const res = await deleteInvoice(invoice.id);
      if (res.success) {
        router.push("/dashboard/invoices");
        router.refresh();
      } else {
        setBusyAction(null);
        setNotice(res.error ?? "Could not delete the invoice.");
      }
    });
  }

  const inputCls = "h-9";

  return (
    <div className="flex flex-col gap-4 pb-10">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/invoices"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={15} />
            Invoices
          </Link>
          <InvoiceStatusBadge status={invoice.status} />
        </div>
        <div className="flex items-center gap-2">
          {pdfUrl ? (
            <Button variant="outline" size="sm" asChild>
              <a href={pdfUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={14} />
                Open original PDF
              </a>
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <X size={13} /> {pdfName}
            </span>
          )}
        </div>
      </div>

      {/* Review banner */}
      {hasFlags ? (
        <Card className="border-amber-300 bg-amber-50/50 dark:border-amber-600/40 dark:bg-amber-900/10">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
              <AlertTriangle size={15} />
              This invoice needs your review
            </div>
            <p className="text-xs text-muted-foreground mt-1 mb-3">
              The extraction pipeline flagged the items below. Fix what&apos;s
              wrong, then save to mark it ready.
            </p>
            <FlagRow flags={flags} />
          </CardContent>
        </Card>
      ) : (
        <Card className="border-emerald-300 bg-emerald-50/50 dark:border-emerald-600/40 dark:bg-emerald-900/10">
          <CardContent className="pt-6 flex items-center gap-2">
            <ShieldCheck size={16} className="text-emerald-600 dark:text-emerald-400" />
            <p className="text-sm text-emerald-800 dark:text-emerald-300">
              Every number reconciles — nothing to review. You can still correct
              anything the bot missed.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Live arithmetic summary */}
      {computed.hasFigures && (
        <div className="flex flex-wrap gap-2 text-xs">
          {computed.totalsDefined && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1",
                computed.totalOk
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
                  : "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300",
              )}
            >
              {computed.totalOk ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
              Total {computed.totalOk ? "matches" : "mismatch"} (expected {formatMoney(computed.expected, f.currency || "USD")})
            </span>
          )}
          {computed.itemsHaveAmounts && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1",
                computed.itemsOk
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
                  : "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300",
              )}
            >
              {computed.itemsOk ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
              Line items {computed.itemsOk ? "match" : "don't match"} subtotal
            </span>
          )}
          {computed.rateSanity !== null && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1",
                computed.rateSanity
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
                  : "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300",
              )}
            >
              {computed.rateSanity ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
              Tax rate {computed.rateSanity ? "consistent" : "looks off"}
            </span>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Vendor & document identity */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Vendor & identity</CardTitle>
            <CardDescription>
              Supplier who sent the invoice, and the reference numbers a search
              would use.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Field
              label="Vendor name"
              hint={confidence.vendorName}
              confidence={confidence}
            >
              <Input
                className={inputCls}
                value={f.vendorName}
                onChange={(e) => set("vendorName", e.target.value)}
                placeholder="Acme Corp"
              />
            </Field>
            <Field label="Vendor email" hint={confidence.vendorEmail} confidence={confidence}>
              <Input
                className={inputCls}
                type="email"
                value={f.vendorEmail}
                onChange={(e) => set("vendorEmail", e.target.value)}
              />
            </Field>
            <Field label="Vendor address" hint={confidence.vendorAddress} confidence={confidence}>
              <textarea
                className="min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={f.vendorAddress}
                onChange={(e) => set("vendorAddress", e.target.value)}
              />
            </Field>
            <Field label="VAT / tax ID" hint={confidence.vendorTaxId} confidence={confidence}>
              <Input
                className={inputCls}
                value={f.vendorTaxId}
                onChange={(e) => set("vendorTaxId", e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Invoice number" hint={confidence.invoiceNumber} confidence={confidence}>
                <Input
                  className={inputCls}
                  value={f.invoiceNumber}
                  onChange={(e) => set("invoiceNumber", e.target.value)}
                  placeholder="INV-2026-0001"
                />
              </Field>
              <Field label="PO number">
                <Input
                  className={inputCls}
                  value={f.poNumber}
                  onChange={(e) => set("poNumber", e.target.value)}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Invoice date" hint={confidence.invoiceDate} confidence={confidence}>
                <Input
                  className={inputCls}
                  type="date"
                  value={f.invoiceDate}
                  onChange={(e) => set("invoiceDate", e.target.value)}
                />
              </Field>
              <Field label="Due date">
                <Input
                  className={inputCls}
                  type="date"
                  value={f.dueDate}
                  onChange={(e) => set("dueDate", e.target.value)}
                />
              </Field>
            </div>
          </CardContent>
        </Card>

        {/* Money */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Amounts</CardTitle>
            <CardDescription>
              All numbers are stored as canonical decimals. The pipeline&apos;s
              locale parser handled the messy formatting for you.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Field label="Currency" hint={confidence.currency} confidence={confidence}>
              <Input
                className={cn(inputCls, "max-w-24 uppercase")}
                maxLength={3}
                value={f.currency}
                onChange={(e) => set("currency", e.target.value.toUpperCase())}
                placeholder="USD"
              />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Subtotal">
                <MoneyInput className={inputCls} value={f.subtotal} onChange={(v) => set("subtotal", v)} />
              </Field>
              <Field label="Tax">
                <MoneyInput className={inputCls} value={f.tax} onChange={(v) => set("tax", v)} />
              </Field>
              <Field label="Tax rate %">
                <Input
                  className={inputCls}
                  type="number"
                  step="any"
                  value={f.taxRate}
                  onChange={(e) => set("taxRate", e.target.value)}
                />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Discount">
                <MoneyInput className={inputCls} value={f.discount} onChange={(v) => set("discount", v)} />
              </Field>
              <Field label="Shipping">
                <MoneyInput className={inputCls} value={f.shipping} onChange={(v) => set("shipping", v)} />
              </Field>
              <Field label="Total" hint={confidence.total} confidence={confidence} strong>
                <MoneyInput className={cn(inputCls, "border-primary/50 font-semibold")} value={f.total} onChange={(v) => set("total", v)} />
              </Field>
            </div>
            <Field label="Payment method">
              <Input
                className={inputCls}
                value={f.paymentMethod}
                onChange={(e) => set("paymentMethod", e.target.value)}
                placeholder="Bank transfer"
              />
            </Field>
            <Field label="Notes">
              <textarea
                className="min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={f.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </Field>
          </CardContent>
        </Card>
      </div>

      {/* Line items */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Line items{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ({rows.length})
            </span>
          </CardTitle>
          <CardDescription>
            The bot borrowed these table rows from the PDF. Editing a quantity or
            unit price recalculates the amount for you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-2 w-10 font-medium">#</th>
                  <th className="pb-2 pr-3 font-medium">SKU</th>
                  <th className="pb-2 pr-3 font-medium">Description</th>
                  <th className="pb-2 pr-3 w-20 font-medium">Qty</th>
                  <th className="pb-2 pr-3 w-28 font-medium">Unit price</th>
                  <th className="pb-2 pr-3 w-28 font-medium">Amount</th>
                  <th className="pb-2 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r, i) => (
                  <tr key={r.key}>
                    <td className="py-2 pr-2 text-xs text-muted-foreground">{i + 1}</td>
                    <td className="py-2 pr-3">
                      <Input
                        className="h-8"
                        value={str(r.dupe.sku)}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((row, idx) =>
                              idx === i ? { ...row, dupe: { ...row.dupe, sku: e.target.value } } : row,
                            ),
                          )
                        }
                      />
                    </td>
                    <td className="py-2 pr-3 min-w-48">
                      <Input
                        className="h-8"
                        value={r.dupe.description ?? ""}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((row, idx) =>
                              idx === i
                                ? { ...row, dupe: { ...row.dupe, description: e.target.value } }
                                : row,
                            ),
                          )
                        }
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <Input
                        className="h-8"
                        type="number"
                        step="any"
                        value={num(r.dupe.quantity)}
                        onChange={(e) => rowQty(i)(e.target.value)}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <Input
                        className="h-8"
                        type="number"
                        step="any"
                        value={num(r.dupe.unit_price)}
                        onChange={(e) => rowPrice(i)(e.target.value)}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <Input
                        className="h-8"
                        type="number"
                        step="any"
                        value={num(r.dupe.amount)}
                        onChange={(e) => rowAmount(i)(e.target.value)}
                      />
                    </td>
                    <td className="py-2 w-8">
                      <button
                        type="button"
                        aria-label="Remove line item"
                        className="text-muted-foreground/60 hover:text-red-600 transition-colors"
                        onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                      >
                        <X size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => setRows((prev) => addLine(prev, items))}
            disabled={busyAction !== null}
          >
            <Plus size={14} />
            Add line item
          </Button>
        </CardContent>
      </Card>

      {/* Provenance */}
      <Card>
        <CardContent className="pt-4">
          {blockers.length > 0 && (
            <div className="mb-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="font-semibold">Can&apos;t save yet</div>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-destructive/90">
                  {blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span>Extracted: {formatMoney(invoice.total, invoice.currency)} in {invoice.currency ?? "—"}</span>
              <span>Status since: {invoice.reviewed_at ? formatDateTime(invoice.reviewed_at) : "never reviewed"}</span>
              <span>Flags: {flags.length}</span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleReprocess}
                disabled={busyAction !== null}
              >
                {busyAction === "reprocess" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Reprocess
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={busyAction !== null}
              >
                {busyAction === "delete" ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Delete
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={busyAction !== null || !canSave}
              >
                {busyAction === "save" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {isReady ? "Save changes" : "Save & mark ready"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {notice && (
        <div className="text-sm text-muted-foreground -mt-2">{notice}</div>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  confidence,
  strong,
  children,
}: {
  label: string;
  hint?: number;
  confidence?: ConfidenceMap;
  strong?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span
        className={cn(
          "text-xs text-muted-foreground flex items-center gap-1.5",
          strong && "font-semibold text-foreground",
        )}
      >
        {label}
        {hint !== undefined && confidence && (
          <ConfidenceDot value={hint} field={label} confidence={confidence as unknown as ModelConfidence} />
        )}
      </span>
      {children}
    </label>
  );
}

function MoneyInput({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <Input
      className={className}
      type="number"
      step="any"
      min="0"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}