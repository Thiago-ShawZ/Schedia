-- Schedia · Criação dos buckets públicos para Avatars e Business Logos
-- Evita armazenamento de data-URLs em base64 e impede inchaço do token JWT

-- 1. Bucket público de Avatars
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true, -- Público para leitura direta (header, agendamentos, perfil)
  2097152, -- 2 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- Policies para o bucket avatars
drop policy if exists avatars_public_select on storage.objects;
create policy avatars_public_select on storage.objects
  for select to public
  using (bucket_id = 'avatars');

drop policy if exists avatars_user_insert on storage.objects;
create policy avatars_user_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_user_update on storage.objects;
create policy avatars_user_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_user_delete on storage.objects;
create policy avatars_user_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 2. Bucket público de Business Logos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'business-logos',
  'business-logos',
  true, -- Público para leitura direta (Hub, página pública do negócio)
  2097152, -- 2 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- Policies para o bucket business-logos
drop policy if exists logos_public_select on storage.objects;
create policy logos_public_select on storage.objects
  for select to public
  using (bucket_id = 'business-logos');

drop policy if exists logos_auth_insert on storage.objects;
create policy logos_auth_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'business-logos'
  );

drop policy if exists logos_auth_update on storage.objects;
create policy logos_auth_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'business-logos'
  )
  with check (
    bucket_id = 'business-logos'
  );

drop policy if exists logos_auth_delete on storage.objects;
create policy logos_auth_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'business-logos'
  );
