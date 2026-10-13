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
