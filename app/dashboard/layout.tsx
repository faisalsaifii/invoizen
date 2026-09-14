import { AuthButton } from "@/components/auth-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { hasEnvVars } from "@/lib/utils";
import Link from "next/link";
import { Suspense } from "react";
import { FileText, LayoutDashboard } from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col gap-20 items-center">
        <nav className="w-full flex justify-center border-b border-b-foreground/10 h-16">
          <div className="w-full max-w-6xl flex justify-between items-center p-3 px-5 text-sm">
            <div className="flex gap-6 items-center font-semibold">
              <Link href={"/dashboard"} className="text-base">
                Invoizen
              </Link>
              <div className="flex gap-1 items-center text-muted-foreground">
                <Link
                  href={"/dashboard"}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-accent hover:text-foreground transition-colors"
                >
                  <LayoutDashboard size={15} />
                  Dashboard
                </Link>
                <Link
                  href={"/dashboard/invoices"}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-accent hover:text-foreground transition-colors"
                >
                  <FileText size={15} />
                  Invoices
                </Link>
              </div>
            </div>
            {!hasEnvVars ? null : (
              <Suspense>
                <AuthButton />
              </Suspense>
            )}
          </div>
        </nav>
        <div className="flex-1 flex flex-col gap-10 max-w-6xl w-full px-5">
          {children}
        </div>

        <footer className="w-full flex items-center justify-center border-t mx-auto text-center text-xs gap-8 py-16">
          <p>
            Extract invoice PDFs into structured, queryable data.
          </p>
          <ThemeSwitcher />
        </footer>
      </div>
    </main>
  );
}