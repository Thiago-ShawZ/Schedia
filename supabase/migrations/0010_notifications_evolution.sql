-- Schedia · Evolução do Sistema de Notificações
-- Migration 0010: Reagendamento refinado, status completed/no_show, Realtime publication e flag de e-mail

-- 1) Flag de preferência para e-mail em profiles (default true)
alter table public.profiles
  add column if not exists email_notifications boolean not null default true;

-- 2) REAGENDAMENTO: Notifica o outro lado com starts_at garantido em data jsonb
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
    -- Reagendamento feito pelo cliente -> notifica equipe do estabelecimento
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
          'starts_at', p_start,
          'old_starts_at', a.starts_at,
          'new_starts_at', p_start,
          'rescheduled_by', 'client'
        )
      );
    end loop;
  else
    -- Reagendamento feito pelo estabelecimento -> notifica cliente
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
        'starts_at', p_start,
        'old_starts_at', a.starts_at,
        'new_starts_at', p_start,
        'rescheduled_by', 'business'
      )
    );
  end if;
end $$;

revoke execute on function public.reschedule_appointment(uuid, timestamptz) from public, anon;
grant execute on function public.reschedule_appointment(uuid, timestamptz) to authenticated;

-- 3) COMPLETED / NO_SHOW: Trigger para notificar cliente ao concluir ou marcar ausência
create or replace function public.on_appointment_status_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  b public.businesses;
  sv public.services;
begin
  if (old.status is distinct from new.status) and (new.status in ('completed', 'no_show')) then
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
          'starts_at', new.starts_at,
          'status', 'completed'
        )
      );
    elsif new.status = 'no_show' then
      perform public.create_notification(
        new.client_id,
        'appointment_no_show',
        'Não comparecimento registrado',
        'O estabelecimento ' || b.name || ' registrou ausência para o agendamento de ' || sv.name || '.',
        jsonb_build_object(
          'appointment_id', new.id,
          'business_id', b.id,
          'business_slug', b.slug,
          'business_name', b.name,
          'service_id', sv.id,
          'service_name', sv.name,
          'starts_at', new.starts_at,
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

-- 4) REALTIME: Replica Identity Full e inclusão na publicação do Supabase Realtime
alter table public.notifications replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'notifications'
    ) then
      alter publication supabase_realtime add table public.notifications;
    end if;
  end if;
end $$;
