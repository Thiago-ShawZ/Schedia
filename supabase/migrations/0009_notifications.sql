-- Schedia · Fase 9 · Sistema de Notificações In-App
-- Migration aditiva e compatível com as regras e RPCs existentes

-- 1) Tabela public.notifications
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

-- Índices otimizados para busca por usuário e contagem de não lidas
create index if not exists idx_notifications_user_created
  on public.notifications (user_id, created_at desc);

create index if not exists idx_notifications_user_unread
  on public.notifications (user_id) where read_at is null;

-- 2) RLS em public.notifications
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

-- Trava de campos da notificação: cliente só pode atualizar read_at
create or replace function public.lock_notification_fields() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.id, new.user_id, new.type, new.title, new.body, new.data, new.created_at)
     is distinct from (old.id, old.user_id, old.type, old.title, old.body, old.data, old.created_at) then
    raise exception 'notification_fields_locked';
  end if;
  return new;
end $$;

drop trigger if exists notifications_lock on public.notifications;
create trigger notifications_lock before update on public.notifications
  for each row execute function public.lock_notification_fields();

revoke execute on function public.lock_notification_fields() from public, anon, authenticated;

-- 3) Helper security definer para emissão interna de notificações
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

revoke execute on function public.create_notification(uuid, text, text, text, jsonb) from public, anon, authenticated;

-- 4) RPCs para o Frontend (acesso exclusivo do usuário autenticado)

-- 4.1) Listagem de notificações com limite e filtro de não lidas
create or replace function public.get_my_notifications(
  p_limit int default 30,
  p_only_unread boolean default false
)
returns table (
  id uuid,
  type text,
  title text,
  body text,
  data jsonb,
  read_at timestamptz,
  created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select n.id, n.type, n.title, n.body, n.data, n.read_at, n.created_at
    from public.notifications n
   where n.user_id = auth.uid()
     and (not coalesce(p_only_unread, false) or n.read_at is null)
   order by n.created_at desc
   limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;

-- 4.2) Marca uma notificação específica como lida
create or replace function public.mark_notification_read(p_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.notifications
     set read_at = coalesce(read_at, now())
   where id = p_id
     and user_id = auth.uid();
end $$;

-- 4.3) Marca todas as notificações do usuário como lidas
create or replace function public.mark_all_notifications_read()
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.notifications
     set read_at = now()
   where user_id = auth.uid()
     and read_at is null;
end $$;

-- 4.4) Contagem rápida de notificações não lidas
create or replace function public.count_unread_notifications()
returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int
    from public.notifications
   where user_id = auth.uid()
     and read_at is null;
$$;

revoke execute on function public.get_my_notifications(int, boolean),
  public.mark_notification_read(uuid),
  public.mark_all_notifications_read(),
  public.count_unread_notifications() from public, anon;

grant execute on function public.get_my_notifications(int, boolean),
  public.mark_notification_read(uuid),
  public.mark_all_notifications_read(),
  public.count_unread_notifications() to authenticated;

-- 5) Disparo de notificações nos pontos do ecossistema

-- 5.A) book_appointment: notifica membros ativos do negócio
create or replace function public.book_appointment(p_service uuid, p_start timestamptz) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  s public.services;
  b public.businesses;
  st public.business_settings;
  v_client public.profiles;
  v_id uuid;
  v_member record;
  v_time_str text;
  v_client_name text;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select sv.* into s from public.services sv join public.businesses b on b.id = sv.business_id
   where sv.id = p_service and sv.is_active and b.is_published;
  if not found then raise exception 'service_not_found'; end if;

  perform public._validate_slot(s.business_id, p_start, s.duration_min);

  insert into public.appointments(business_id, client_id, service_id, starts_at, ends_at, price_cents, duration_min)
  values (s.business_id, auth.uid(), s.id, p_start, p_start + make_interval(mins => s.duration_min), s.price_cents, s.duration_min)
  returning id into v_id;

  -- Notifica equipe do negócio
  select * into b from public.businesses where id = s.business_id;
  select * into st from public.business_settings where business_id = s.business_id;
  select * into v_client from public.profiles where id = auth.uid();

  v_client_name := coalesce(nullif(trim(v_client.full_name), ''), 'Cliente');
  v_time_str := to_char(p_start at time zone coalesce(st.timezone, 'America/Sao_Paulo'), 'DD/MM/YYYY "às" HH24:MI');

  for v_member in
    select user_id from public.business_memberships
     where business_id = s.business_id and status = 'active'
  loop
    perform public.create_notification(
      v_member.user_id,
      'appointment_booked',
      'Novo agendamento recebido',
      s.name || ' agendado por ' || v_client_name || ' para ' || v_time_str || '.',
      jsonb_build_object(
        'appointment_id', v_id,
        'business_id', s.business_id,
        'business_slug', b.slug,
        'business_name', b.name,
        'service_id', s.id,
        'service_name', s.name,
        'starts_at', p_start,
        'client_id', auth.uid(),
        'client_name', v_client_name
      )
    );
  end loop;

  return v_id;
end $$;

-- 5.B) cancel_appointment: notifica o outro lado
create or replace function public.cancel_appointment(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  a public.appointments;
  st public.business_settings;
  b public.businesses;
  sv public.services;
  v_client public.profiles;
  staff boolean;
  v_member record;
  v_time_str text;
  v_client_name text;
begin
  select * into a from public.appointments where id = p_id;
  if not found then raise exception 'not_found'; end if;
  staff := public.is_business_member(a.business_id);
  if not staff and a.client_id is distinct from auth.uid() then raise exception 'forbidden'; end if;
  if a.status <> 'confirmed' then raise exception 'not_editable'; end if;

  select * into st from public.business_settings where business_id = a.business_id;
  if not staff then
    if a.starts_at - now() < make_interval(hours => st.min_cancel_hours) then raise exception 'too_late'; end if;
  end if;

  update public.appointments set status = 'cancelled' where id = p_id;

  select * into b from public.businesses where id = a.business_id;
  select * into sv from public.services where id = a.service_id;
  select * into v_client from public.profiles where id = a.client_id;
  v_client_name := coalesce(nullif(trim(v_client.full_name), ''), 'Cliente');
  v_time_str := to_char(a.starts_at at time zone coalesce(st.timezone, 'America/Sao_Paulo'), 'DD/MM/YYYY "às" HH24:MI');

  if not staff then
    -- Cancelamento feito pelo cliente -> notifica membros ativos do negócio
    for v_member in
      select user_id from public.business_memberships
       where business_id = a.business_id and status = 'active'
    loop
      perform public.create_notification(
        v_member.user_id,
        'appointment_cancelled',
        'Agendamento cancelado pelo cliente',
        v_client_name || ' cancelou o agendamento de ' || sv.name || ' de ' || v_time_str || '.',
        jsonb_build_object(
          'appointment_id', a.id,
          'business_id', a.business_id,
          'business_slug', b.slug,
          'business_name', b.name,
          'service_id', sv.id,
          'service_name', sv.name,
          'starts_at', a.starts_at,
          'cancelled_by', 'client'
        )
      );
    end loop;
  else
    -- Cancelamento feito pela equipe -> notifica cliente
    perform public.create_notification(
      a.client_id,
      'appointment_cancelled',
      'Agendamento cancelado pelo estabelecimento',
      b.name || ' cancelou seu agendamento de ' || sv.name || ' previsto para ' || v_time_str || '.',
      jsonb_build_object(
        'appointment_id', a.id,
        'business_id', a.business_id,
        'business_slug', b.slug,
        'business_name', b.name,
        'service_id', sv.id,
        'service_name', sv.name,
        'starts_at', a.starts_at,
        'cancelled_by', 'business'
      )
    );
  end if;
end $$;

-- 5.C) reschedule_appointment: notifica o outro lado com horários
create or replace function public.reschedule_appointment(p_id uuid, p_start timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare
  a public.appointments;
  st public.business_settings;
  b public.businesses;
  sv public.services;
  v_client public.profiles;
  staff boolean;
  v_member record;
  v_old_time_str text;
  v_new_time_str text;
  v_client_name text;
begin
  select * into a from public.appointments where id = p_id;
  if not found then raise exception 'not_found'; end if;
  staff := public.is_business_member(a.business_id);
  if not staff and a.client_id is distinct from auth.uid() then raise exception 'forbidden'; end if;
  if a.status <> 'confirmed' then raise exception 'not_editable'; end if;

  select * into st from public.business_settings where business_id = a.business_id;
  if not staff then
    if a.starts_at - now() < make_interval(hours => st.min_cancel_hours) then raise exception 'too_late'; end if;
  end if;

  perform public._validate_slot(a.business_id, p_start, a.duration_min);

  select * into b from public.businesses where id = a.business_id;
  select * into sv from public.services where id = a.service_id;
  select * into v_client from public.profiles where id = a.client_id;
  v_client_name := coalesce(nullif(trim(v_client.full_name), ''), 'Cliente');
  v_old_time_str := to_char(a.starts_at at time zone coalesce(st.timezone, 'America/Sao_Paulo'), 'DD/MM/YYYY "às" HH24:MI');
  v_new_time_str := to_char(p_start at time zone coalesce(st.timezone, 'America/Sao_Paulo'), 'DD/MM/YYYY "às" HH24:MI');

  update public.appointments
     set starts_at = p_start, ends_at = p_start + make_interval(mins => a.duration_min)
   where id = p_id;

  if not staff then
    -- Reagendamento pelo cliente -> notifica equipe
    for v_member in
      select user_id from public.business_memberships
       where business_id = a.business_id and status = 'active'
    loop
      perform public.create_notification(
        v_member.user_id,
        'appointment_rescheduled',
        'Horário reagendado pelo cliente',
        v_client_name || ' reagendou ' || sv.name || ' de ' || v_old_time_str || ' para ' || v_new_time_str || '.',
        jsonb_build_object(
          'appointment_id', a.id,
          'business_id', a.business_id,
          'business_slug', b.slug,
          'business_name', b.name,
          'service_id', sv.id,
          'service_name', sv.name,
          'old_starts_at', a.starts_at,
          'new_starts_at', p_start,
          'rescheduled_by', 'client'
        )
      );
    end loop;
  else
    -- Reagendamento pela equipe -> notifica cliente
    perform public.create_notification(
      a.client_id,
      'appointment_rescheduled',
      'Horário reagendado pelo estabelecimento',
      b.name || ' alterou o horário de ' || sv.name || ' para ' || v_new_time_str || '.',
      jsonb_build_object(
        'appointment_id', a.id,
        'business_id', a.business_id,
        'business_slug', b.slug,
        'business_name', b.name,
        'service_id', sv.id,
        'service_name', sv.name,
        'old_starts_at', a.starts_at,
        'new_starts_at', p_start,
        'rescheduled_by', 'business'
      )
    );
  end if;
end $$;

-- 5.D) Quando staff marca completed ou no_show (trigger em appointments)
create or replace function public.on_appointment_status_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  b public.businesses;
  sv public.services;
begin
  if old.status = 'confirmed' and new.status in ('completed', 'no_show') then
    select * into b from public.businesses where id = new.business_id;
    select * into sv from public.services where id = new.service_id;

    if new.status = 'completed' then
      perform public.create_notification(
        new.client_id,
        'appointment_completed',
        'Atendimento concluído',
        'Seu atendimento de ' || sv.name || ' em ' || b.name || ' foi finalizado com sucesso.',
        jsonb_build_object(
          'appointment_id', new.id,
          'business_id', b.id,
          'business_slug', b.slug,
          'business_name', b.name,
          'service_id', sv.id,
          'service_name', sv.name,
          'status', 'completed'
        )
      );
    elsif new.status = 'no_show' then
      perform public.create_notification(
        new.client_id,
        'appointment_no_show',
        'Não comparecimento registrado',
        'O estabelecimento ' || b.name || ' registrou ausência para o serviço ' || sv.name || '.',
        jsonb_build_object(
          'appointment_id', new.id,
          'business_id', b.id,
          'business_slug', b.slug,
          'business_name', b.name,
          'service_id', sv.id,
          'service_name', sv.name,
          'status', 'no_show'
        )
      );
    end if;
  end if;
  return new;
end $$;

drop trigger if exists appointment_status_notifications on public.appointments;
create trigger appointment_status_notifications
  after update of status on public.appointments
  for each row execute function public.on_appointment_status_changed();

revoke execute on function public.on_appointment_status_changed() from public, anon, authenticated;

-- 5.E) approver_decide_application: notifica o solicitante (e equipe)
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
  v_member record;
begin
  if not public.is_approver() then
    raise exception 'forbidden';
  end if;

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

  if v_app.submitted_by = auth.uid() then
    raise exception 'cannot_review_own';
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

    -- Notifica o solicitante sobre a recusa com justificativa
    perform public.create_notification(
      v_app.submitted_by,
      'business_rejected',
      'Solicitação de cadastro revisada',
      'A análise de ' || v_app.trade_name || ' precisa de correções: ' || trim(p_comment),
      jsonb_build_object(
        'application_id', v_app.id,
        'business_id', v_app.business_id,
        'trade_name', v_app.trade_name,
        'status', 'rejected',
        'review_comment', trim(p_comment)
      )
    );

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

    -- Notifica o solicitante sobre aprovação
    perform public.create_notification(
      v_app.submitted_by,
      'business_approved',
      'Negócio aprovado na plataforma!',
      'Parabéns! O cadastro de ' || v_app.trade_name || ' foi aprovado e seu negócio já pode publicar horários no Schedia.',
      jsonb_build_object(
        'application_id', v_app.id,
        'business_id', v_app.business_id,
        'trade_name', v_app.trade_name,
        'status', 'approved'
      )
    );
  end if;
end $$;

-- 5.F) on_application_submitted: notifica aprovadores da plataforma
create or replace function public.on_application_submitted() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_approver record;
begin
  update public.businesses
     set approval_status = 'pending'
   where id = new.business_id
     and approval_status = 'rejected';

  -- Notifica todos os aprovadores da plataforma
  for v_approver in select user_id from public.platform_approvers loop
    perform public.create_notification(
      v_approver.user_id,
      'business_application_submitted',
      'Nova solicitação para análise',
      'A empresa ' || new.trade_name || ' enviou uma solicitação de cadastro para validação.',
      jsonb_build_object(
        'application_id', new.id,
        'business_id', new.business_id,
        'trade_name', new.trade_name,
        'status', 'pending'
      )
    );
  end loop;

  return new;
end $$;

-- 6) Habilita realtime na tabela notifications (caso supabase_realtime exista)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
