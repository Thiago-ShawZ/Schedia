-- Schedia · schema completo (concatenação das migrations 0001..0005)
-- Schedia · Fase 1 · schema base + RLS + anti-sobreposição
create extension if not exists btree_gist;

create type public.member_role as enum ('owner','manager');
create type public.appt_status as enum ('confirmed','cancelled','completed','no_show');

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text not null default '',
  phone text,
  created_at timestamptz not null default now()
);

create table public.categories (
  id serial primary key, name text not null unique, slug text not null unique
);
insert into public.categories(name, slug) values
  ('Cabelo','cabelo'),('Unhas','unhas'),('Sobrancelhas e cílios','sobrancelhas-cilios'),
  ('Maquiagem','maquiagem'),('Estética e pele','estetica-pele'),('Barbearia','barbearia');

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,60}$'),
  name text not null check (char_length(name) between 2 and 100),
  description text, city text,
  category_id int references public.categories,
  is_published boolean not null default false,
  created_by uuid not null default auth.uid() references public.profiles,
  created_at timestamptz not null default now()
);

create table public.business_memberships (
  business_id uuid references public.businesses on delete cascade,
  user_id uuid references public.profiles on delete cascade,
  role public.member_role not null default 'owner',
  status text not null default 'active' check (status in ('active','revoked')),
  primary key (business_id, user_id)
);

create table public.business_settings (
  business_id uuid primary key references public.businesses on delete cascade,
  timezone text not null default 'America/Sao_Paulo',
  opening_hours jsonb not null default '{}',   -- {"1":[["09:00","18:00"]], ...} 0=dom
  slot_step_min int not null default 30 check (slot_step_min > 0),
  min_cancel_hours int not null default 24 check (min_cancel_hours >= 0)
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  name text not null, description text,
  price_cents int not null check (price_cents >= 0),
  duration_min int not null check (duration_min > 0),
  is_active boolean not null default true,
  unique (id, business_id)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  name text not null, description text,
  price_cents int not null check (price_cents >= 0),
  is_active boolean not null default true
);

create table public.blocked_times (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  starts_at timestamptz not null, ends_at timestamptz not null, reason text,
  check (ends_at > starts_at)
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  client_id uuid not null references public.profiles,
  service_id uuid not null,
  starts_at timestamptz not null, ends_at timestamptz not null,
  status public.appt_status not null default 'confirmed',
  price_cents int not null, duration_min int not null,   -- cópia histórica
  notes text, cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  foreign key (service_id, business_id) references public.services (id, business_id),
  exclude using gist (business_id with =, tstzrange(starts_at, ends_at) with &&)
    where (status = 'confirmed')
);
create index on public.appointments (client_id);
create index on public.business_memberships (user_id);

-- ---------- helpers / triggers ----------
create function public.is_business_member(b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.business_memberships m
    where m.business_id = b and m.user_id = auth.uid() and m.status = 'active')
$$;

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.handle_new_business() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.business_memberships(business_id, user_id, role) values (new.id, new.created_by, 'owner');
  insert into public.business_settings(business_id) values (new.id);
  return new;
end $$;
create trigger on_business_created after insert on public.businesses
  for each row execute function public.handle_new_business();

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.businesses enable row level security;
alter table public.business_memberships enable row level security;
alter table public.business_settings enable row level security;
alter table public.services enable row level security;
alter table public.products enable row level security;
alter table public.blocked_times enable row level security;
alter table public.appointments enable row level security;

create policy profiles_own_select on public.profiles for select using (id = auth.uid());
create policy profiles_own_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy categories_read on public.categories for select using (true);

create policy biz_read on public.businesses for select
  using (is_published or public.is_business_member(id));
create policy biz_insert on public.businesses for insert to authenticated
  with check (created_by = auth.uid());
create policy biz_update on public.businesses for update
  using (public.is_business_member(id)) with check (public.is_business_member(id));

create policy memb_own_select on public.business_memberships for select using (user_id = auth.uid());

create policy settings_read on public.business_settings for select
  using (public.is_business_member(business_id)
     or exists (select 1 from public.businesses b where b.id = business_id and b.is_published));
create policy settings_write on public.business_settings for update
  using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));

create policy services_read on public.services for select
  using (public.is_business_member(business_id)
     or (is_active and exists (select 1 from public.businesses b where b.id = business_id and b.is_published)));
create policy services_write on public.services for all
  using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));

create policy products_read on public.products for select
  using (public.is_business_member(business_id)
     or (is_active and exists (select 1 from public.businesses b where b.id = business_id and b.is_published)));
create policy products_write on public.products for all
  using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));

create policy blocked_member_all on public.blocked_times for all
  using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));

-- cliente só LÊ as próprias reservas; criar/cancelar passa pelas funções abaixo
create policy appt_read on public.appointments for select
  using (client_id = auth.uid() or public.is_business_member(business_id));
create policy appt_member_update on public.appointments for update
  using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));

-- ---------- funções de reserva ----------
create function public.book_appointment(p_service uuid, p_start timestamptz) returns uuid
language plpgsql security definer set search_path = '' as $$
declare s public.services; v_end timestamptz; v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select sv.* into s from public.services sv
    join public.businesses b on b.id = sv.business_id
   where sv.id = p_service and sv.is_active and b.is_published;
  if not found then raise exception 'service_not_found'; end if;
  if p_start <= now() then raise exception 'past_time'; end if;
  v_end := p_start + make_interval(mins => s.duration_min);
  if exists (select 1 from public.blocked_times t
              where t.business_id = s.business_id
                and tstzrange(t.starts_at, t.ends_at) && tstzrange(p_start, v_end)) then
    raise exception 'slot_blocked';
  end if;
  -- sobreposição de reservas: barrada pela EXCLUDE constraint (erro 23P01), mesmo sob concorrência
  insert into public.appointments(business_id, client_id, service_id, starts_at, ends_at, price_cents, duration_min)
  values (s.business_id, auth.uid(), s.id, p_start, v_end, s.price_cents, s.duration_min)
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.book_appointment from public, anon;
grant execute on function public.book_appointment to authenticated;

create function public.get_busy_slots(p_business uuid, p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.starts_at, a.ends_at from public.appointments a
   where a.business_id = p_business and a.status = 'confirmed' and a.starts_at < p_to and a.ends_at > p_from
  union all
  select t.starts_at, t.ends_at from public.blocked_times t
   where t.business_id = p_business and t.starts_at < p_to and t.ends_at > p_from
$$;
grant execute on function public.get_busy_slots to anon, authenticated;
-- Schedia · Fase 2 · regras de publicação e proteção de created_by
create function public.enforce_publish_rules() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.created_by := old.created_by;
  if new.is_published and not old.is_published then
    if new.category_id is null then raise exception 'publish_needs_category'; end if;
    if not exists (select 1 from public.services s where s.business_id = new.id and s.is_active) then
      raise exception 'publish_needs_service'; end if;
    if not exists (select 1 from public.business_settings st
                    where st.business_id = new.id and st.opening_hours <> '{}'::jsonb) then
      raise exception 'publish_needs_hours'; end if;
  end if;
  return new;
end $$;
create trigger businesses_publish_rules before update on public.businesses
  for each row execute function public.enforce_publish_rules();
-- Schedia · auditoria pós-Fase 2 · endurecimento de segurança e aderência ao modelo de dados

-- 1. perfis para usuários criados antes do trigger
insert into public.profiles (id) select id from auth.users on conflict do nothing;

-- 2. publicação não pode ser burlada no INSERT (regras só valiam no UPDATE)
drop policy biz_insert on public.businesses;
create policy biz_insert on public.businesses for insert to authenticated
  with check (created_by = auth.uid() and not is_published);

-- 3. dados históricos da reserva são imutáveis (negócio, cliente, serviço, preço, duração)
create function public.lock_appointment_fields() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.business_id, new.client_id, new.service_id, new.price_cents, new.duration_min, new.created_at)
     is distinct from (old.business_id, old.client_id, old.service_id, old.price_cents, old.duration_min, old.created_at) then
    raise exception 'appointment_fields_locked';
  end if;
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    new.cancelled_at := coalesce(new.cancelled_at, now());
  end if;
  return new;
end $$;
create trigger appointments_lock before update on public.appointments
  for each row execute function public.lock_appointment_fields();

-- 4. disponibilidade só para negócios publicados (ou para a própria equipe)
create or replace function public.get_busy_slots(p_business uuid, p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.starts_at, a.ends_at from public.appointments a
   where a.business_id = p_business and a.status = 'confirmed' and a.starts_at < p_to and a.ends_at > p_from
     and exists (select 1 from public.businesses b where b.id = p_business and (b.is_published or public.is_business_member(b.id)))
  union all
  select t.starts_at, t.ends_at from public.blocked_times t
   where t.business_id = p_business and t.starts_at < p_to and t.ends_at > p_from
     and exists (select 1 from public.businesses b where b.id = p_business and (b.is_published or public.is_business_member(b.id)))
$$;

-- 5. índices das consultas por negócio
create index on public.services (business_id);
create index on public.products (business_id);
create index on public.blocked_times (business_id, starts_at);
create index on public.appointments (business_id, starts_at);

-- 6. tabelas previstas no modelo (preparação Fase 6). Tokens NÃO ficam aqui: Edge Function/Vault.
create table public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  provider text not null default 'google',
  external_calendar_id text,
  sync_state jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create table public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  appointment_id uuid references public.appointments on delete set null,
  channel text not null,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  attempts int not null default 0,
  error text,
  created_at timestamptz not null default now()
);
alter table public.calendar_connections enable row level security;  -- sem policies: só service role
alter table public.notification_logs enable row level security;
create policy notif_member_read on public.notification_logs for select using (public.is_business_member(business_id));

-- 7. funções de trigger não devem ser chamáveis via API
revoke execute on function public.handle_new_user(), public.handle_new_business(),
  public.enforce_publish_rules(), public.lock_appointment_fields() from public, anon, authenticated;
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

-- Schedia · Fase 5/6 · suporte a imagens de logo e avatar
alter table public.businesses add column if not exists logo_url text;
alter table public.profiles add column if not exists avatar_url text;

-- Schedia · Fase 1 · Contato comercial via WhatsApp
alter table public.businesses add column if not exists phone text;

