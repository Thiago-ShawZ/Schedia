-- ============================================================================
-- Schedia · Script de Verificação da Fase 8 (Aprovadores e Fluxo de Aprovação)
-- ============================================================================
-- Executar no Supabase SQL Editor.
-- Executa em transação com ROLLBACK no final para não poluir o banco de dados.
-- Todas as verificações usam assertivas (RAISE EXCEPTION em caso de falha).
-- ============================================================================

begin;

do $$
declare
  v_user_common uuid := '11111111-1111-4111-8111-111111111111';
  v_user_owner uuid := '22222222-2222-4222-8222-222222222222';
  v_user_approver uuid := '33333333-3333-4333-8333-333333333333';
  v_user_other uuid := '44444444-4444-4444-8444-444444444444';

  v_cat_id int;
  v_biz_id uuid;
  v_biz_ready_id uuid;
  v_app_id uuid;
  v_app_own_id uuid;
  v_app_ready_id uuid;
  v_app_data jsonb;
  v_list_count int;
  v_biz_published boolean;
  v_biz_status text;

  v_caught boolean;
begin
  raise notice '>>> INICIANDO BATERIA DE TESTES DE APROVADORES <<<';

  -- --------------------------------------------------------------------------
  -- 0. SETUP: Criar usuários fictícios e perfis para a simulação
  -- --------------------------------------------------------------------------
  insert into auth.users (id, email)
  values
    (v_user_common, 'common@schedia.test'),
    (v_user_owner, 'owner@schedia.test'),
    (v_user_approver, 'approver@schedia.test'),
    (v_user_other, 'other@schedia.test')
  on conflict (id) do nothing;

  insert into public.profiles (id, full_name, phone)
  values
    (v_user_common, 'Usuário Comum', '11999990001'),
    (v_user_owner, 'Dono do Negócio', '11999990002'),
    (v_user_approver, 'Aprovador Schedia', '11999990003'),
    (v_user_other, 'Outro Usuário', '11999990004')
  on conflict (id) do nothing;

  -- Cadastra v_user_approver como aprovador
  insert into public.platform_approvers (user_id)
  values (v_user_approver)
  on conflict (user_id) do nothing;

  select id into v_cat_id from public.categories limit 1;

  -- --------------------------------------------------------------------------
  -- 1. TESTES COM USUÁRIO COMUM
  -- --------------------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user_common)::text, true);

  -- 1.1 is_approver() deve retornar false
  if public.is_approver() <> false then
    raise exception 'TESTE 1.1 FALHOU: is_approver() retornou true para usuário comum!';
  end if;

  -- 1.2 Inserção direta em platform_approvers deve falhar por falta de policy
  v_caught := false;
  begin
    insert into public.platform_approvers (user_id) values (v_user_common);
  exception when others then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'TESTE 1.2 FALHOU: Usuário comum conseguiu inserir em platform_approvers!';
  end if;

  -- 1.3 As 3 RPCs de aprovador devem disparar 'forbidden'
  v_caught := false;
  begin
    perform * from public.approver_list_applications('pending', 10, 0);
  exception when others then
    if sqlerrm ~ 'forbidden' then v_caught := true; end if;
  end;
  if not v_caught then
    raise exception 'TESTE 1.3a FALHOU: approver_list_applications não bloqueou usuário comum!';
  end if;

  v_caught := false;
  begin
    perform public.approver_get_application(gen_random_uuid());
  exception when others then
    if sqlerrm ~ 'forbidden' then v_caught := true; end if;
  end;
  if not v_caught then
    raise exception 'TESTE 1.3b FALHOU: approver_get_application não bloqueou usuário comum!';
  end if;

  v_caught := false;
  begin
    perform public.approver_decide_application(gen_random_uuid(), true, 'Ok');
  exception when others then
    if sqlerrm ~ 'forbidden' then v_caught := true; end if;
  end;
  if not v_caught then
    raise exception 'TESTE 1.3c FALHOU: approver_decide_application não bloqueou usuário comum!';
  end if;

  raise notice ' [OK] Bloco 1: Usuário comum bloqueado em todas as operações de aprovador.';

  -- --------------------------------------------------------------------------
  -- 2. TESTES COM DONO DE NEGÓCIO
  -- --------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_user_owner)::text, true);

  -- 2.1 Inserção com approval_status = 'approved' direto deve falhar (RLS biz_insert)
  v_caught := false;
  begin
    insert into public.businesses (slug, name, created_by, is_published, approval_status)
    values ('teste-owner-approved', 'Teste Owner', v_user_owner, false, 'approved');
  exception when others then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'TESTE 2.1 FALHOU: Dono conseguiu inserir negócio já aprovado!';
  end if;

  -- 2.2 Inserção com is_published = true direto deve falhar (RLS biz_insert)
  v_caught := false;
  begin
    insert into public.businesses (slug, name, created_by, is_published, approval_status)
    values ('teste-owner-published', 'Teste Owner', v_user_owner, true, 'pending');
  exception when others then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'TESTE 2.2 FALHOU: Dono conseguiu inserir negócio já publicado!';
  end if;

  -- 2.3 Inserção legítima (pending e not is_published)
  insert into public.businesses (slug, name, created_by, is_published, approval_status, category_id)
  values ('salao-owner-teste', 'Salão do Dono', v_user_owner, false, 'pending', v_cat_id)
  returning id into v_biz_id;

  -- 2.4 Tentativa de auto-aprovação via UPDATE deve falhar pelo trigger enforce_approval_rules
  v_caught := false;
  begin
    update public.businesses set approval_status = 'approved' where id = v_biz_id;
  exception when others then
    if sqlerrm ~ 'approval_forbidden' then v_caught := true; end if;
  end;
  if not v_caught then
    raise exception 'TESTE 2.4 FALHOU: Dono conseguiu alterar seu approval_status para approved!';
  end if;

  -- 2.5 Tentativa de publicar antes da aprovação deve falhar pelo trigger
  v_caught := false;
  begin
    update public.businesses set is_published = true where id = v_biz_id;
  exception when others then
    if sqlerrm ~ 'publish_needs_approval' then v_caught := true; end if;
  end;
  if not v_caught then
    raise exception 'TESTE 2.5 FALHOU: Dono conseguiu publicar sem estar aprovado!';
  end if;

  -- 2.6 Submeter solicitação de análise (business_applications)
  insert into public.business_applications (
    business_id, submitted_by, trade_name, cnpj, zip_code, street, number, district, city, state,
    revenue_range, description, photos
  ) values (
    v_biz_id, v_user_owner, 'Salão Beleza Pura', '12345678000195', '01310100', 'Av Paulista', '1000', 'Bela Vista', 'São Paulo', 'SP',
    '10k_20k', 'Salão especializado', array['22222222-2222-4222-8222-222222222222/biz/f1.jpg']
  ) returning id into v_app_id;

  -- 2.7 Dono consegue ler a própria solicitação
  if not exists (select 1 from public.business_applications where id = v_app_id) then
    raise exception 'TESTE 2.7 FALHOU: Dono não conseguiu ler a própria solicitação!';
  end if;

  -- 2.8 Outro usuário NÃO pode ler a solicitação do dono
  perform set_config('request.jwt.claims', json_build_object('sub', v_user_other)::text, true);
  if exists (select 1 from public.business_applications where id = v_app_id) then
    raise exception 'TESTE 2.8 FALHOU: Usuário não-membro conseguiu ler a solicitação de outro negócio!';
  end if;

  raise notice ' [OK] Bloco 2: Regras do dono e isolamento RLS validados com sucesso.';

  -- --------------------------------------------------------------------------
  -- 3. TESTES COM APROVADOR
  -- --------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_user_approver)::text, true);

  -- 3.1 is_approver() deve retornar true
  if public.is_approver() <> true then
    raise exception 'TESTE 3.1 FALHOU: is_approver() retornou false para aprovador cadastrado!';
  end if;

  -- 3.2 Listar aplicações pendentes
  select count(*) into v_list_count
    from public.approver_list_applications('pending', 20, 0)
   where id = v_app_id;
  if v_list_count <> 1 then
    raise exception 'TESTE 3.2 FALHOU: approver_list_applications não retornou a solicitação pendente!';
  end if;

  -- 3.3 Obter detalhes completos da aplicação
  v_app_data := public.approver_get_application(v_app_id);
  if (v_app_data->'application'->>'trade_name') <> 'Salão Beleza Pura' then
    raise exception 'TESTE 3.3 FALHOU: approver_get_application não retornou os dados esperados!';
  end if;

  -- 3.4 Tentativa de reprovar com comentário menor que 10 caracteres deve falhar
  v_caught := false;
  begin
    perform public.approver_decide_application(v_app_id, false, 'Curto');
  exception when others then
    if sqlerrm ~ 'comment_required' then v_caught := true; end if;
  end;
  if not v_caught then
    raise exception 'TESTE 3.4 FALHOU: Reprovação com comentário curto (<10 caracteres) foi permitida!';
  end if;

  -- 3.5 Separação de funções: Aprovador não pode decidir a própria solicitação
  -- Cria negócio e solicitação submetidos pelo próprio aprovador
  insert into public.businesses (slug, name, created_by, is_published, approval_status, category_id)
  values ('biz-do-aprovador', 'Negócio do Aprovador', v_user_approver, false, 'pending', v_cat_id)
  returning id into v_biz_ready_id;

  insert into public.business_applications (
    business_id, submitted_by, trade_name, zip_code, street, number, district, city, state,
    revenue_range, photos
  ) values (
    v_biz_ready_id, v_user_approver, 'Negócio Próprio', '01310100', 'Rua X', '10', 'Centro', 'São Paulo', 'SP',
    'ate_5k', array['33333333-3333-4333-8333-333333333333/biz/f1.jpg']
  ) returning id into v_app_own_id;

  v_caught := false;
  begin
    perform public.approver_decide_application(v_app_own_id, true, 'Auto aprovação');
  exception when others then
    if sqlerrm ~ 'cannot_review_own' then v_caught := true; end if;
  end;
  if not v_caught then
    raise exception 'TESTE 3.5 FALHOU: Aprovador conseguiu aprovar a própria solicitação!';
  end if;

  -- 3.6 Aprovador aprova com sucesso a solicitação do dono
  perform public.approver_decide_application(v_app_id, true, 'Negócio aprovado com sucesso!');

  select approval_status into v_biz_status from public.businesses where id = v_biz_id;
  if v_biz_status <> 'approved' then
    raise exception 'TESTE 3.6 FALHOU: Negócio não ficou approved após aprovação!';
  end if;

  -- 3.7 Decisão repetida na mesma solicitação deve falhar ('already_decided')
  v_caught := false;
  begin
    perform public.approver_decide_application(v_app_id, true, 'Aprovar de novo');
  exception when others then
    if sqlerrm ~ 'already_decided' then v_caught := true; end if;
  end;
  if not v_caught then
    raise exception 'TESTE 3.7 FALHOU: Segunda decisão na mesma solicitação não foi impedida!';
  end if;

  raise notice ' [OK] Bloco 3: Operações e guardas do aprovador validadas com sucesso.';

  -- --------------------------------------------------------------------------
  -- 4. TESTE DE PUBLICAÇÃO AUTOMÁTICA SE NEGÓCIO ESTIVER PRONTO
  -- --------------------------------------------------------------------------
  -- Cria negócio pronto (categoria + serviço ativo + horários) antes de aprovar
  insert into public.businesses (slug, name, created_by, is_published, approval_status, category_id)
  values ('biz-pronto-para-publicar', 'Salão Pronto', v_user_owner, false, 'pending', v_cat_id)
  returning id into v_biz_ready_id;

  insert into public.services (business_id, name, price_cents, duration_min, is_active)
  values (v_biz_ready_id, 'Corte Cabelo', 5000, 30, true);

  update public.business_settings
     set opening_hours = '{"1":[["09:00","18:00"]]}'::jsonb
   where business_id = v_biz_ready_id;

  insert into public.business_applications (
    business_id, submitted_by, trade_name, zip_code, street, number, district, city, state,
    revenue_range, photos
  ) values (
    v_biz_ready_id, v_user_owner, 'Salão Pronto', '01310100', 'Rua Y', '20', 'Centro', 'São Paulo', 'SP',
    '5k_10k', array['22222222-2222-4222-8222-222222222222/biz/f2.jpg']
  ) returning id into v_app_ready_id;

  -- Aprovador aprova negócio pronto
  perform public.approver_decide_application(v_app_ready_id, true, 'Tudo em ordem!');

  select is_published into v_biz_published from public.businesses where id = v_biz_ready_id;
  if not coalesce(v_biz_published, false) then
    raise exception 'TESTE 4 FALHOU: Negócio com categoria, serviço e horários não foi publicado automaticamente!';
  end if;

  raise notice ' [OK] Bloco 4: Publicação automática após aprovação validada com sucesso.';

  -- --------------------------------------------------------------------------
  -- 5. TESTE DE REPROVAÇÃO E REENVIO
  -- --------------------------------------------------------------------------
  -- Reprovar a solicitação própria do aprovador usando outro contexto administrativo ou simulado
  -- Cria nova aplicação para reprovação
  insert into public.businesses (slug, name, created_by, is_published, approval_status, category_id)
  values ('biz-para-reprovar', 'Negócio Reprovar', v_user_owner, false, 'pending', v_cat_id)
  returning id into v_biz_id;

  insert into public.business_applications (
    business_id, submitted_by, trade_name, zip_code, street, number, district, city, state,
    revenue_range, photos
  ) values (
    v_biz_id, v_user_owner, 'Nome Reprovado', '01310100', 'Rua Z', '30', 'Centro', 'São Paulo', 'SP',
    'ate_5k', array['22222222-2222-4222-8222-222222222222/biz/f3.jpg']
  ) returning id into v_app_id;

  -- Aprovador reprova com justificativa >= 10 caracteres
  perform public.approver_decide_application(v_app_id, false, 'Endereço e fotos inválidos. Favor corrigir.');

  select approval_status into v_biz_status from public.businesses where id = v_biz_id;
  if v_biz_status <> 'rejected' then
    raise exception 'TESTE 5.1 FALHOU: Status do negócio não mudou para rejected!';
  end if;

  -- Dono reenvia nova solicitação: trigger on_application_submitted deve voltar businesses para 'pending'
  perform set_config('request.jwt.claims', json_build_object('sub', v_user_owner)::text, true);

  insert into public.business_applications (
    business_id, submitted_by, trade_name, zip_code, street, number, district, city, state,
    revenue_range, photos
  ) values (
    v_biz_id, v_user_owner, 'Nome Corrigido', '01310100', 'Rua Z', '30', 'Centro', 'São Paulo', 'SP',
    'ate_5k', array['22222222-2222-4222-8222-222222222222/biz/f4.jpg']
  );

  select approval_status into v_biz_status from public.businesses where id = v_biz_id;
  if v_biz_status <> 'pending' then
    raise exception 'TESTE 5.2 FALHOU: Reenvio de solicitação não voltou status do negócio para pending!';
  end if;

  raise notice ' [OK] Bloco 5: Ciclo de reprovação e reenvio validado com sucesso.';

  raise notice '===========================================================';
  raise notice '>>> TODOS OS TESTES PASSARAM COM SUCESSO! (100%% APROVADO) <<<';
  raise notice '===========================================================';
end $$;

-- Rollback limpa todos os dados gerados durante o teste
rollback;
