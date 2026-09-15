# Invoizen

**Turn messy invoices into structured, queryable data.**

Upload any invoice PDF. Invoizen extracts the vendor, dates, line items and
amounts with an LLM, then **verifies the math** — totals are cross-checked
against line items and tax, locale quirks (`1.234,56` vs `1,234.56`) are parsed
deterministically, and anything uncertain is flagged for human review instead of
being silently trusted.

A one-click **sample invoice** (US *and* European formatting) lets you demo the
whole flow without hunting for a PDF.

## How it works

```
upload PDF → document row (pending)
    └─→ extraction pipeline (processing)
            ├─ validate file is a PDF
            ├─ Gemini reads the file → raw fields (verbatim text)
            ├─ deterministic normalizer: amounts, dates, currency, line items
            ├─ reconciler: subtotal + tax + shipping − discount == total?
            │   (missing totals are derived + flagged, not guessed)
            └─ status: ready / needs_review / failed
    └─→ review UI: correct fields, live re-check of the math, save / reprocess / delete
    └─→ searchable + filterable (vendor, number, PO, date, currency, status)
```

## Vocabulary

| Term | Meaning |
|---|---|
| `documents` | One row per uploaded PDF; tracks the processing lifecycle (`pending → processing → needs_review → ready / failed`) |
| `invoices` | The extracted, normalized structure (vendor, dates, amounts, flags, per-field confidence) |
| `invoice_items` | Line items, in order, with qty / unit price / amount |
| Status | `needs_review` = pipe flagged something or a critical field had low confidence; humans review then hit "Save & mark ready" |

Review flags: `total_mismatch`, `subtotal_mismatch`, `line_item_mismatch`,
`tax_mismatch`, `missing_total`, `total_derived`, `subtotal_derived`,
`ambiguous_date`, `unknown_currency`, `unparseable_amount`,
`missing_vendor`, `missing_invoice_number`, `edited_by_user`.

## Tech

- Next.js 16 (App Router), React 19, TypeScript (strict)
- Supabase (Auth via `@supabase/ssr`, Postgres, Storage, RLS)
- Google Gemini for document understanding (structured output + inline PDF)
- Tailwind CSS + shadcn/ui
- `pdf-lib` for generating the demo sample invoices
- Vitest for the extraction pipeline unit tests (51 tests)

## One-time setup

### 1. Supabase

Create a project, then run the migrations:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Migrations (in `supabase/migrations/`):

| File | Creates |
|---|---|
| `..._create_invoices_storage_bucket.sql` | Private `invoices` storage bucket + per-user policies |
| `..._create_invoices_schema.sql` | `documents`, `invoices`, `invoice_items` tables, `pg_trgm` search indexes, per-user RLS, `updated_at` triggers |

### 2. Environment variables

Copy `.env.example` to `.env.local` and fill in:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
GEMINI_API_KEY=...            # https://aistudio.google.com/apikey
GEMINI_MODEL=gemini-3.5-flash # optional override
# GEMINI_FALLBACK_MODELS=gemini-3.5-flash-lite # optional cheaper retry models
```

The Gemini key stays server-side. Without it, uploads are stored but
extraction fails with a clear "not configured" message.

### 3. Run

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000, sign up, and hit **"Try a sample invoice"** on the
dashboard — it generates a realistic PDF and runs it through the full pipeline.

## Quality gates

```bash
pnpm lint      # ESLint
pnpm build     # Next.js production build + type check
pnpm vitest run  # extraction pipeline tests
```

## Project layout

```
app/dashboard/actions/   server actions: upload, extract, invoices (review), samples
app/dashboard/invoices/  list (searchable) + detail (review/edit/approve)
lib/extraction/          pipeline: gemini provider, schema, normalize, reconcile, pipeline
lib/data.ts              server-side queries (search, stats, currencies)
lib/db.ts                row types shared with the UI
lib/samples.ts           pdf-lib sample-invoice generator
tests/                   vitest suites for the pipeline
supabase/migrations/     schema + storage
```

See `decisions.md` for the reasoning behind the notable choices.