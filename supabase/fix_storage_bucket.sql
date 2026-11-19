-- ============================================================
-- DIAGNÓSTICO E CORREÇÃO COMPLETA DO BUCKET business-applications
-- Execute tudo isso no SQL Editor do Supabase
-- ============================================================

-- 1. Verifica estado atual do bucket
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'business-applications';

-- 2. Verifica políticas RLS existentes no storage.objects
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname in ('app_photos_insert', 'app_photos_select', 'app_photos_delete');

-- 3. Garante que o bucket existe com as configurações corretas
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'business-applications',
  'business-applications',
  false,
  5242880, -- aumentado para 5 MB para mais margem
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- 4. Recria política de INSERT (permite usuário autenticado fazer upload na pasta própria)
drop policy if exists app_photos_insert on storage.objects;
create policy app_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'business-applications'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 5. Recria política de SELECT
drop policy if exists app_photos_select on storage.objects;
create policy app_photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'business-applications'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_approver()
    )
  );

-- 6. Recria política de DELETE
drop policy if exists app_photos_delete on storage.objects;
create policy app_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'business-applications'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 7. Confirma resultado final
select 'bucket' as tipo, id as nome, public::text as config1, file_size_limit::text as config2
from storage.buckets where id = 'business-applications'
union all
select 'policy', policyname, cmd, 'ok'
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname in ('app_photos_insert', 'app_photos_select', 'app_photos_delete');
