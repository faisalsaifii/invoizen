"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, LayoutDashboard } from "lucide-react";

const tabs = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/invoices", label: "Invoices", icon: FileText },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <div className="flex gap-1 items-center text-muted-foreground">
      {tabs.map((tab) => {
        const active =
          tab.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={
              active
                ? "flex items-center gap-1.5 px-2 py-1 rounded-md bg-accent text-foreground transition-colors"
                : "flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-accent hover:text-foreground transition-colors"
            }
          >
            <tab.icon size={15} fill={active ? "currentColor" : "none"} />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}