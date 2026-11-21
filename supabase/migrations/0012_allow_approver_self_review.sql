-- ==============================================================================
-- Schedia · Permite ao Aprovador Homologar Estabelecimentos de Teste
-- ==============================================================================
-- Remove a trava cannot_review_own que impedia aprovadores de homologarem
-- solicitações criadas pela sua própria conta em ambiente de testes/TCC.
-- ==============================================================================

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
  -- Valida se o executor é um aprovador oficial
  if not public.is_approver() then
    raise exception 'forbidden';
  end if;

  -- Bloqueio pessimista para concorrência
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

  -- NOTA: A restrição cannot_review_own foi removida para permitir que o
  -- administrador/aprovador da plataforma teste o fluxo ponta a ponta com sua própria conta.

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

    -- Notifica o solicitante sobre a recusa com justificativa
    perform public.create_notification(
      v_app.submitted_by,
      'business_rejected',
      'Solicitação de cadastro revisada',
      'A análise de ' || v_app.trade_name || ' precisa de correções: ' || trim(p_comment),
      jsonb_build_object(
        'application_id', v_app.id,
        'business_id', v_app.business_id,
        'trade_name', v_app.trade_name,
        'status', 'rejected',
        'review_comment', trim(p_comment)
      )
    );

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

    -- Notifica o solicitante sobre aprovação
    perform public.create_notification(
      v_app.submitted_by,
      'business_approved',
      'Negócio aprovado na plataforma!',
      'Parabéns! O cadastro de ' || v_app.trade_name || ' foi aprovado e seu negócio já pode publicar horários no Schedia.',
      jsonb_build_object(
        'application_id', v_app.id,
        'business_id', v_app.business_id,
        'trade_name', v_app.trade_name,
        'status', 'approved'
      )
    );
  end if;
end $$;

revoke execute on function public.approver_decide_application(uuid, boolean, text) from public, anon;
grant execute on function public.approver_decide_application(uuid, boolean, text) to authenticated;
