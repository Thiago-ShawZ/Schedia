-- ============================================================
-- 0015_business_deactivate.sql
-- Soft-deactivate e hard-delete de negócios pelo dono
-- ============================================================

-- 1. Coluna archived_at
alter table public.businesses
  add column if not exists archived_at timestamptz;

-- ============================================================
-- 2. RPC: deactivate_business (soft — owner)
-- ============================================================
create or replace function public.deactivate_business(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.business_memberships
     where business_id = p_id
       and user_id = auth.uid()
       and role = 'owner'
       and status = 'active'
  ) then
    raise exception 'forbidden';
  end if;

  update public.businesses
     set is_published = false,
         archived_at  = now()
   where id = p_id;
end $$;
revoke execute on function public.deactivate_business(uuid) from public, anon;
grant  execute on function public.deactivate_business(uuid) to authenticated;

-- ============================================================
-- 3. RPC: reactivate_business (owner)
-- ============================================================
create or replace function public.reactivate_business(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.business_memberships
     where business_id = p_id
       and user_id = auth.uid()
       and role = 'owner'
       and status = 'active'
  ) then
    raise exception 'forbidden';
  end if;

  update public.businesses
     set archived_at = null
   where id = p_id;
end $$;
revoke execute on function public.reactivate_business(uuid) from public, anon;
grant  execute on function public.reactivate_business(uuid) to authenticated;

-- ============================================================
-- 4. RPC: delete_business_if_safe
--    Permite exclusão apenas se:
--      a) dono autenticado
--      b) negócio NÃO é 'approved' com agendamentos futuros confirmados
-- ============================================================
create or replace function public.delete_business_if_safe(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_status           text;
  v_future_confirmed bigint := 0;
begin
  if not exists (
    select 1 from public.business_memberships
     where business_id = p_id
       and user_id = auth.uid()
       and role = 'owner'
       and status = 'active'
  ) then
    raise exception 'forbidden';
  end if;

  select approval_status into v_status
    from public.businesses where id = p_id;

  if v_status = 'approved' then
    -- Tenta tabela "bookings" primeiro, cai em "appointments"
    begin
      execute
        'select count(*) from public.bookings
          where business_id = $1 and status = ''confirmed'' and starts_at > now()'
        into v_future_confirmed
        using p_id;
    exception when undefined_table then
      begin
        execute
          'select count(*) from public.appointments
            where business_id = $1 and status = ''confirmed'' and starts_at > now()'
          into v_future_confirmed
          using p_id;
      exception when undefined_table then
        v_future_confirmed := 0;
      end;
    end;

    if v_future_confirmed > 0 then
      raise exception 'has_future_appointments';
    end if;
  end if;

  delete from public.businesses where id = p_id;
end $$;
revoke execute on function public.delete_business_if_safe(uuid) from public, anon;
grant  execute on function public.delete_business_if_safe(uuid) to authenticated;

-- ============================================================
-- 5. RPCs de notificação — garantir que existem no remoto
-- ============================================================
create or replace function public.mark_notification_read(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.notifications
     set read_at = now()
   where id = p_id
     and user_id = auth.uid()
     and read_at is null;
end $$;
revoke execute on function public.mark_notification_read(uuid) from public, anon;
grant  execute on function public.mark_notification_read(uuid) to authenticated;

create or replace function public.mark_all_notifications_read()
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.notifications
     set read_at = now()
   where user_id = auth.uid()
     and read_at is null;
end $$;
revoke execute on function public.mark_all_notifications_read() from public, anon;
grant  execute on function public.mark_all_notifications_read() to authenticated;

create or replace function public.count_unread_notifications()
returns bigint language sql security definer set search_path = '' as $$
  select count(*) from public.notifications
   where user_id = auth.uid()
     and read_at is null;
$$;
revoke execute on function public.count_unread_notifications() from public, anon;
grant  execute on function public.count_unread_notifications() to authenticated;

create or replace function public.get_my_notifications(
  p_limit      int     default 30,
  p_only_unread boolean default false
)
returns setof public.notifications language sql security definer set search_path = '' as $$
  select * from public.notifications
   where user_id = auth.uid()
     and (not p_only_unread or read_at is null)
   order by created_at desc
   limit p_limit;
$$;
revoke execute on function public.get_my_notifications(int, boolean) from public, anon;
grant  execute on function public.get_my_notifications(int, boolean) to authenticated;
