-- =============================================================================
-- invoizen: canonical database schema
-- -----------------------------------------------------------------------------
-- This file is the authoritative reference for the current database schema.
-- It is idempotent and safe to re-run repeatedly.
--
-- When applying a schema change, add a migration under supabase/migrations/
-- and then update this file to reflect the new state.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extension
-- ---------------------------------------------------------------------------
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- documents: one row per uploaded file, tracks processing lifecycle
-- ---------------------------------------------------------------------------
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null,
  filename text not null,
  size_bytes bigint not null,
  mime_type text not null default 'application/pdf',
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'needs_review', 'ready', 'failed')),
  status_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documents_user_created_idx
  on public.documents (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- invoices: the extracted structure, one per document
-- ---------------------------------------------------------------------------
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null unique references public.documents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,

  vendor_name text,
  vendor_email text,
  vendor_address text,
  vendor_tax_id text,

  invoice_number text,
  po_number text,
  invoice_date date,
  due_date date,
  currency char(3),

  subtotal numeric(14, 2),
  tax numeric(14, 2),
  tax_rate numeric(5, 2),
  discount numeric(14, 2),
  shipping numeric(14, 2),
  total numeric(14, 2),

  payment_method text,
  notes text,

  -- lifecycle / human verification state
  status text not null default 'needs_review'
    check (status in ('needs_review', 'ready')),
  confidence jsonb not null default '{}'::jsonb,
  flags text[] not null default '{}',
  raw_data jsonb not null default '{}'::jsonb,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists invoices_user_idx
  on public.invoices (user_id, invoice_date desc nulls last);
create index if not exists invoices_vendor_trgm_idx
  on public.invoices using gin (vendor_name gin_trgm_ops);
create index if not exists invoices_number_trgm_idx
  on public.invoices using gin (invoice_number gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- invoice_items: line items, ordered
-- ---------------------------------------------------------------------------
create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  position int not null,
  sku text,
  description text not null,
  quantity numeric(14, 4),
  unit_price numeric(14, 2),
  amount numeric(14, 2),
  created_at timestamptz not null default now()
);

create index if not exists invoice_items_invoice_idx
  on public.invoice_items (invoice_id, position);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at
before update on public.documents
for each row execute function public.set_updated_at();

drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at
before update on public.invoices
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security: a user can only see their own rows
-- ---------------------------------------------------------------------------
alter table public.documents enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;

drop policy if exists "Users can manage their documents" on public.documents;
create policy "Users can manage their documents"
on public.documents for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can manage their invoices" on public.invoices;
create policy "Users can manage their invoices"
on public.invoices for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can manage their invoice items" on public.invoice_items;
create policy "Users can manage their invoice items"
on public.invoice_items for all
to authenticated
using (
  exists (
    select 1 from public.invoices i
    where i.id = invoice_id and i.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.invoices i
    where i.id = invoice_id and i.user_id = auth.uid()
  )
);

-- ---------------------------------------------------------------------------
-- Storage: bucket for invoice PDFs
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'invoices',
  'invoices',
  false,
  10485760, -- 10MB limit
  array['application/pdf']::text[]
)
on conflict (id) do nothing;

-- Allow authenticated users to upload files to their own folder
drop policy if exists "Users can upload invoice PDFs" on storage.objects;
create policy "Users can upload invoice PDFs"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'invoices'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to view their own files
drop policy if exists "Users can view their own invoices" on storage.objects;
create policy "Users can view their own invoices"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'invoices'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to delete their own files
drop policy if exists "Users can delete their own invoices" on storage.objects;
create policy "Users can delete their own invoices"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'invoices'
  and (storage.foldername(name))[1] = auth.uid()::text
);