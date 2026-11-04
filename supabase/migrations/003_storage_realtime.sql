-- Stage Review — 003: bucket privato per immagini e realtime
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 3145728, array['image/webp', 'image/gif'])
on conflict (id) do nothing;

-- Lettura e caricamento solo per lo studio; nessuna modifica né cancellazione
create policy media_select on storage.objects for select to authenticated
  using (bucket_id = 'media' and public.is_studio());
create policy media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.is_studio());

alter publication supabase_realtime add table public.issues;
