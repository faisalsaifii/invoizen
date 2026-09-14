import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function InvoicesLink() {
  return (
    <Link
      href="/dashboard/invoices"
      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
    >
      View all invoices <ArrowRight size={14} />
    </Link>
  );
}