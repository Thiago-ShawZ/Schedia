-- ==============================================================================
-- Schedia · Correção Definitiva da Homologação e Notificações (Aprovadores)
-- ==============================================================================
-- 1. Garante a tabela e a função public.create_notification no Supabase
-- 2. Atualiza public.approver_decide_application com cast explícito de tipos
--    e bloco protegido de exceção para que falhas de notificação nunca bloqueiem
--    a aprovação ou reprovação do negócio.
-- ==============================================================================

-- 1) Tabela public.notifications (se ainda não existir)
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user_created
  on public.notifications (user_id, created_at desc);

create index if not exists idx_notifications_user_unread
  on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists notif_select on public.notifications;
create policy notif_select on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists notif_update on public.notifications;
create policy notif_update on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 2) Função public.create_notification
create or replace function public.create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  insert into public.notifications (user_id, type, title, body, data)
  values (p_user_id, p_type, p_title, p_body, coalesce(p_data, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end $$;

-- 3) Função public.approver_decide_application (Blindada e Resiliente)
create or replace function public.approver_decide_application(
  p_id uuid,
  p_approve boolean,
  p_comment text default null
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_app public.business_applications;
  v_has_category boolean;
  v_has_service boolean;
  v_has_hours boolean;
begin
  -- Valida se o executor é um aprovador oficial
  if not public.is_approver() then
    raise exception 'forbidden';
  end if;

  -- Bloqueio pessimista para concorrência
  select * into v_app
    from public.business_applications
   where id = p_id
     for update;

  if not found then
    raise exception 'not_found';
  end if;

  if v_app.status <> 'pending' then
    raise exception 'already_decided';
  end if;

  if not p_approve then
    if p_comment is null or char_length(trim(p_comment)) < 10 then
      raise exception 'comment_required';
    end if;

    update public.business_applications
       set status = 'rejected',
           review_comment = trim(p_comment),
           reviewed_by = auth.uid(),
           reviewed_at = now()
     where id = p_id;

    update public.businesses
       set approval_status = 'rejected'
     where id = v_app.business_id;

    -- Emite notificação de forma segura e não bloqueante
    begin
      perform public.create_notification(
        v_app.submitted_by,
        'business_rejected'::text,
        'Solicitação de cadastro revisada'::text,
        ('A análise de ' || v_app.trade_name || ' precisa de correções: ' || trim(p_comment))::text,
        jsonb_build_object(
          'application_id', v_app.id,
          'business_id', v_app.business_id,
          'trade_name', v_app.trade_name,
          'status', 'rejected',
          'review_comment', trim(p_comment)
        )
      );
    exception when others then
      -- Falha de notificação não impede a gravação da decisão de reprovação
      null;
    end;

  else
    update public.business_applications
       set status = 'approved',
           review_comment = trim(p_comment),
           reviewed_by = auth.uid(),
           reviewed_at = now()
     where id = p_id;

    update public.businesses
       set approval_status = 'approved'
     where id = v_app.business_id;

    select (b.category_id is not null) into v_has_category
      from public.businesses b where b.id = v_app.business_id;

    select exists (
      select 1 from public.services s
       where s.business_id = v_app.business_id and s.is_active
    ) into v_has_service;

    select exists (
      select 1 from public.business_settings st
       where st.business_id = v_app.business_id and st.opening_hours <> '{}'::jsonb
    ) into v_has_hours;

    if coalesce(v_has_category, false) and coalesce(v_has_service, false) and coalesce(v_has_hours, false) then
      update public.businesses
         set is_published = true
       where id = v_app.business_id;
    end if;

    -- Emite notificação de forma segura e não bloqueante
    begin
      perform public.create_notification(
        v_app.submitted_by,
        'business_approved'::text,
        'Negócio aprovado na plataforma!'::text,
        ('Parabéns! O cadastro de ' || v_app.trade_name || ' foi aprovado e seu negócio já pode publicar horários no Schedia.')::text,
        jsonb_build_object(
          'application_id', v_app.id,
          'business_id', v_app.business_id,
          'trade_name', v_app.trade_name,
          'status', 'approved'
        )
      );
    exception when others then
      -- Falha de notificação não impede a gravação da decisão de aprovação
      null;
    end;
  end if;
end $$;

revoke execute on function public.approver_decide_application(uuid, boolean, text) from public, anon;
grant execute on function public.approver_decide_application(uuid, boolean, text) to authenticated;
