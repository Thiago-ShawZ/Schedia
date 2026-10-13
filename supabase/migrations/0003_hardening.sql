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
