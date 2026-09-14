import { AuthButton } from "@/components/auth-button";
import { DashboardNav } from "@/components/dashboard-nav";
import { Footer } from "@/components/footer";
import { hasEnvVars } from "@/lib/utils";
import Link from "next/link";
import { Suspense } from "react";

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
            <div className="flex gap-6 items-center">
              <Link href={"/"} className="text-base font-semibold">
                Invoizen
              </Link>
              <DashboardNav />
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

        <Footer />
      </div>
    </main>
  );
}