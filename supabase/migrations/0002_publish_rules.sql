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
