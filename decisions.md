# Decisions

A short note on some of the decisions I made while building Invoizen and why.

## Let Gemini read, but don't let it do the math

Gemini returns amounts and dates exactly as they appear in the invoice. A separate TypeScript layer handles parsing and normalization.

I did this because formats like `1.234,56` can mean different things depending on the locale. Keeping this logic outside the model makes it easier to test and avoids silently getting a wrong number.

Ambiguous values are flagged for review instead of being guessed. I also left currency conversion out for now.

## Repair when possible

If an invoice doesn't have a total but has enough information to calculate it, I derive the total and mark it as derived with lower confidence.

This seemed better than failing the entire invoice just because one field was missing.

## Documents and invoices are separate

The uploaded file is stored as a document first. The invoice record is created after extraction succeeds.

This keeps upload and extraction independent. If Gemini fails or times out, the original file is still there and can be processed again.

## Extraction is synchronous

Upload and extraction happen as two separate server actions. Extraction runs in the same request with retries and a 50-second timeout.

I considered using a queue or background worker, but for a five-day project it felt like unnecessary infrastructure. The extraction usually finishes within the serverless function timeout anyway.

## PostgreSQL search instead of a vector DB

Invoice search uses `pg_trgm` and `ILIKE`.

Most searches are things like invoice numbers, PO numbers, and vendor names. I didn't see much value in adding embeddings or a separate search service for this.

## RLS + application-level checks

Supabase RLS restricts rows to the authenticated user. I also filter by `user_id` in the application queries.

The extra checks aren't strictly necessary with RLS, but they make ownership explicit in the code and give me another layer of protection.

## Gemini

I put Gemini behind a small `ExtractionProvider` interface even though there's only one provider right now.

Gemini was a good fit because it can handle both normal PDFs and scanned invoices without needing a separate OCR pipeline.

I also chose Gemini because its free tier was generous enough for this project.

## Retries

Transient Gemini failures are retried up to three times. Retries can fall back to a cheaper Flash-Lite model.

The idea is to avoid paying for a more expensive model when the failure was probably just a timeout, rate limit, or temporary API issue.

## Keep raw model output small

I don't store the complete Gemini response. `raw_data` only contains a small summary.

The normalized invoice already has the information I need, and storing the entire model response would mostly duplicate data.

## Don't guess ambiguous values

For example, `¥` could mean JPY or CNY, so I flag it instead of guessing.

The same applies to dates like `03/05/2026`. I'd rather ask for a review than silently store the wrong date or currency.

## Testing

There are 51 Vitest tests covering the extraction pipeline, normalization, reconciliation, and Gemini retry handling.

I focused testing on the deterministic parts, especially money and date parsing, since those are the areas where a small bug can produce incorrect results without being obvious.

## Things I didn't build

To keep the scope reasonable, I left out:

* Team/multi-tenant support
* Accounting integrations
* Exporting to CSV/QuickBooks/Xero
* Duplicate invoice detection
* Batch uploads
* Currency conversion
* Full UI/E2E testing
* Advanced malware scanning

## Why these services

**Supabase** — PostgreSQL, auth, storage, and RLS in one place, with a generous free tier.

**Vercel** — Simple deployment and serverless functions, with a free tier that was enough for the project.

**Gemini** — Good PDF/vision support and a generous free tier, which made it a practical choice for this build.
