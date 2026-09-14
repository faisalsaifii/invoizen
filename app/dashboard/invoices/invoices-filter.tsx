"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

type StatusFilter = "" | "needs_review" | "ready";

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "", label: "All" },
  { value: "needs_review", label: "Needs review" },
  { value: "ready", label: "Ready" },
];

function buildQuery({
  search,
  status,
  currency,
}: {
  search: string;
  status: string;
  currency: string;
}) {
  const params = new URLSearchParams();
  if (search.trim()) params.set("search", search.trim());
  if (status) params.set("status", status);
  if (currency) params.set("currency", currency);
  params.delete("page");
  const qs = params.toString();
  return qs ? `/dashboard/invoices?${qs}` : "/dashboard/invoices";
}

export function InvoicesFilter({
  currencies,
  initialSearch,
  initialStatus,
  initialCurrency,
}: {
  currencies: string[];
  initialSearch: string;
  initialStatus: string;
  initialCurrency: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(initialSearch);
  const [isPending, startTransition] = useTransition();
  const urlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the live filter in sync with the URL (back/forward, badge clicks).
  const currentStatus = searchParams.get("status") ?? initialStatus;
  const currentCurrency = searchParams.get("currency") ?? initialCurrency;

  const debouncedNav = useCallback(
    (getters: { search: () => string; status: () => string; currency: () => string }) => {
      if (urlTimer.current) clearTimeout(urlTimer.current);
      urlTimer.current = setTimeout(() => {
        startTransition(() => {
          router.push(
            buildQuery({
              search: getters.search(),
              status: getters.status(),
              currency: getters.currency(),
            }),
          );
          router.refresh();
        });
      }, 250);
    },
    [router],
  );

  useEffect(() => {
    return () => {
      if (urlTimer.current) clearTimeout(urlTimer.current);
    };
  }, []);

  function setStatus(status: StatusFilter) {
    router.push(buildQuery({ search, status, currency: currentCurrency ?? "" }));
    router.refresh();
  }

  function setCurrency(currency: string) {
    router.push(buildQuery({ search, status: currentStatus ?? "", currency }));
    router.refresh();
  }

  const active =
    (currentStatus && currentStatus !== "") ||
    (currentCurrency && currentCurrency !== "") ||
    initialSearch.trim() !== "";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-56">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              debouncedNav({
                search: () => e.target.value,
                status: () => currentStatus ?? "",
                currency: () => currentCurrency ?? "",
              });
            }}
            placeholder="Search vendor, invoice number, PO…"
            className="pl-9 pr-8"
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => {
                setSearch("");
                router.push(buildQuery({ search: "", status: currentStatus ?? "", currency: currentCurrency ?? "" }));
                router.refresh();
              }}
            >
              <X size={15} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setStatus(opt.value)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                currentStatus === opt.value
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {currencies.length > 1 && (
          <select
            value={currentCurrency ?? ""}
            onChange={(e) => setCurrency(e.target.value)}
            className="bg-muted rounded-lg px-3 py-2 text-xs font-medium border-0 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">All currencies</option>
            {currencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
      </div>

      {active && (
        <button
          type="button"
          className="text-xs text-muted-foreground underline underline-offset-2 self-start hover:text-foreground"
          onClick={() => {
            setSearch("");
            router.push("/dashboard/invoices");
            router.refresh();
          }}
        >
          Clear all filters
        </button>
      )}
      {isPending && <p className="text-xs text-muted-foreground">Updating results…</p>}
    </div>
  );
}