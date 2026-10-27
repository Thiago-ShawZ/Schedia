-- Schedia · Rollback da Fase 8 (Aprovadores)
-- Desfaz todas as alterações introduzidas pela migration 0008_aprovadores.sql

-- 1) Storage policies e bucket
drop policy if exists app_photos_delete on storage.objects;
drop policy if exists app_photos_select on storage.objects;
drop policy if exists app_photos_insert on storage.objects;
delete from storage.buckets where id = 'business-applications';

-- 2) RPCs dos aprovadores
drop function if exists public.approver_decide_application(uuid, boolean, text);
drop function if exists public.approver_get_application(uuid);
drop function if exists public.approver_list_applications(text, int, int);

-- 3) Trigger e função de reenvio de solicitação
drop trigger if exists business_applications_submitted on public.business_applications;
drop function if exists public.on_application_submitted();

-- 4) Tabela de solicitações de análise
drop table if exists public.business_applications cascade;

-- 5) Trigger e função de trava de aprovação
drop trigger if exists businesses_approval_rules on public.businesses;
drop function if exists public.enforce_approval_rules();

-- 6) Restaura a política biz_insert original da migration 0003
drop policy if exists biz_insert on public.businesses;
create policy biz_insert on public.businesses for insert to authenticated
  with check (created_by = auth.uid() and not is_published);

-- 7) Remove coluna approval_status da tabela businesses
alter table public.businesses drop column if exists approval_status;

-- 8) Remove função is_approver e tabela platform_approvers
drop function if exists public.is_approver();
drop table if exists public.platform_approvers cascade;
