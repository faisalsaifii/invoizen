-- Turn messy invoice PDFs into structured, queryable data.
-- Two tables: documents (the uploaded file + processing lifecycle) and
-- invoices (the extracted, normalized, human-verified structure).

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- documents: one row per uploaded file, tracks processing lifecycle
-- ---------------------------------------------------------------------------
create table public.documents (
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

create index documents_user_created_idx on public.documents (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- invoices: the extracted structure, one per document
-- ---------------------------------------------------------------------------
create table public.invoices (
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

create index invoices_user_idx on public.invoices (user_id, invoice_date desc nulls last);
create index invoices_vendor_trgm_idx on public.invoices using gin (vendor_name gin_trgm_ops);
create index invoices_number_trgm_idx on public.invoices using gin (invoice_number gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- invoice_items: line items, ordered
-- ---------------------------------------------------------------------------
create table public.invoice_items (
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

create index invoice_items_invoice_idx on public.invoice_items (invoice_id, position);

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

create trigger documents_set_updated_at
before update on public.documents
for each row execute function public.set_updated_at();

create trigger invoices_set_updated_at
before update on public.invoices
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security: a user can only see their own rows
-- ---------------------------------------------------------------------------
alter table public.documents enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;

create policy "Users can manage their documents"
on public.documents for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can manage their invoices"
on public.invoices for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

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