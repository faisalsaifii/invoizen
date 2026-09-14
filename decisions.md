# Decisions Log

## Project Setup

- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript
- **Styling**: Tailwind CSS 3.4 + shadcn/ui (new-york style)
- **Auth**: Supabase Auth with `@supabase/ssr` cookie-based sessions (email/password only)
- **Package manager**: pnpm
- **Route protection**: `proxy.ts` at repo root (replaces middleware.ts for Next 16)

---

## Invoice PDF Upload Feature

**Date**: 2026-09-14

### What

Logged-in users can upload invoice PDFs that are stored in Supabase S3 storage.

### Architecture decisions

1. **Storage bucket**: Private bucket named `invoices` (not public). Files stored at `{user_id}/{timestamp}_{sanitized_filename}` to prevent collisions and enforce user isolation.

2. **File constraints**: PDF-only (`application/pdf`), 10MB max size. Both enforced at the server action level and in the bucket's `allowed_mime_types`.

3. **RLS policies over server-side enforcement**: Storage access is governed by three RLS policies (INSERT, SELECT, DELETE) that scope operations to `auth.uid()::text` matching the first folder segment. This means even if the server action is bypassed, Supabase itself enforces user isolation.

4. **Server action for uploads**: `app/protected/actions/upload.ts` is a `"use server"` action (not an API route). This avoids manual request/response handling and integrates with Next.js revalidation.

5. **Client component**: `app/protected/invoice-uploader.tsx` uses a hidden `<input type="file">` triggered by a Button, with `useTransition` for non-blocking UI during upload.

6. **Migration is idempotent**: Uses `ON CONFLICT DO NOTHING` for the bucket insert and `DROP POLICY IF EXISTS` before each policy creation so the migration can be re-run safely.

### Files created

| File | Purpose |
|---|---|
| `supabase/migrations/20260914000000_create_invoices_storage_bucket.sql` | Storage bucket + RLS policies |
| `app/protected/actions/upload.ts` | Server action: auth check, validation, upload |
| `app/protected/invoice-uploader.tsx` | Client upload UI component |
| `app/protected/page.tsx` | Updated with upload section |
