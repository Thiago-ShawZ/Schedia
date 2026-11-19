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
}

// Formatador de BRL simples para a montagem do prompt
function formatBrl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Monta o prompt do sistema com base estrita nos dados do estabelecimento
function buildSystemInstruction(ctx: BusinessContext): string {
  const biz = ctx.business || {}
  const svcs = ctx.services || []
  const prods = ctx.products || []
  const cfg = ctx.settings || {}
  const current = ctx.currentBooking

  let instruction = `Você é o Schedia Assist, o assistente virtual de inteligência artificial oficial de atendimento do estabelecimento "${biz.name || 'Estabelecimento Parceiro Schedia'}".

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

  try {
    const body = await req.json()
    const { message, history = [], context = {} } = body

    if (!message || typeof message !== 'string' || !message.trim()) {
      return new Response(JSON.stringify({ error: 'Mensagem inválida ou vazia.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Sanitização e limitação de tamanho para proteção contra abusos
    const cleanMessage = message.trim().slice(0, 500)
    const validHistory: IncomingMessage[] = Array.isArray(history)
      ? history.slice(-6).filter((h: any) => h && typeof h.text === 'string' && (h.sender === 'user' || h.sender === 'assistant'))
      : []

    // Obtém a chave do Google Gemini armazenada nos Secrets do Supabase
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY') || ''

    // Se a chave não estiver configurada no Supabase Secrets, gera resposta segura baseada no catálogo do negócio
    if (!geminiApiKey) {
      const bizName = context?.business?.name || 'nosso estabelecimento'
      const svcs = context?.services || []

      // Resposta inteligente de fallback local enquanto a chave não for inserida
      let fallbackReply = `Olá! Sou o assistente virtual do **${bizName}**.\n\n`
      const lower = cleanMessage.toLowerCase()

      if (lower.includes('preço') || lower.includes('valor') || lower.includes('quanto custa') || lower.includes('serviço')) {
        if (svcs.length > 0) {
          fallbackReply += `Aqui estão os serviços disponíveis no catálogo:\n\n`
          fallbackReply += svcs.slice(0, 5).map((s: any) => `• **${s.name}**: ${formatBrl(s.price_cents)} (${s.duration_min} min)`).join('\n')
          fallbackReply += `\n\nPara agendar qualquer um deles, basta fechar o chat e clicar em **Agendar**!`
        } else {
          fallbackReply += `No momento não há serviços disponíveis para exibição direta. Entre em contato com a equipe.`
        }
      } else if (lower.includes('horário') || lower.includes('funcionamento') || lower.includes('aberto')) {
        fallbackReply += `Você pode conferir os horários disponíveis em tempo real clicando no botão **Agendar** de qualquer serviço!`
      } else if (lower.includes('cancelar') || lower.includes('reagendar')) {
        const cancelH = context?.settings?.min_cancel_hours || 24
        fallbackReply += `Você pode reagendar ou cancelar seus agendamentos diretamente na página **Meus Agendamentos** com até ${cancelH}h de antecedência.`
      } else {
        fallbackReply += `Posso te ajudar com dúvidas sobre os serviços, valores e horários de **${bizName}**. Como posso ajudar você hoje?`
      }

      return new Response(
        JSON.stringify({
          ok: true,
          reply: fallbackReply,
          model: 'schedia-assist-fallback',
          note: 'Configure GEMINI_API_KEY nos secrets do Supabase para ativar o modelo de linguagem completo.',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Modelo prioritário: Google Gemini 1.5 Flash (alta velocidade, qualidade e cota gratuita no Google AI Studio)
    const systemInstruction = buildSystemInstruction(context)

    // Formata o histórico no padrão Gemini (user e model)
    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = []

    for (const h of validHistory) {
      contents.push({
        role: h.sender === 'user' ? 'user' : 'model',
        parts: [{ text: h.text.slice(0, 400) }],
      })
    }

    // Adiciona a mensagem atual do usuário
    contents.push({
      role: 'user',
      parts: [{ text: cleanMessage }],
    })

    const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`

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

    const geminiResponse = await fetch(geminiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(geminiPayload),
    })

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text()
      console.error('Erro na chamada ao Gemini API:', geminiResponse.status, errText)

      // Se quota excedida (429) ou outro erro
      if (geminiResponse.status === 429) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: 'RATE_LIMIT',
            reply: 'O assistente está com muitas solicitações no momento. Por favor, aguarde alguns instantes e tente novamente.',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      throw new Error(`Gemini API error: ${geminiResponse.status}`)
    }

    const geminiData = await geminiResponse.json()
    const rawReply =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
      'Desculpe, não consegui processar a resposta agora. Pode repetir a pergunta?'

    return new Response(
      JSON.stringify({
        ok: true,
        reply: rawReply,
        model: 'gemini-1.5-flash',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (err: unknown) {
    console.error('Erro interno no schedia-assist:', err)
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'INTERNAL_ERROR',
        reply: 'Tivemos uma instabilidade momentânea no assistente. Por favor, tente novamente em instantes.',
        details: msg,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
