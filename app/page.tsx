import { AuthButton } from "@/components/auth-button";
import { DashboardNav } from "@/components/dashboard-nav";
import { Footer } from "@/components/footer";
import { createClient } from "@/lib/supabase/server";
import { hasEnvVars } from "@/lib/utils";
import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ArrowRight,
  FileCheck2,
  FileText,
  BadgeCheck,
  Search,
} from "lucide-react";

const features = [
  {
    icon: FileText,
    title: "LLM extraction",
    description:
      "Gemini reads any invoice PDF and pulls out the vendor, dates, line items and amounts as structured fields.",
  },
  {
    icon: BadgeCheck,
    title: "Deterministic math checks",
    description:
      "Totals are cross-checked against line items and tax instead of being trusted. Locale quirks like 1.234,56 vs 1,234.56 are parsed exactly.",
  },
  {
    icon: FileCheck2,
    title: "Human review, only when needed",
    description:
      "Anything uncertain is flagged for review — a mismatch, a missing total, low confidence. Nothing is silently guessed.",
  },
  {
    icon: Search,
    title: "Searchable and filterable",
    description:
      "Every extracted invoice is queryable by vendor, number, PO, date, currency and status. Find it later without digging through PDFs.",
  },
];

const steps = [
  {
    title: "Upload a PDF",
    description: "Any invoice — US or European formatting, multiple line items, tax included.",
  },
  {
    title: "Invoizen extracts",
    description: "An LLM reads the file; a deterministic normalizer parses amounts and dates.",
  },
  {
    title: "Math is verified",
    description: "Subtotal + tax + shipping − discount is reconciled against the total, deterministically.",
  },
  {
    title: "Review, save, search",
    description: "Flagged invoices land in a review queue. Approve and they're in your queryable ledger.",
  },
];

export const instant = false;

async function isLoggedIn() {
  if (!hasEnvVars) return false;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    return Boolean(data?.claims);
  } catch {
    return false;
  }
}

export default async function Home() {
  const loggedIn = await isLoggedIn();
  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col items-center">
        <nav className="w-full flex justify-center border-b border-b-foreground/10 h-16">
          <div className="w-full max-w-6xl flex justify-between items-center p-3 px-5 text-sm">
            <div className="flex gap-6 items-center">
              <Link href={"/"}>
                <span className="text-base font-semibold">Invoizen</span>
              </Link>
              {loggedIn ? <DashboardNav /> : null}
            </div>
            {!hasEnvVars ? null : (
              <Suspense>
                <AuthButton />
              </Suspense>
            )}
          </div>
        </nav>

        <div className="flex-1 flex flex-col items-center gap-20 max-w-6xl w-full px-5 py-20">
          <section className="flex flex-col items-center gap-6 text-center">
            <h1 className="text-4xl lg:text-6xl !leading-tight font-bold tracking-tight max-w-3xl">
              Turn messy invoice PDFs into structured, queryable data.
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl">
              Upload any invoice PDF. Invoizen extracts the vendor, dates, line
              items and amounts with an LLM, then verifies the math — and flags
              anything it isn&apos;t sure about for human review instead of
              silently trusting it.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 mt-2">
              {loggedIn ? (
                <Button asChild size="lg">
                  <Link href="/dashboard">
                    Go to your dashboard
                    <ArrowRight />
                  </Link>
                </Button>
              ) : (
                <>
                  <Button asChild size="lg">
                    <Link href="/auth/sign-up">
                      Get started with a sample invoice
                      <ArrowRight />
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="outline">
                    <Link href="/auth/login">Sign in</Link>
                  </Button>
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              A one-click sample invoice (US and European formatting) demos the
              whole flow without hunting for a PDF.
            </p>
          </section>

          <section className="w-full">
            <div className="w-full p-[1px] bg-gradient-to-r from-transparent via-foreground/10 to-transparent mb-10" />
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {features.map((feature) => (
                <Card key={feature.title}>
                  <CardHeader>
                    <feature.icon
                      size={20}
                      className="text-primary mb-2"
                    />
                    <CardTitle className="text-base">{feature.title}</CardTitle>
                    <CardDescription className="text-sm">
                      {feature.description}
                    </CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </section>

          <section className="w-full">
            <h2 className="text-2xl lg:text-3xl font-bold tracking-tight text-center mb-10">
              How it works
            </h2>
            <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {steps.map((step, i) => (
                <li key={step.title}>
                  <Card className="h-full">
                    <CardHeader>
                      <span className="text-3xl font-bold text-primary/40">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <CardTitle className="text-base mt-2">
                        {step.title}
                      </CardTitle>
                      <CardDescription className="text-sm">
                        {step.description}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </li>
              ))}
            </ol>
          </section>

          <section className="w-full">
            <Card className="flex flex-col lg:flex-row items-center justify-between gap-6 p-8">
              <div className="flex flex-col gap-2 text-center lg:text-left">
                <h2 className="text-2xl font-bold tracking-tight">
                  Your invoices, accurately extracted — and verified.
                </h2>
                <p className="text-sm text-muted-foreground max-w-xl">
                  Upload your first PDF or generate a realistic sample invoice
                  to see the full pipeline in action.
                </p>
              </div>
              <Button asChild size="lg">
                <Link href={loggedIn ? "/dashboard" : "/auth/sign-up"}>
                  {loggedIn ? "Go to your dashboard" : "Try a sample invoice"}
                  <ArrowRight />
                </Link>
              </Button>
            </Card>
          </section>
        </div>

        <Footer />
      </div>
    </main>
  );
}