"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, X } from "lucide-react";

type StatusFilter = "all" | "needs_review" | "ready";

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "needs_review", label: "Needs review" },
  { value: "ready", label: "Ready" },
];

function buildQuery({
  search,
  status,
  currency,
  vendor,
}: {
  search: string;
  status: string;
  currency: string;
  vendor: string;
}) {
  const params = new URLSearchParams();
  if (search.trim()) params.set("search", search.trim());
  if (status) params.set("status", status);
  if (currency) params.set("currency", currency);
  if (vendor) params.set("vendor", vendor);
  params.delete("page");
  const qs = params.toString();
  return qs ? `/dashboard/invoices?${qs}` : "/dashboard/invoices";
}

export function InvoicesFilter({
  currencies,
  vendors,
  initialSearch,
  initialStatus,
  initialCurrency,
  initialVendor,
}: {
  currencies: string[];
  vendors: string[];
  initialSearch: string;
  initialStatus: string;
  initialCurrency: string;
  initialVendor: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(initialSearch);
  const [isPending, startTransition] = useTransition();
  const urlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the live filter in sync with the URL (back/forward, badge clicks).
  const currentStatus = searchParams.get("status") ?? initialStatus;
  const currentCurrency = searchParams.get("currency") ?? initialCurrency;
  const currentVendor = searchParams.get("vendor") ?? initialVendor;

  const debouncedNav = useCallback(
    (getters: {
      search: () => string;
      status: () => string;
      currency: () => string;
      vendor: () => string;
    }) => {
      if (urlTimer.current) clearTimeout(urlTimer.current);
      urlTimer.current = setTimeout(() => {
        startTransition(() => {
          router.push(
            buildQuery({
              search: getters.search(),
              status: getters.status(),
              currency: getters.currency(),
              vendor: getters.vendor(),
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
    router.push(
      buildQuery({
        search,
        status: status === "all" ? "" : status,
        currency: currentCurrency ?? "",
        vendor: currentVendor ?? "",
      }),
    );
    router.refresh();
  }

  function setCurrency(currency: string) {
    router.push(
      buildQuery({
        search,
        status: currentStatus ?? "",
        currency,
        vendor: currentVendor ?? "",
      }),
    );
    router.refresh();
  }

  function setVendor(vendor: string) {
    router.push(
      buildQuery({
        search,
        status: currentStatus ?? "",
        currency: currentCurrency ?? "",
        vendor,
      }),
    );
    router.refresh();
  }

  const active =
    (currentStatus && currentStatus !== "") ||
    (currentCurrency && currentCurrency !== "") ||
    (currentVendor && currentVendor !== "") ||
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
                vendor: () => currentVendor ?? "",
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
                router.push(buildQuery({ search: "", status: currentStatus ?? "", currency: currentCurrency ?? "", vendor: currentVendor ?? "" }));
                router.refresh();
              }}
            >
              <X size={15} />
            </button>
          )}
        </div>

        <Tabs
          value={currentStatus === "" ? "all" : (currentStatus || "all")}
          onValueChange={(v) => setStatus(v as StatusFilter)}
          className="w-fit"
        >
          <TabsList>
            {STATUS_OPTIONS.map((opt) => (
              <TabsTrigger key={opt.value} value={opt.value} className="px-3 text-xs">
                {opt.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {currencies.length > 1 && (
          <Select value={currentCurrency ?? ""} onValueChange={(v) => setCurrency(v)}>
            <SelectTrigger className="w-[150px] bg-muted border-0 text-xs font-medium">
              <SelectValue placeholder="All currencies" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All currencies</SelectItem>
              {currencies.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {vendors.length > 0 && (
          <Select value={currentVendor ?? ""} onValueChange={(v) => setVendor(v)}>
            <SelectTrigger className="w-[180px] bg-muted border-0 text-xs font-medium">
              <SelectValue placeholder="All vendors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All vendors</SelectItem>
              {vendors.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {active && (
        <Button
          variant="link"
          className="h-auto self-start p-0 text-xs"
          onClick={() => {
            setSearch("");
            router.push("/dashboard/invoices");
            router.refresh();
          }}
        >
          Clear all filters
        </Button>
      )}
      {isPending && <p className="text-xs text-muted-foreground">Updating results…</p>}
    </div>
  );
}