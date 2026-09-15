import { Footer } from "@/components/footer";
import { AnimatedBackground } from "@/components/animated-background";
import { SiteHeader } from "@/components/site-header";
import { createClient } from "@/lib/supabase/server";
import { hasEnvVars } from "@/lib/utils";
import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SpotlightCard } from "@/components/spotlight-card";
import { Reveal } from "@/components/reveal";
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
    description:
      "Any invoice — US or European formatting, multiple line items, tax included.",
  },
  {
    title: "Invoizen extracts",
    description:
      "An LLM reads the file; a deterministic normalizer parses amounts and dates.",
  },
  {
    title: "Math is verified",
    description:
      "Subtotal + tax + shipping − discount is reconciled against the total, deterministically.",
  },
  {
    title: "Review, save, search",
    description:
      "Flagged invoices land in a review queue. Approve and they're in your queryable ledger.",
  },
];

export const instant = false;

export const metadata: Metadata = {
  title: "Turn messy invoices into structured, queryable data",
  description:
    "Upload any invoice PDF. Invoizen extracts vendor, dates, line items and amounts with an LLM, verifies every total with deterministic math checks, and flags anything uncertain for human review.",
};

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Invoizen",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "Upload any invoice PDF. Invoizen extracts vendor, dates, line items and amounts with an LLM, verifies every total with deterministic math checks, and flags anything uncertain for human review.",
  url: siteUrl,
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  author: {
    "@type": "Organization",
    name: "Invoizen",
    url: siteUrl,
  },
};

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
  const headline = "Turn messy invoices into structured, queryable data.";
  const words = headline.split(" ");
  return (
    <main className="relative min-h-screen flex flex-col items-center">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <AnimatedBackground />
      <div className="relative z-10 flex-1 w-full flex flex-col items-center">
        <SiteHeader showNav={loggedIn} />

        <div className="flex-1 flex flex-col items-center gap-20 max-w-6xl w-full px-5 py-20">
          <section className="flex flex-col items-center gap-6 text-center">
            <h1
              className="headline-glow text-4xl lg:text-6xl !leading-tight font-bold tracking-tight max-w-3xl"
              aria-label={headline}
            >
              {words.map((word, i) => (
                <span
                  key={i}
                  className="headline-word"
                  style={{ animationDelay: `${i * 0.05}s` }}
                  aria-hidden
                >
                  {word}
                  {i < words.length - 1 ? "\u00A0" : ""}
                </span>
              ))}
            </h1>
            <p
              className="text-lg text-muted-foreground max-w-2xl hero-reveal"
              style={{ animationDelay: "0.4s" }}
            >
              Upload any invoice PDF. Invoizen extracts the vendor, dates, line
              items and amounts with an LLM, then verifies the math — and flags
              anything it isn&apos;t sure about for human review instead of
              silently trusting it.
            </p>
            <div
              className="flex flex-col sm:flex-row gap-3 mt-2 hero-reveal"
              style={{ animationDelay: "0.55s" }}
            >
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
            <p
              className="text-xs text-muted-foreground hero-reveal"
              style={{ animationDelay: "0.7s" }}
            >
              A one-click sample invoice (US and European formatting) demos the
              whole flow without hunting for a PDF.
            </p>
          </section>

          <Reveal className="w-full">
            <section className="w-full">
              <div className="w-full p-[1px] bg-gradient-to-r from-transparent via-foreground/10 to-transparent mb-10" />
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {features.map((feature, i) => (
                  <Reveal key={feature.title} delay={i * 90} className="h-full">
                    <SpotlightCard className="h-full">
                      <CardHeader>
                        <feature.icon
                          size={20}
                          className="text-primary mb-2 transition-transform duration-300 group-hover:scale-110"
                        />
                        <CardTitle className="text-base">
                          {feature.title}
                        </CardTitle>
                        <CardDescription className="text-sm">
                          {feature.description}
                        </CardDescription>
                      </CardHeader>
                    </SpotlightCard>
                  </Reveal>
                ))}
              </div>
            </section>
          </Reveal>

          <Reveal className="w-full">
            <section className="w-full">
              <h2 className="text-2xl lg:text-3xl font-bold tracking-tight text-center mb-10">
                How it works
              </h2>
              <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {steps.map((step, i) => (
                  <li key={step.title}>
                    <Reveal delay={i * 90} className="h-full">
                      <SpotlightCard className="h-full">
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
                      </SpotlightCard>
                    </Reveal>
                  </li>
                ))}
              </ol>
            </section>
          </Reveal>

          <Reveal className="w-full">
            <section className="w-full">
              <SpotlightCard className="flex flex-col lg:flex-row items-center justify-between gap-6 p-8">
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
              </SpotlightCard>
            </section>
          </Reveal>
        </div>

        <Footer />
      </div>
    </main>
  );
}
