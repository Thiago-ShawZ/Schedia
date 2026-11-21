-- ==============================================================================
-- Schedia · Correção Segura de RLS no Bucket business-applications
-- ==============================================================================
-- Executar no SQL Editor do Supabase (como postgres / service_role)
-- ==============================================================================

-- 1. Garante que o bucket business-applications existe e permanece estritamente PRIVADO
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'business-applications',
  'business-applications',
  false, -- Privado: acesso somente via autenticação e RLS
  5242880, -- 5 MB de limite por arquivo
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- 2. Remove todas as policies anteriores associadas ao bucket business-applications
-- (incluindo as policies permissivas antigas 'bucket_id = business-applications')
do $$
declare
  r record;
begin
  for r in (
    select policyname
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (
        qual like '%business-applications%'
        or with_check like '%business-applications%'
        or policyname in ('app_photos_insert', 'app_photos_select', 'app_photos_delete', 'app_photos_update')
      )
  ) loop
    execute format('drop policy if exists %I on storage.objects', r.policyname);
  end loop;
end $$;

-- 3. Confirma/recria a função de segurança is_approver()
create or replace function public.is_approver() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.platform_approvers a
     where a.user_id = auth.uid()
  )
$$;

revoke all on function public.is_approver() from public, anon;
grant execute on function public.is_approver() to authenticated;

-- 4. POLÍTICA DE INSERT
-- Usuário autenticado só pode enviar fotos na pasta cujo primeiro diretório é o seu próprio auth.uid()
-- Padrão de caminho do app: <auth.uid()>/<business_id>/<timestamp>-<num>-<rand>.jpg
create policy app_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'business-applications'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 5. POLÍTICA DE SELECT
-- Apenas o proprietário dos arquivos (mesmo auth.uid()) OU um aprovador oficial têm permissão de leitura
create policy app_photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'business-applications'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_approver()
    )
  );

-- 6. POLÍTICA DE DELETE
-- Apenas o proprietário pode excluir seus próprios arquivos
create policy app_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'business-applications'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 7. POLÍTICA DE UPDATE
-- Restrito ao próprio proprietário em seus próprios arquivos (evita substituição cruzada)
create policy app_photos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'business-applications'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'business-applications'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 8. Verificação do resultado aplicado
select 
  policyname as "Política",
  cmd as "Operação",
  qual as "Condição USING",
  with_check as "Condição WITH CHECK"
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname in ('app_photos_insert', 'app_photos_select', 'app_photos_delete', 'app_photos_update');
