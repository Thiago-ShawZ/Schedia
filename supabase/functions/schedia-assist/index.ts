// Supabase Edge Function: schedia-assist
// Assistente inteligente Schedia Assist com Google Gemini (Google AI Studio - Free Tier)
// Mantém as chaves de API restritas ao ambiente seguro de backend (Secrets do Supabase).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface IncomingMessage {
  sender: 'user' | 'assistant'
  text: string
}

interface BusinessContext {
  business?: {
    id?: string
    name?: string
    description?: string | null
    city?: string | null
    phone?: string | null
  }
  services?: Array<{
    name: string
    description?: string | null
    price_cents: number
    duration_min: number
  }>
  products?: Array<{
    name: string
    description?: string | null
    price_cents: number
  }>
  settings?: {
    timezone?: string
    opening_hours?: Record<string, unknown>
    min_cancel_hours?: number
  }
  currentBooking?: {
    serviceName?: string
    priceCents?: number
    durationMin?: number
    step?: number
    when?: string
  }
  platformRoute?: string
}

// Formatador de BRL simples para a montagem do prompt
function formatBrl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Monta o prompt do sistema com base estrita nos dados do estabelecimento ou no escopo geral da plataforma
function buildSystemInstruction(ctx: BusinessContext): string {
  const biz = ctx.business || {}
  const svcs = ctx.services || []
  const prods = ctx.products || []
  const cfg = ctx.settings || {}
  const current = ctx.currentBooking

  // Modo Assistente de Plataforma Geral (quando o usuário navega pelo Hub, Agendamentos, Perfil, etc.)
  if (!biz.name) {
    return `Você é o Schedia Assist, o assistente virtual de inteligência artificial oficial da plataforma Schedia.

SUAS DIRETRIZES FUNDAMENTAIS:
1. Você ajuda clientes e usuários a navegar na plataforma Schedia, compreender como agendar atendimentos, consultar reservas, acessar perfis e descobrir novos recursos como o SchedLab 3D.
2. Seja sempre educado, acolhedor, profissional, objetivo e prestativo em Português do Brasil (PT-BR). Responda com parágrafos concisos ou listas de tópicos quando aplicável.
3. CONHECIMENTO DA PLATAFORMA SCHEDIA:
   - Descobrir / Hub (/hub): página onde o cliente explora barbearias, salões de beleza, clínicas de estética e estúdios parceiros, filtra por cidade e categoria e acessa os perfis públicos para agendamento online.
   - Meus Agendamentos (/agendamentos): calendário mensal interativo onde o usuário pode visualizar todas as suas reservas agendadas, conferir data, horário, profissional, valor e status, além de entrar em contato com a loja ou cancelar reservas com antecedência.
   - Perfil (/perfil): área onde o cliente atualiza sua foto, confere seu e-mail cadastrado e encerra sua sessão com segurança ("Sair da conta").
   - Gestão / Meus Negócios (/painel): área dos donos de estabelecimentos para gerenciar sua agenda, cadastrar catálogo de serviços e produtos, criar bloqueios de horários e configurar expediente.
   - SchedLab 3D: laboratório 3D interativo de análise e simulação capilar, acessível pelo menu superior do sistema.
4. REGRAS GERAIS DE AGENDAMENTO:
   - Para agendar: oriente o usuário a acessar "Descobrir" (Hub), escolher o estabelecimento desejado e clicar no botão "Agendar" do serviço que quer realizar.
   - Cancelamentos e reagendamentos: devem ser feitos pela tela "Agendamentos" respeitando o prazo mínimo de antecedência estipulado pelo negócio.
   - Você NÃO pode realizar agendamentos ou cancelamentos diretamente pela conversa, mas orienta os passos exatos na interface.
5. Em caso de dúvidas médicas, de saúde ou procedimentos invasivos, recomende sempre consulta prévia com profissionais especializados.`
  }

  let instruction = `Você é o Schedia Assist, o assistente virtual de inteligência artificial oficial de atendimento do estabelecimento "${biz.name}".

SUAS DIRETRIZES FUNDAMENTAIS:
1. Você ajuda clientes a esclarecer dúvidas sobre os serviços, preços, duração, regras de agendamento e informações gerais antes e durante a reserva.
2. Seja sempre educado, claro, acolhedor, profissional e direto ao ponto em Português do Brasil (PT-BR). Responda em parágrafos concisos ou tópicos curtos quando adequado.
3. INFORMAÇÕES DO ESTABELECIMENTO vs INFORMAÇÕES GERAIS:
   - Baseie-se ESTRITAMENTE nas informações cadastradas fornecidas abaixo para tudo que diz respeito ao estabelecimento.
   - NUNCA invente serviços, preços, descontos, políticas de cancelamento, profissionais ou horários que não estejam no catálogo abaixo.
   - Se o cliente perguntar algo específico sobre o negócio que não esteja nos dados abaixo (ex: estacionamento próprio, se aceita pet, marcas específicas não citadas), responda com transparência dizendo que não possui essa informação cadastrada e recomende entrar em contato diretamente com o estabelecimento${biz.phone ? ` pelo telefone/WhatsApp ${biz.phone}` : ''}.
4. ORIENTAÇÕES GERAIS:
   - Para dúvidas gerais (como o que é determinado procedimento, diferenças comuns entre técnicas, cuidados gerais pré e pós-atendimento), você PODE fornecer explicações claras e prudentes.
   - NUNCA faça diagnósticos médicos ou recomendações clínicas personalizadas para alergias, contraindicações graves ou problemas de saúde. Nesses casos, recomende sempre consulta prévia com especialista ou médico.
5. OPERAÇÕES DE AGENDAMENTO:
   - Você NÃO TEM permissão técnica para criar, confirmar, remarcar ou cancelar reservas diretamente pelo chat.
   - Se o cliente disser que quer agendar, confirme que está pronto e oriente-o a clicar no botão "Agendar" do serviço desejado na tela, ou selecionar data e horário na página.

DADOS REAIS DO ESTABELECIMENTO:
- Nome: ${biz.name || 'Não informado'}
- Cidade/Localização: ${biz.city || 'Não informada'}
${biz.description ? `- Descrição: ${biz.description}` : ''}
${biz.phone ? `- Contato: ${biz.phone}` : ''}
${cfg.min_cancel_hours ? `- Política de cancelamento: cancelamento ou reagendamento permitido com até ${cfg.min_cancel_hours} horas de antecedência.` : ''}

CATÁLOGO DE SERVIÇOS DISPONÍVEIS (${svcs.length}):
${
  svcs.length === 0
    ? 'Nenhum serviço cadastrado no momento.'
    : svcs
        .map(
          (s, idx) =>
            `${idx + 1}. ${s.name} — ${formatBrl(s.price_cents)} (Duração: ${s.duration_min} min)${
              s.description ? `\n   Detalhes: ${s.description}` : ''
            }`
        )
        .join('\n')
}

${
  prods.length > 0
    ? `PRODUTOS DISPONÍVEIS NO LOCAL (${prods.length}):\n` +
      prods
        .map((p, idx) => `${idx + 1}. ${p.name} — ${formatBrl(p.price_cents)}${p.description ? ` (${p.description})` : ''}`)
        .join('\n')
    : ''
}

${
  current
    ? `CONTEXTO DA RESERVA EM ANDAMENTO PELO CLIENTE:
- Serviço em processo de reserva: ${current.serviceName || 'Não especificado'}
- Valor: ${current.priceCents ? formatBrl(current.priceCents) : '—'}
- Duração estimada: ${current.durationMin ? `${current.durationMin} min` : '—'}
${current.when ? `- Horário selecionado: ${current.when}` : '- Horário: ainda em seleção'}
${current.step !== undefined ? `- Etapa da reserva: ${['Escolha de horário', 'Identificação', 'Confirmação', 'Concluído'][current.step] || 'Etapa inicial'}` : ''}
Use esse contexto para responder de forma ainda mais direcionada se a dúvida do cliente for sobre o que ele está reservando agora.`
    : ''
}
`

  return instruction
}

// Resposta inteligente e estruturada baseada no catálogo e na plataforma (motor de contingência confiável)
function buildRuleBasedResponse(message: string, context: BusinessContext): string {
  const lower = (message || '').toLowerCase().trim()
  const bizName = context?.business?.name
  const svcs = context?.services || []
  const prods = context?.products || []
  const cfg = context?.settings || {}
  const current = context?.currentBooking

  // 1. Respostas para modo Estabelecimento
  if (bizName) {
    // Saudações
    if (/^(ol[aá]|oi|oie|bom dia|boa tarde|boa noite|e a[ií]|tudo bem|sauda)/i.test(lower)) {
      if (current?.serviceName) {
        return `Olá! Seja bem-vindo ao **${bizName}**.\n\nVi que você tem interesse em **${current.serviceName}**. Posso te explicar sobre o procedimento, valores ou duração estimada. Como posso te ajudar?`
      }
      return `Olá! Seja bem-vindo ao **${bizName}**!\n\nPosso te ajudar a conferir nossos serviços, valores, horários e regras de agendamento. Como posso te ajudar hoje?`
    }

    // Preços / Serviços
    if (lower.includes('preço') || lower.includes('valor') || lower.includes('quanto custa') || lower.includes('serviço') || lower.includes('catálogo') || lower.includes('tabela')) {
      if (svcs.length > 0) {
        const list = svcs
          .slice(0, 6)
          .map((s, idx) => `• **${s.name}**: ${formatBrl(s.price_cents)} (${s.duration_min} min)${s.description ? ` — ${s.description}` : ''}`)
          .join('\n')
        return `Aqui estão os principais serviços disponíveis em **${bizName}**:\n\n${list}\n\nPara agendar qualquer um deles, basta fechar o chat e clicar no botão **Agendar** na página!`
      }
      return `No momento não há serviços listados diretamente no catálogo de ${bizName}. Entre em contato com o local para mais informações.`
    }

    // Serviço específico mencionado
    const matchedService = svcs.find(s => lower.includes(s.name.toLowerCase()))
    if (matchedService) {
      return `O serviço **${matchedService.name}** tem valor de **${formatBrl(matchedService.price_cents)}** e duração estimada de **${matchedService.duration_min} minutos**.\n\n${matchedService.description ? `*Descrição:* ${matchedService.description}\n\n` : ''}Para agendar este horário, basta clicar no botão **Agendar** correspondente na página!`
    }

    // Cancelamento e reagendamento
    if (lower.includes('cancelar') || lower.includes('reagendar') || lower.includes('desmarcar') || lower.includes('remarcar')) {
      const cancelH = cfg?.min_cancel_hours || 24
      return `Em **${bizName}**, os agendamentos podem ser cancelados ou reagendados com no mínimo **${cancelH} horas de antecedência** através da sua área de **Agendamentos** no Schedia.`
    }

    // Horários de funcionamento
    if (lower.includes('horário') || lower.includes('funcionamento') || lower.includes('aberto') || lower.includes('abre') || lower.includes('fecha')) {
      return `Você pode consultar os horários e datas disponíveis em tempo real diretamente na tela: basta clicar no botão **Agendar** de qualquer serviço para visualizar a agenda de ${bizName}!`
    }

    // Produtos
    if (lower.includes('produto') || lower.includes('venda') || lower.includes('comprar')) {
      if (prods.length > 0) {
        const pList = prods.slice(0, 5).map(p => `• **${p.name}**: ${formatBrl(p.price_cents)}`).join('\n')
        return `Produtos disponíveis no local:\n\n${pList}`
      }
      return `No momento não há produtos cadastrados para venda no local.`
    }

    // Como agendar
    if (lower.includes('como agendar') || lower.includes('marcar') || lower.includes('reservar')) {
      return `Para agendar em **${bizName}**:\n1. Localize o serviço desejado na lista.\n2. Clique em **Agendar**.\n3. Escolha a data e o horário mais conveniente.\n4. Confirme seus dados para finalizar a reserva!`
    }

    // Contato
    if (lower.includes('contato') || lower.includes('telefone') || lower.includes('whatsapp') || lower.includes('zap') || lower.includes('endereço')) {
      let info = `Informações de **${bizName}**:\n`
      if (context.business?.city) info += `• **Localização:** ${context.business.city}\n`
      if (context.business?.phone) info += `• **Contato:** ${context.business.phone}\n`
      if (context.business?.description) info += `• **Sobre:** ${context.business.description}\n`
      return info
    }

    return `Posso te ajudar com dúvidas sobre os serviços, valores, regras de agendamento e horários de **${bizName}**. Como posso ajudar você hoje?`
  }

  // 2. Respostas para modo Plataforma Geral (Hub, Agendamentos, Perfil, SchedLab, etc.)
  if (/^(ol[aá]|oi|oie|bom dia|boa tarde|boa noite|e a[ií]|tudo bem|sauda)/i.test(lower)) {
    return `Olá! Sou o **Schedia Assist**, assistente virtual oficial da plataforma Schedia.\n\nPosso te orientar sobre:\n• Como encontrar estabelecimentos no **Hub**\n• Como gerenciar ou cancelar seus **Agendamentos**\n• Como explorar o laboratório **SchedLab 3D**\n• Como cadastrar e gerenciar seu negócio\n\nComo posso te ajudar hoje?`
  }

  if (lower.includes('agendar') || lower.includes('reservar') || lower.includes('marcar') || lower.includes('hub') || lower.includes('descobrir') || lower.includes('encontrar')) {
    return `Para encontrar estabelecimentos e agendar:\n1. Acesse **Descobrir** no menu superior.\n2. Escolha uma categoria (Barbearia, Cabelo, Estética, etc.) ou pesquise pelo nome.\n3. Clique no negócio desejado para ver os serviços e agendar seu horário online.`
  }

  if (lower.includes('cancelar') || lower.includes('reagendar') || lower.includes('meus agendamentos') || lower.includes('ver agendamento') || lower.includes('calendário')) {
    return `Para visualizar e gerenciar suas reservas:\n1. Acesse a página **Agendamentos** no menu superior.\n2. Você terá um calendário mensal interativo com todos os seus atendimentos.\n3. Clique em uma data para ver os detalhes completos, falar com o local via WhatsApp ou cancelar reservas com antecedência.`
  }

  if (lower.includes('schedlab') || lower.includes('3d') || lower.includes('cabelo') || lower.includes('laboratório')) {
    return `O **SchedLab** é o nosso laboratório 3D interativo de análise e cuidados capilares! Você pode explorá-lo a qualquer momento clicando no botão **SchedLab 3D** no menu superior.`
  }

  if (lower.includes('cadastrar') || lower.includes('negócio') || lower.includes('painel') || lower.includes('empresa') || lower.includes('proprietário')) {
    return `Para cadastrar seu estabelecimento ou gerenciar horários e serviços, acesse **Meus Negócios** no menu superior para abrir o Painel de Gestão.`
  }

  if (lower.includes('perfil') || lower.includes('foto') || lower.includes('sair') || lower.includes('logout') || lower.includes('conta')) {
    return `Para gerenciar seus dados ou sair da conta, clique em **Perfil** no canto superior direito do menu. Lá você pode trocar sua foto de perfil ou encerrar a sessão pelo botão **Sair da conta**.`
  }

  return `Posso te orientar a navegar pela plataforma, encontrar estabelecimentos no Hub, gerenciar seus agendamentos ou explorar o SchedLab 3D. Em que posso te ajudar?`
}

serve(async (req) => {
  // Trata requisições OPTIONS (CORS preflight)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let cleanMessage = 'Olá'
  let contextPayload: BusinessContext = {}

  try {
    const body = await req.json()
    const { message, history = [], context = {} } = body
    contextPayload = context

    if (!message || typeof message !== 'string' || !message.trim()) {
      return new Response(JSON.stringify({ error: 'Mensagem inválida ou vazia.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    cleanMessage = message.trim().slice(0, 500)
    const validHistory: IncomingMessage[] = Array.isArray(history)
      ? history.slice(-6).filter((h: any) => h && typeof h.text === 'string' && (h.sender === 'user' || h.sender === 'assistant'))
      : []

    // Obtém e sanitiza a chave do Google Gemini armazenada nos Secrets do Supabase
    const geminiApiKey = (Deno.env.get('GEMINI_API_KEY') || '').trim()

    // Se houver chave configurada, tenta invocar o Gemini com múltiplos modelos candidatos em cascata
    if (geminiApiKey) {
      const systemInstruction = buildSystemInstruction(contextPayload)
      const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = []

      for (const h of validHistory) {
        contents.push({
          role: h.sender === 'user' ? 'user' : 'model',
          parts: [{ text: h.text.slice(0, 400) }],
        })
      }

      contents.push({
        role: 'user',
        parts: [{ text: cleanMessage }],
      })

      const geminiPayload = {
        systemInstruction: {
          parts: [{ text: systemInstruction }],
        },
        contents,
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 500,
          topP: 0.9,
        },
      }

      // Lista de modelos suportados para tentar em sequência
      const candidateModels = [
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-1.5-flash',
        'gemini-1.5-flash-latest',
        'gemini-1.5-pro',
      ]

      for (const model of candidateModels) {
        try {
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`
          const geminiResponse = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiPayload),
          })

          if (geminiResponse.ok) {
            const geminiData = await geminiResponse.json()
            const rawReply = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
            if (rawReply) {
              return new Response(
                JSON.stringify({
                  ok: true,
                  reply: rawReply,
                  model: model,
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              )
            }
          } else {
            const errText = await geminiResponse.text()
            console.warn(`Tentativa Gemini com ${model} retornou ${geminiResponse.status}:`, errText)
          }
        } catch (err) {
          console.warn(`Erro de rede ao conectar com modelo ${model}:`, err)
        }
      }
    }

    // Se a chave não existir ou se as chamadas de IA falharem por 404/quota/rede,
    // o motor inteligente estruturado responde imediatamente com qualidade total
    const smartReply = buildRuleBasedResponse(cleanMessage, contextPayload)
    return new Response(
      JSON.stringify({
        ok: true,
        reply: smartReply,
        model: 'schedia-assist-smart-engine',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: unknown) {
    console.error('Exceção capturada no schedia-assist:', err)
    const smartReply = buildRuleBasedResponse(cleanMessage, contextPayload)
    return new Response(
      JSON.stringify({
        ok: true,
        reply: smartReply,
        model: 'schedia-assist-contingency-engine',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
