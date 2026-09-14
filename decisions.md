# Decisions Log

## Project Setup

- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript (strict)
- **Styling**: Tailwind CSS + shadcn/ui (new-york style)
- **Auth**: Supabase Auth with `@supabase/ssr` cookie-based sessions (email/password only)
- **Package manager**: pnpm
- **Route protection**: `proxy.ts` at repo root (replaces `middleware.ts` for Next 16)
- **Component caching**: `cacheComponents` enabled; dynamic pages use `export const instant = false`

---

## Invoice PDF Upload Feature

### Architecture

1. **Storage bucket**: Private `invoices` bucket. Files stored at `{user_id}/{timestamp}_{sanitized_filename}` to prevent collisions and enforce user isolation via RLS.

2. **File constraints**: PDF-only, 10 MB max, enforced at the server action level *and* in the bucket's `allowed_mime_types`.

3. **RLS over server enforcement**: Storage access governed by three RLS policies (INSERT, SELECT, DELETE) scoped to `auth.uid()::text`. Even if the action is bypassed, Supabase enforces per-user isolation.

4. **Server actions over API routes**: `app/dashboard/actions/upload.ts` uses `"use server"` — avoids manual request/response handling and integrates with Next.js revalidation.

5. **Migration is idempotent**: `ON CONFLICT DO NOTHING` for the bucket insert; `DROP POLICY IF EXISTS` before each policy creation so the migration re-runs safely.

---

## Extraction Pipeline (LLM → Structured Data)

### Provider & Model

- **Gemini** was chosen because: (a) free-tier is sufficient for the assignment, (b) structured output via `responseMimeType` + `responseSchema`, (c) native inline PDF reading via `inline_data`, (d) the API is stable and the SDK is unnecessary (`fetch` suffices).
- Default model: **`gemini-3.5-flash`** — fast, cheap, handles invoice PDFs well. Override via `GEMINI_MODEL` env var.
- Config: no SDK dependency; raw `fetch` to `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` with API key via `x-goog-api-key` header.
- **Not OpenAI, Anthropic, or Ollama** — rejected for this project due to: OpenAI lacks native PDF handling (would need a separate text-extraction layer), Anthropic has no structured-output contract, Ollama requires a local model running and cannot read PDFs directly.

### Schema Design

- **Model returns amounts as verbatim text strings** ("$1,234.56", "1.234,56 €"), not numbers. This is the whole point of the pipeline: the model copies the text faithfully; a deterministic parser normalizes it. This makes the extraction auditable — the reviewer sees the raw value next to the parsed number.
- Empty string `""` convention for absent fields. The Zod schema defaults missing keys to `null` via `.default(null).transform(...)`. Using `.optional()` alone left `undefined` which leaked into Supabase inserts; `null` is the SQL semantic for missing.

### Number Normalization (`lib/extraction/normalize.ts`)

Deterministic, no-network, no-model. Handles:

- **US format**: `1,234.56` → 1234.56
- **EU format**: `1.234,56` → 1234.56
- **Mixed separators**: the last separator is treated as the decimal one; everything else is grouping.
- **Single separator**: 1–2 trailing digits → decimal; 0 trailing → punctuation; 3 trailing → grouping (except `0,123` → 0.123).
- **Currency symbols stripped** before parsing; ISO codes handled by a separate `mapCurrency` function.
- **`¥` deliberately NOT auto-resolved** to JPY or CNY — ambiguous in isolation, so it raises `unknown_currency`.
- **`₿` returns `unknown: true`** → `unknown_currency` flag.

### Date Normalization

- ISO `YYYY-MM-DD` validated directly.
- Numeric formats separated by `/`, `.`, or `-` parsed with locale heuristics: `MM/DD/YYYY` vs `DD/MM/YYYY` determined by which day/month makes sense (e.g., month ≤ 12 and day ≤ 31). When ambiguous (both ≤ 12), `ambiguous_date` flag is set with confidence 0.5.

### Confidence & Review Heuristics

- **Per-field confidence**: 0–1 float per critical field (`vendorName`, `invoiceNumber`, `invoiceDate`, `currency`, `total`). Critical fields with confidence < 0.7 → `needs_review`.
- **Review flags always force review** regardless of confidence: `total_mismatch`, `subtotal_mismatch`, `line_item_mismatch`, `tax_mismatch`, `missing_total`, `ambiguous_date`, `unknown_currency`, `unparseable_amount`, `total_derived`, `subtotal_derived`.

### Reconciliation (`lib/extraction/reconcile.ts`)

1. **Line items internally consistent**: quantity × unit price ≈ amount. If amount is missing but both exist, it is derived.
2. **Sum of items vs subtotal**: if subtotal missing and items filled → derive; if both present and differ → `subtotal_mismatch`.
3. **Total = subtotal + tax + shipping − discount**: if total missing → derive (`total_derived`); if present and mismatched → `total_mismatch`.
4. **Tax rate sanity**: if tax, subtotal, and tax rate are all present, `expected_tax = subtotal × taxRate / 100`. Mismatch → `tax_mismatch`.
5. **Derived values capped at 0.7 confidence** so they still surface for human review.

### Document Lifecycle & Status

| Document status | Meaning |
|---|---|
| `pending` | Uploaded, not yet queued for extraction |
| `processing` | Extraction in progress |
| `ready` | Invoice extracted and human-reviewed |
| `needs_review` | Extraction completed but flagged |
| `failed` | Not an invoice, bad PDF, or extraction error |

| Invoice status | Meaning |
|---|---|
| `needs_review` | Default after extraction |
| `ready` | Human saved changes or confirmed |

Non-invoices (`isInvoice: false` in model output) → document `failed` with message "This document is not an invoice" — no invoice row created.

### Search

PostgreSQL `pg_trgm` trigram indexes on `vendor_name` and `invoice_number`. Search uses `ILIKE` which benefits from the GIN trigram index. Chose this over full-text search because invoice numbers and vendor names are codes/proper nouns, not natural language — trigram matching is more predictable and doesn't require a dictionary.

### DB Schema Notes

- `numeric(14,2)` for amounts, `numeric(5,2)` for tax rate, `char(3)` for currency. Dates stored as Postgres `date` (timezone-free, no time component).
- `confidence jsonb` — allows per-field weights without adding a table. Indexed with the row, accessible from the UI without a second query.
- `flags text[]` — human-readable label array (not bitflags) so the UI can render descriptive text directly.
- `raw_data jsonb` — model-level metadata (document type, original currency text) that might be useful later but doesn't affect the extraction schema.

---

## UI Decisions

- **Upload flow**: Client `InvoiceUploader` shows phased progress: upload → step-by-step extraction → navigate to detail. Uses `useTransition` to keep the UI responsive during the 10–30s extraction.
- **Sample invoices**: pdf-lib generates two variants (US clean, EU `1.234,56 €`). The eu variant is a live demo of the locale-aware number parser.
- **Review form**: All fields editable, live arithmetic summary (total matches? line items sum to subtotal?), confidence dots next to critical fields, flags with human-readable labels, approve / save / reprocess / delete actions.
- **Filters**: Search with debounced URL-param updates, status toggle, currency dropdown. Back/forward navigation stays in sync with filter state.
- **No `export const dynamic`**: Conflicts with `cacheComponents`; use `export const instant = false` instead.

### File structure

```
app/dashboard/actions/     server actions (upload, extract, invoices, samples)
app/dashboard/             dashboard, layout, uploader
app/dashboard/invoices/    list page (search + filter), detail/review page
lib/extraction/            pipeline (types, schema, prompt, gemini, normalize, reconcile, pipeline)
lib/db.ts                  row types shared with the UI
lib/data.ts                server-side queries (search, stats, currencies)
lib/format.ts              client-safe formatting helpers
components/invoice/        status badges, flag rows, confidence dots
tests/                     vitest suites for the extraction pipeline
```