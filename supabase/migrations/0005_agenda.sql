-- Schedia · Fase 4 · agenda, cancelamento, reagendamento e regras de status

-- validação única de horário (usada por reservar e reagendar)
create function public._validate_slot(p_business uuid, p_start timestamptz, p_duration int) returns void
language plpgsql security definer set search_path = '' as $$
declare st public.business_settings; v_end timestamptz; l_start timestamp; l_end timestamp; h jsonb; v_open time; v_close time;
begin
  if p_start <= now() then raise exception 'past_time'; end if;
  if p_start > now() + interval '180 days' then raise exception 'too_far'; end if;
  select * into st from public.business_settings where business_id = p_business;
  v_end := p_start + make_interval(mins => p_duration);
  l_start := p_start at time zone st.timezone; l_end := v_end at time zone st.timezone;
  h := st.opening_hours -> (extract(dow from l_start)::int)::text -> 0;
  if h is null or l_start::date <> l_end::date then raise exception 'outside_hours'; end if;
  v_open := (h ->> 0)::time; v_close := (h ->> 1)::time;
  if l_start::time < v_open or l_end::time > v_close then raise exception 'outside_hours'; end if;
  if (extract(epoch from (l_start::time - v_open)) / 60)::int % st.slot_step_min <> 0 then raise exception 'bad_slot'; end if;
  if exists (select 1 from public.blocked_times t where t.business_id = p_business
              and tstzrange(t.starts_at, t.ends_at) && tstzrange(p_start, v_end)) then
    raise exception 'slot_blocked';
  end if;
end $$;
revoke execute on function public._validate_slot from public, anon, authenticated;

create or replace function public.book_appointment(p_service uuid, p_start timestamptz) returns uuid
language plpgsql security definer set search_path = '' as $$
declare s public.services; v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select sv.* into s from public.services sv join public.businesses b on b.id = sv.business_id
   where sv.id = p_service and sv.is_active and b.is_published;
  if not found then raise exception 'service_not_found'; end if;
  perform public._validate_slot(s.business_id, p_start, s.duration_min);
  insert into public.appointments(business_id, client_id, service_id, starts_at, ends_at, price_cents, duration_min)
  values (s.business_id, auth.uid(), s.id, p_start, p_start + make_interval(mins => s.duration_min), s.price_cents, s.duration_min)
  returning id into v_id;
  return v_id;
end $$;

-- status finais não reabrem; concluir/faltou só depois do horário
create or replace function public.lock_appointment_fields() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.business_id, new.client_id, new.service_id, new.price_cents, new.duration_min, new.created_at)
     is distinct from (old.business_id, old.client_id, old.service_id, old.price_cents, old.duration_min, old.created_at) then
    raise exception 'appointment_fields_locked';
  end if;
  if new.status <> old.status then
    if old.status <> 'confirmed' then raise exception 'status_locked'; end if;
    if new.status in ('completed', 'no_show') and new.starts_at > now() then raise exception 'too_early'; end if;
    if new.status = 'cancelled' then new.cancelled_at := coalesce(new.cancelled_at, now()); end if;
  end if;
  return new;
end $$;

-- agenda do profissional (nome/telefone do cliente só para a equipe)
create function public.get_business_agenda(p_business uuid, p_from timestamptz, p_to timestamptz)
returns table (id uuid, starts_at timestamptz, ends_at timestamptz, status public.appt_status, service_name text,
               client_name text, client_phone text, price_cents int, notes text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_business_member(p_business) then raise exception 'forbidden'; end if;
  return query
    select a.id, a.starts_at, a.ends_at, a.status, sv.name, pr.full_name, pr.phone, a.price_cents, a.notes
      from public.appointments a
      join public.services sv on sv.id = a.service_id
      join public.profiles pr on pr.id = a.client_id
     where a.business_id = p_business and a.starts_at >= p_from and a.starts_at < p_to
     order by a.starts_at;
end $$;

-- histórico do cliente (inclui negócio e serviço mesmo se inativos)
create function public.get_my_appointments()
returns table (id uuid, business_id uuid, business_name text, business_slug text, service_name text,
               starts_at timestamptz, ends_at timestamptz, status public.appt_status, price_cents int, duration_min int,
               timezone text, opening_hours jsonb, slot_step_min int, min_cancel_hours int)
language sql stable security definer set search_path = '' as $$
  select a.id, a.business_id, b.name, b.slug, sv.name, a.starts_at, a.ends_at, a.status, a.price_cents, a.duration_min,
         st.timezone, st.opening_hours, st.slot_step_min, st.min_cancel_hours
    from public.appointments a
    join public.businesses b on b.id = a.business_id
    join public.services sv on sv.id = a.service_id
    join public.business_settings st on st.business_id = a.business_id
   where a.client_id = auth.uid()
   order by a.starts_at desc
$$;

create function public.cancel_appointment(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.appointments; st public.business_settings; staff boolean;
begin
  select * into a from public.appointments where id = p_id;
  if not found then raise exception 'not_found'; end if;
  staff := public.is_business_member(a.business_id);
  if not staff and a.client_id is distinct from auth.uid() then raise exception 'forbidden'; end if;
  if a.status <> 'confirmed' then raise exception 'not_editable'; end if;
  if not staff then
    select * into st from public.business_settings where business_id = a.business_id;
    if a.starts_at - now() < make_interval(hours => st.min_cancel_hours) then raise exception 'too_late'; end if;
  end if;
  update public.appointments set status = 'cancelled' where id = p_id;
end $$;

create function public.reschedule_appointment(p_id uuid, p_start timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.appointments; st public.business_settings; staff boolean;
begin
  select * into a from public.appointments where id = p_id;
  if not found then raise exception 'not_found'; end if;
  staff := public.is_business_member(a.business_id);
  if not staff and a.client_id is distinct from auth.uid() then raise exception 'forbidden'; end if;
  if a.status <> 'confirmed' then raise exception 'not_editable'; end if;
  if not staff then
    select * into st from public.business_settings where business_id = a.business_id;
    if a.starts_at - now() < make_interval(hours => st.min_cancel_hours) then raise exception 'too_late'; end if;
  end if;
  perform public._validate_slot(a.business_id, p_start, a.duration_min);
  update public.appointments set starts_at = p_start, ends_at = p_start + make_interval(mins => a.duration_min) where id = p_id;
end $$;

revoke execute on function public.get_business_agenda, public.get_my_appointments,
  public.cancel_appointment, public.reschedule_appointment from public, anon;
grant execute on function public.get_business_agenda, public.get_my_appointments,
  public.cancel_appointment, public.reschedule_appointment to authenticated;
