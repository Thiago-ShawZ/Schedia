-- Schedia · Fase 3 · book_appointment valida funcionamento, passo de horários e horizonte
create or replace function public.book_appointment(p_service uuid, p_start timestamptz) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  s public.services; st public.business_settings;
  v_end timestamptz; v_id uuid; l_start timestamp; l_end timestamp; h jsonb; v_open time; v_close time;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select sv.* into s from public.services sv
    join public.businesses b on b.id = sv.business_id
   where sv.id = p_service and sv.is_active and b.is_published;
  if not found then raise exception 'service_not_found'; end if;
  if p_start <= now() then raise exception 'past_time'; end if;
  if p_start > now() + interval '180 days' then raise exception 'too_far'; end if;

  select * into st from public.business_settings where business_id = s.business_id;
  v_end := p_start + make_interval(mins => s.duration_min);
  l_start := p_start at time zone st.timezone;
  l_end := v_end at time zone st.timezone;
  h := st.opening_hours -> (extract(dow from l_start)::int)::text -> 0;
  if h is null or l_start::date <> l_end::date then raise exception 'outside_hours'; end if;
  v_open := (h ->> 0)::time; v_close := (h ->> 1)::time;
  if l_start::time < v_open or l_end::time > v_close then raise exception 'outside_hours'; end if;
  if (extract(epoch from (l_start::time - v_open)) / 60)::int % st.slot_step_min <> 0 then
    raise exception 'bad_slot';
  end if;

  if exists (select 1 from public.blocked_times t
              where t.business_id = s.business_id
                and tstzrange(t.starts_at, t.ends_at) && tstzrange(p_start, v_end)) then
    raise exception 'slot_blocked';
  end if;
  -- sobreposição entre reservas: EXCLUDE constraint (23P01), segura sob concorrência
  insert into public.appointments(business_id, client_id, service_id, starts_at, ends_at, price_cents, duration_min)
  values (s.business_id, auth.uid(), s.id, p_start, v_end, s.price_cents, s.duration_min)
  returning id into v_id;
  return v_id;
end $$;
