-- Dados de demonstração (opcional). Crie sua conta no app ANTES: o negócio nasce vinculado ao primeiro usuário.
do $$
declare v_user uuid; v_biz uuid := gen_random_uuid();
begin
  select id into v_user from public.profiles order by created_at limit 1;
  if v_user is null then raise exception 'Crie uma conta no app antes de rodar este seed.'; end if;
  if exists (select 1 from public.businesses where slug = 'studio-demo') then raise notice 'seed já aplicado'; return; end if;
  insert into public.businesses(id, slug, name, description, city, category_id, created_by)
  values (v_biz, 'studio-demo', 'Studio Demo', 'Salão de demonstração do Schedia: cabelo, unhas e sobrancelhas.', 'São Paulo', 1, v_user);
  insert into public.services(business_id, name, description, price_cents, duration_min) values
    (v_biz, 'Corte feminino', 'Lavagem e finalização', 9000, 60),
    (v_biz, 'Manicure', 'Esmaltação simples', 4000, 45),
    (v_biz, 'Design de sobrancelhas', null, 3500, 30);
  insert into public.products(business_id, name, description, price_cents) values
    (v_biz, 'Shampoo hidratante', '300 ml', 4900), (v_biz, 'Máscara capilar', '250 g', 6500);
  update public.business_settings set opening_hours =
    '{"1":[["09:00","18:00"]],"2":[["09:00","18:00"]],"3":[["09:00","18:00"]],"4":[["09:00","18:00"]],"5":[["09:00","18:00"]],"6":[["09:00","14:00"]]}'
   where business_id = v_biz;
  update public.businesses set is_published = true where id = v_biz;
end $$;
