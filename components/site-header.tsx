import { AuthButton } from "@/components/auth-button";
import { DashboardNav } from "@/components/dashboard-nav";
import { hasEnvVars } from "@/lib/utils";
import Link from "next/link";
import { Suspense } from "react";

export function SiteHeader({ showNav = true }: { showNav?: boolean }) {
  return (
    <nav className="w-full flex justify-center border-b border-b-foreground/10 h-16">
      <div className="w-full max-w-6xl flex justify-between items-center p-3 px-5 text-sm">
        <div className="flex gap-6 items-center">
          <Link href={"/"} className="text-base font-semibold">
            Invoizen
          </Link>
          {showNav ? <DashboardNav /> : null}
        </div>
        {!hasEnvVars ? null : (
          <Suspense>
            <AuthButton />
          </Suspense>
        )}
      </div>
    </nav>
  );
}