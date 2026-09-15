-- Create a storage bucket for invoice PDFs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'invoices',
  'invoices',
  false,
  10485760, -- 10MB limit
  ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO NOTHING;

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
