import { Footer } from "@/components/footer";
import { SiteHeader } from "@/components/site-header";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col gap-20 items-center">
        <SiteHeader />
        <div className="flex-1 flex flex-col gap-10 max-w-6xl w-full px-5">
          {children}
        </div>

        <Footer />
      </div>
    </main>
  );
}