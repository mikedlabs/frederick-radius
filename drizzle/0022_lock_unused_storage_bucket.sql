-- The app stores moderated report images in Vercel Blob, not Supabase
-- Storage. Supabase nevertheless had an empty legacy bucket named `Blob`
-- marked public with no size or MIME limits. Keep it fail-closed so an
-- accidental future upload cannot become public by default.
--
-- The object-count guard prevents this migration from changing visibility if
-- someone begins using the bucket before the migration reaches an environment.

update storage.buckets b
set
  public = false,
  file_size_limit = 6291456,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']::text[]
where b.id = 'Blob'
  and not exists (
    select 1
    from storage.objects o
    where o.bucket_id = b.id
  );
