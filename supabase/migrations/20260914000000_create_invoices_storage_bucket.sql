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
DROP POLICY IF EXISTS "Users can upload invoice PDFs" ON storage.objects;
CREATE POLICY "Users can upload invoice PDFs"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'invoices'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to view their own files
DROP POLICY IF EXISTS "Users can view their own invoices" ON storage.objects;
CREATE POLICY "Users can view their own invoices"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'invoices'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to delete their own files
DROP POLICY IF EXISTS "Users can delete their own invoices" ON storage.objects;
CREATE POLICY "Users can delete their own invoices"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'invoices'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
