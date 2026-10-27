-- Schedia · Fase 8 · Perfil de Aprovadores e fluxo de aprovação de negócios
-- Migration aditiva e compatível com versões anteriores

-- 1) Aprovadores da plataforma (cadastrados manualmente por admin)
create table if not exists public.platform_approvers (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_approvers enable row level security;

drop policy if exists approvers_self_select on public.platform_approvers;
create policy approvers_self_select on public.platform_approvers
  for select to authenticated using (user_id = auth.uid());
-- Sem policies de insert/update/delete para clientes: inserção apenas administrativa

create or replace function public.is_approver() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.platform_approvers a
     where a.user_id = auth.uid()
  )
$$;

revoke all on function public.is_approver() from public, anon;
grant execute on function public.is_approver() to authenticated;

-- 2) Estado de aprovação em businesses
-- Negócios já existentes recebem 'approved' para evitar qualquer regressão;
-- em seguida, o default da coluna passa a ser 'pending' para novos negócios.
alter table public.businesses
  add column if not exists approval_status text not null default 'approved'
  check (approval_status in ('pending', 'approved', 'rejected'));

alter table public.businesses alter column approval_status set default 'pending';

-- 3) Inserção só como 'pending' e não publicado (substitui biz_insert da 0003)
drop policy if exists biz_insert on public.businesses;
create policy biz_insert on public.businesses for insert to authenticated
  with check (
    created_by = auth.uid()
    and not is_published
    and approval_status = 'pending'
  );

-- 4) Trava de aprovação e publicação (trigger separado de enforce_publish_rules)
create or replace function public.enforce_approval_rules() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- auth.uid() nulo = contexto administrativo (SQL Editor / service role)
  if new.approval_status is distinct from old.approval_status
     and auth.uid() is not null
     and not public.is_approver()
     and not (old.approval_status = 'rejected' and new.approval_status = 'pending') then
    raise exception 'approval_forbidden';
  end if;

  if new.is_published and not old.is_published and new.approval_status <> 'approved' then
    raise exception 'publish_needs_approval';
  end if;

  return new;
end $$;

drop trigger if exists businesses_approval_rules on public.businesses;
create trigger businesses_approval_rules before update on public.businesses
  for each row execute function public.enforce_approval_rules();

revoke execute on function public.enforce_approval_rules() from public, anon, authenticated;

-- 5) Solicitações de análise (dados privados do cadastro ampliado)
create table if not exists public.business_applications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses on delete cascade,
  submitted_by uuid not null default auth.uid() references public.profiles,
  trade_name text not null check (char_length(trade_name) between 2 and 100),
  cnpj text check (cnpj is null or cnpj ~ '^[0-9]{14}$'),
  zip_code text not null check (zip_code ~ '^[0-9]{8}$'),
  street text not null,
  number text not null,
  complement text,
  district text not null,
  city text not null,
  state char(2) not null,
  revenue_range text not null,
  description text,
  instagram text,
  photos text[] not null check (cardinality(photos) between 1 and 6),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_comment text,
  reviewed_by uuid references public.profiles,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists one_pending_application_per_business
  on public.business_applications (business_id) where status = 'pending';

create index if not exists idx_business_applications_status_created
  on public.business_applications (status, created_at);

alter table public.business_applications enable row level security;

drop policy if exists app_select on public.business_applications;
create policy app_select on public.business_applications for select to authenticated
  using (submitted_by = auth.uid() or public.is_business_member(business_id));

drop policy if exists app_insert on public.business_applications;
create policy app_insert on public.business_applications for insert to authenticated
  with check (
    submitted_by = auth.uid()
    and status = 'pending'
    and public.is_business_member(business_id)
    and exists (
      select 1 from public.businesses b
       where b.id = business_id and b.approval_status <> 'approved'
    )
  );

-- 6) Trigger para reenvio após reprovação: volta status do negócio para 'pending'
create or replace function public.on_application_submitted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.businesses
     set approval_status = 'pending'
   where id = new.business_id
     and approval_status = 'rejected';
  return new;
end $$;

drop trigger if exists business_applications_submitted on public.business_applications;
create trigger business_applications_submitted after insert on public.business_applications
  for each row execute function public.on_application_submitted();

revoke execute on function public.on_application_submitted() from public, anon, authenticated;

-- 7) RPCs para o fluxo de aprovadores (acesso restrito por is_approver())

-- 7.1) Listagem de solicitações com paginação e filtro por status (sem transferir fotos)
create or replace function public.approver_list_applications(
  p_status text default 'pending',
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id uuid,
  business_id uuid,
  trade_name text,
  business_name text,
  business_slug text,
  city text,
  category_name text,
  applicant_name text,
  applicant_phone text,
  status text,
  created_at timestamptz,
  reviewed_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_limit int;
  v_offset int;
begin
  if not public.is_approver() then
    raise exception 'forbidden';
  end if;

  v_limit := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_offset := greatest(coalesce(p_offset, 0), 0);

  return query
    select
      a.id,
      a.business_id,
      a.trade_name,
      b.name as business_name,
      b.slug as business_slug,
      a.city,
      c.name as category_name,
      p.full_name as applicant_name,
      p.phone as applicant_phone,
      a.status,
      a.created_at,
      a.reviewed_at
    from public.business_applications a
    join public.businesses b on b.id = a.business_id
    left join public.categories c on c.id = b.category_id
    left join public.profiles p on p.id = a.submitted_by
   where (p_status is null or a.status = p_status)
   order by
     case when coalesce(p_status, 'pending') = 'pending' then a.created_at end asc,
     a.created_at desc
   limit v_limit
   offset v_offset;
end $$;

-- 7.2) Detalhamento completo da solicitação (inclui fotos e dados do negócio/solicitante)
create or replace function public.approver_get_application(p_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_res jsonb;
begin
  if not public.is_approver() then
    raise exception 'forbidden';
  end if;

  select jsonb_build_object(
    'application', to_jsonb(a.*),
    'business', jsonb_build_object(
      'id', b.id,
      'name', b.name,
      'slug', b.slug,
      'description', b.description,
      'city', b.city,
      'phone', b.phone,
      'logo_url', b.logo_url,
      'category_id', b.category_id,
      'category_name', c.name,
      'is_published', b.is_published,
      'approval_status', b.approval_status
    ),
    'applicant', jsonb_build_object(
      'id', p.id,
      'full_name', p.full_name,
      'phone', p.phone,
      'avatar_url', p.avatar_url
    ),
    'reviewer', case when r.id is not null then jsonb_build_object(
      'id', r.id,
      'full_name', r.full_name
    ) else null end
  ) into v_res
  from public.business_applications a
  join public.businesses b on b.id = a.business_id
  left join public.categories c on c.id = b.category_id
  left join public.profiles p on p.id = a.submitted_by
  left join public.profiles r on r.id = a.reviewed_by
  where a.id = p_id;

  if v_res is null then
    raise exception 'not_found';
  end if;

  return v_res;
end $$;

-- 7.3) Decisão da solicitação (aprovação ou reprovação fundamentada)
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
  if not public.is_approver() then
    raise exception 'forbidden';
  end if;

  -- Bloqueio pessimista para garantir decisão única sob concorrência
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

  -- Separação de funções: aprovador não pode decidir a própria solicitação
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

    -- Se já tiver categoria, serviço ativo e horários definidos, publica no Hub imediatamente
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
  end if;
end $$;

revoke execute on function public.approver_list_applications(text, int, int) from public, anon;
grant execute on function public.approver_list_applications(text, int, int) to authenticated;

revoke execute on function public.approver_get_application(uuid) from public, anon;
grant execute on function public.approver_get_application(uuid) to authenticated;

revoke execute on function public.approver_decide_application(uuid, boolean, text) from public, anon;
grant execute on function public.approver_decide_application(uuid, boolean, text) to authenticated;

-- 8) Bucket privado no Supabase Storage para fotos das análises
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'business-applications',
  'business-applications',
  false,
  2097152, -- 2 MB por arquivo
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists app_photos_insert on storage.objects;
create policy app_photos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'business-applications'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists app_photos_select on storage.objects;
create policy app_photos_select on storage.objects for select to authenticated
  using (
    bucket_id = 'business-applications'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_approver()
    )
  );

drop policy if exists app_photos_delete on storage.objects;
create policy app_photos_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'business-applications'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
