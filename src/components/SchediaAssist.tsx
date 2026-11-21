import { useState, useRef, useEffect, useMemo, type FormEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { MessageCircleIcon, SendIcon } from './Icons'
import {
  useSchediaAssist,
  type SchediaAssistBizData,
  type SchediaAssistServiceData,
  type SchediaAssistProductData,
  type SchediaAssistSettingsData,
  type SchediaAssistBookingData,
} from '../context/SchediaAssistContext'

export type SchediaAssistProps = {
  biz?: SchediaAssistBizData | null
  services?: SchediaAssistServiceData[]
  products?: SchediaAssistProductData[]
  settings?: SchediaAssistSettingsData | null
  currentService?: SchediaAssistBookingData | null
  bookingStep?: number
  bookingWhen?: string
}

interface ChatMessage {
  id: string
  sender: 'user' | 'assistant'
  text: string
  isError?: boolean
}

export default function SchediaAssist(props: SchediaAssistProps) {
  const context = useSchediaAssist()
  const location = useLocation()

  // Prioriza props diretas se fornecidas, caso contrário utiliza o contexto global
  const biz = props.biz !== undefined ? props.biz : context.biz
  const services = props.services !== undefined ? props.services : context.services
  const products = props.products !== undefined ? props.products : context.products
  const settings = props.settings !== undefined ? props.settings : context.settings
  const currentService = props.currentService !== undefined ? props.currentService : context.currentService
  const bookingStep = props.bookingStep !== undefined ? props.bookingStep : context.bookingStep
  const bookingWhen = props.bookingWhen !== undefined ? props.bookingWhen : context.bookingWhen

  // Determina se estamos no modo Estabelecimento ou no modo Plataforma Geral
  const isBusinessMode = Boolean(biz?.name)

  const [isOpen, setIsOpen] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Mensagem inicial de boas-vindas adequada ao modo
  const initialGreeting = useMemo(() => {
    if (isBusinessMode && biz) {
      if (currentService?.name) {
        return `Olá! Seja bem-vindo ao **${biz.name}**.\n\nVi que você está interessado em **${currentService.name}**. Posso te ajudar com detalhes do procedimento, duração ou valores. Como posso te orientar?`
      }
      return `Olá! Seja bem-vindo ao **${biz.name}**.\n\nPosso te ajudar a esclarecer serviços, valores, regras de agendamento e informações sobre o atendimento. Como posso te ajudar hoje?`
    }
    return `Olá! Seja bem-vindo à central de atendimento do Schedia.\n\nPosso te ajudar a encontrar estabelecimentos no Hub, entender como funcionam os agendamentos ou gerenciar sua conta. Como posso te ajudar?`
  }, [isBusinessMode, biz?.name, currentService?.name])

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: initialGreeting,
    },
  ])

  // Se o contexto mudar de negócio ou para a plataforma (e não houver histórico de conversa do usuário), atualiza a saudação
  useEffect(() => {
    setMessages(prev => {
      const hasUserMsg = prev.some(m => m.sender === 'user')
      if (!hasUserMsg) {
        return [{ id: 'welcome', sender: 'assistant', text: initialGreeting }]
      }
      return prev
    })
  }, [initialGreeting])

  // Rola para a mensagem mais recente ao atualizar
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, loading, isOpen])

  // Foca no campo ao abrir
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150)
    }
  }, [isOpen])

  // Sugestões de perguntas frequentes baseadas no modo
  const suggestions = useMemo(() => {
    if (isBusinessMode) {
      return [
        'Quais serviços vocês oferecem?',
        currentService ? `Como é feito o serviço ${currentService.name}?` : 'Qual a duração média dos serviços?',
        'Como funciona o cancelamento ou reagendamento?',
        'Qual o horário de atendimento?',
      ]
    }
    return [
      'Como encontrar estabelecimentos no Hub?',
      'Como funcionam os agendamentos e cancelamentos?',
      'O que é o laboratório SchedLab 3D?',
      'Como cadastrar meu negócio no Schedia?',
    ]
  }, [isBusinessMode, currentService])

  async function handleSend(textToSend?: string) {
    const query = (textToSend || input).trim()
    if (!query || loading) return

    const userMsgId = crypto.randomUUID()
    const newHistory = [...messages, { id: userMsgId, sender: 'user' as const, text: query }]
    setMessages(newHistory)
    setInput('')
    setLoading(true)

    // Prepara o contexto sanitizado para enviar à Edge Function
    const contextPayload = isBusinessMode && biz
      ? {
          business: {
            id: biz.id,
            name: biz.name,
            description: biz.description || null,
            city: biz.city || null,
            phone: biz.phone || null,
          },
          services: services.map(s => ({
            name: s.name,
            description: s.description || null,
            price_cents: s.price_cents,
            duration_min: s.duration_min,
          })),
          products: products.map(p => ({
            name: p.name,
            description: p.description || null,
            price_cents: p.price_cents,
          })),
          settings: settings
            ? {
                timezone: settings.timezone,
                opening_hours: settings.opening_hours,
                min_cancel_hours: settings.min_cancel_hours,
              }
            : undefined,
          currentBooking: currentService
            ? {
                serviceName: currentService.name,
                priceCents: currentService.price_cents,
                durationMin: currentService.duration_min,
                step: bookingStep,
                when: bookingWhen,
              }
            : undefined,
        }
      : {
          platformRoute: location.pathname,
        }

    try {
      // Histórico recente para continuidade de diálogo (máx 5 anteriores)
      const chatHistory = newHistory.slice(-5).map(m => ({
        sender: m.sender,
        text: m.text,
      }))

      let botReply = ''

      try {
        const { data, error } = await supabase.functions.invoke('schedia-assist', {
          body: {
            message: query,
            history: chatHistory,
            context: contextPayload,
          },
        })

        // Se a Edge Function responder com sucesso e conteúdo válido
        if (!error && data?.ok && data?.reply && !data?.reply.includes('instabilidade momentânea')) {
          botReply = data.reply
        } else if (!error && data?.reply && !data?.error && !data?.details?.includes('error')) {
          botReply = data.reply
        } else {
          // Contingência inteligente instantânea no cliente
          botReply = getLocalSmartResponse(query, biz, services, products, settings, currentService)
        }
      } catch (invokeErr) {
        console.warn('Conexão externa do Schedia Assist indisponível, usando motor inteligente local:', invokeErr)
        botReply = getLocalSmartResponse(query, biz, services, products, settings, currentService)
      }

      setMessages(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          sender: 'assistant',
          text: botReply,
        },
      ])
    } catch {
      // Garantia absoluta de resposta: se qualquer falha inesperada ocorrer
      const fallbackReply = getLocalSmartResponse(query, biz, services, products, settings, currentService)
      setMessages(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          sender: 'assistant',
          text: fallbackReply,
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    handleSend()
  }

  function handleRetry() {
    const lastUserMsg = [...messages].reverse().find(m => m.sender === 'user')
    if (lastUserMsg) {
      handleSend(lastUserMsg.text)
    }
  }

  return (
    <>
      {/* Botão Flutuante Fixo no Canto Inferior (Launcher) */}
      <div className="schedia-assist-launcher-wrap">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`schedia-assist-launcher${isOpen ? ' active' : ''}`}
          aria-expanded={isOpen}
          aria-label={isOpen ? 'Fechar atendimento' : 'Abrir central de atendimento'}
          title="Dúvidas e Atendimento"
        >
          <div className="schedia-assist-launcher-icon">
            <MessageCircleIcon size={19} />
          </div>
          <span className="schedia-assist-launcher-text">
            {isOpen ? 'Fechar' : 'Ajuda'}
          </span>
        </button>
      </div>

      {/* Janela de Conversa Suspensa Fixa (Chat Window) */}
      {isOpen && (
        <div
          className="schedia-assist-window"
          role="dialog"
          aria-modal="false"
          aria-label="Janela de atendimento"
        >
          {/* Header da Janela */}
          <div className="schedia-assist-header">
            <div className="schedia-assist-header-info">
              <div className="schedia-assist-header-avatar">
                <MessageCircleIcon size={17} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.45rem' }}>
                  <strong style={{ fontSize: '.92rem', color: '#ffffff' }}>
                    {isBusinessMode && biz ? biz.name : 'Atendimento Schedia'}
                  </strong>
                  <span className="schedia-assist-tag">
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                    Online
                  </span>
                </div>
                <small style={{ color: 'rgba(255, 255, 255, 0.75)', fontSize: '.74rem', display: 'block' }}>
                  {isBusinessMode ? 'Atendimento ao cliente' : 'Dúvidas e suporte'}
                </small>
              </div>
            </div>

            <button
              type="button"
              className="schedia-assist-close-btn"
              onClick={() => setIsOpen(false)}
              aria-label="Fechar conversa"
              title="Fechar"
            >
              ✕
            </button>
          </div>

          {/* Banner de Contexto se houver serviço selecionado na reserva */}
          {currentService && (
            <div className="schedia-assist-context-bar">
              <span style={{ fontSize: '.76rem', color: 'var(--primary)' }}>
                Tirando dúvidas sobre: <strong>{currentService.name}</strong>
              </span>
            </div>
          )}

          {/* Lista de Mensagens */}
          <div className="schedia-assist-messages">
            {messages.map(m => {
              const isUser = m.sender === 'user'

              return (
                <div
                  key={m.id}
                  className={`schedia-assist-msg-row ${isUser ? 'user-row' : 'bot-row'}`}
                >
                  {!isUser && (
                    <div className="schedia-assist-msg-avatar">
                      <MessageCircleIcon size={12} />
                    </div>
                  )}

                  <div className={`schedia-assist-bubble ${isUser ? 'user-bubble' : 'bot-bubble'}${m.isError ? ' error-bubble' : ''}`}>
                    <div className="schedia-assist-text">
                      {renderFormattedMessage(m.text)}
                    </div>

                    {m.isError && (
                      <button
                        type="button"
                        className="schedia-assist-retry-btn"
                        onClick={handleRetry}
                      >
                        Tentar novamente
                      </button>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Indicador de Digitação */}
            {loading && (
              <div className="schedia-assist-msg-row bot-row">
                <div className="schedia-assist-msg-avatar">
                  <MessageCircleIcon size={12} />
                </div>
                <div className="schedia-assist-bubble bot-bubble typing-bubble">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span style={{ fontSize: '.78rem', color: 'var(--muted)', marginLeft: '.35rem' }}>
                    Consultando informações...
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Sugestões de Perguntas Rápidas */}
          {messages.length <= 3 && !loading && (
            <div className="schedia-assist-suggestions">
              {suggestions.map((s, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="schedia-assist-chip"
                  onClick={() => handleSend(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Rodapé / Input de Envio */}
          <form className="schedia-assist-footer" onSubmit={handleSubmit}>
            <div className="schedia-assist-input-wrap">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={
                  isBusinessMode
                    ? 'Tire sua dúvida sobre serviços, horários...'
                    : 'Pergunte sobre agendamentos, o Hub, SchedLab...'
                }
                disabled={loading}
                className="schedia-assist-input"
                maxLength={400}
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="schedia-assist-send-btn"
                aria-label="Enviar mensagem"
                title="Enviar"
              >
                <SendIcon size={15} />
              </button>
            </div>
            <div className="schedia-assist-disclaimer">
              {isBusinessMode && biz
                ? `Atendimento oficial de ${biz.name}`
                : 'Central de ajuda e suporte Schedia'}
            </div>
          </form>
        </div>
      )}
    </>
  )
}

// Renderiza formatação simples de texto (negrito com ** e quebras de linha)
function renderFormattedMessage(text: string) {
  const lines = text.split('\n')
  return lines.map((line, lIdx) => {
    // Processa **negrito**
    const parts = line.split(/(\*\*.*?\*\*)/g)
    return (
      <span key={lIdx} style={{ display: 'block', minHeight: line.trim() === '' ? '0.5rem' : 'auto' }}>
        {parts.map((p, pIdx) => {
          if (p.startsWith('**') && p.endsWith('**')) {
            return <strong key={pIdx}>{p.slice(2, -2)}</strong>
          }
          return p
        })}
      </span>
    )
  })
}

// Motor inteligente estruturado de contingência local para resposta instantânea
function getLocalSmartResponse(
  query: string,
  biz: SchediaAssistBizData | null,
  services: SchediaAssistServiceData[],
  products: SchediaAssistProductData[],
  settings: SchediaAssistSettingsData | null,
  currentService: SchediaAssistBookingData | null
): string {
  const q = (query || '').toLowerCase().trim()

  // 1. MODO ESTABELECIMENTO
  if (biz?.name) {
    const bizName = biz.name

    // Saudações
    if (/^(ol[aá]|oi|oie|bom dia|boa tarde|boa noite|e a[ií]|tudo bem|sauda[çc][oõ]es)/i.test(q)) {
      if (currentService?.name) {
        return `Olá! Seja bem-vindo ao **${bizName}**.\n\nVi que você tem interesse em **${currentService.name}**. Posso te explicar sobre valores, duração ou cuidados pré e pós-procedimento. Como posso ajudar?`
      }
      return `Olá! Seja bem-vindo ao atendimento do **${bizName}**!\n\nPosso te ajudar a conhecer nossos serviços, conferir valores e durações, entender as regras de agendamento ou tirar dúvidas sobre o atendimento. Como posso te ajudar hoje?`
    }

    // Consulta de preços ou catálogo de serviços
    if (q.includes('preço') || q.includes('valor') || q.includes('quanto custa') || q.includes('serviço') || q.includes('catálogo') || q.includes('tabela')) {
      if (services.length > 0) {
        const list = services
          .slice(0, 6)
          .map(s => `• **${s.name}**: ${(s.price_cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (${s.duration_min} min)${s.description ? ` — ${s.description}` : ''}`)
          .join('\n')

        return `Aqui estão os principais serviços disponíveis em **${bizName}**:\n\n${list}\n\nPara agendar qualquer um deles, basta fechar o chat e clicar no botão **Agendar** correspondente!`
      }
      return `No momento não há serviços com valores listados diretamente no catálogo. Para agendar ou consultar disponibilidade, fale com a equipe do estabelecimento.`
    }

    // Pergunta sobre serviço específico
    const matchedService = services.find(s => q.includes(s.name.toLowerCase()))
    if (matchedService) {
      const priceStr = (matchedService.price_cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      return `O serviço **${matchedService.name}** tem valor de **${priceStr}** e duração estimada de **${matchedService.duration_min} minutos**.\n\n${matchedService.description ? `*Descrição:* ${matchedService.description}\n\n` : ''}Para reservar seu horário, basta clicar no botão **Agendar** desse serviço na página!`
    }

    // Cancelamento / reagendamento
    if (q.includes('cancelar') || q.includes('reagendar') || q.includes('desmarcar') || q.includes('remarcar')) {
      const minHours = settings?.min_cancel_hours || 24
      return `Você pode cancelar ou reagendar seus atendimentos diretamente pela aba **Agendamentos** no menu superior.\n\n**Atenção:** Em **${bizName}**, os cancelamentos ou alterações devem ser feitos com no mínimo **${minHours} horas de antecedência**.`
    }

    // Horários / funcionamento
    if (q.includes('horário') || q.includes('funcionamento') || q.includes('abre') || q.includes('fecha') || q.includes('aberto') || q.includes('dias')) {
      return `Os horários e dias de atendimento do **${bizName}** podem ser consultados em tempo real na tela de agendamento: basta clicar em **Agendar** em qualquer serviço para visualizar as datas e horários livres no calendário!`
    }

    // Produtos
    if (q.includes('produto') || q.includes('venda') || q.includes('comprar')) {
      if (products.length > 0) {
        const pList = products
          .slice(0, 5)
          .map(p => `• **${p.name}**: ${(p.price_cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`)
          .join('\n')
        return `Produtos disponíveis para compra no local:\n\n${pList}`
      }
      return `Não há produtos cadastrados para venda no momento.`
    }

    // Como agendar
    if (q.includes('como agendar') || q.includes('quero agendar') || q.includes('marcar') || q.includes('reserva')) {
      return `Para realizar seu agendamento em **${bizName}**:\n1. Escolha o serviço desejado na lista da página.\n2. Clique no botão **Agendar**.\n3. Selecione a melhor data e horário disponíveis.\n4. Confirme seus dados e pronto! Sua reserva estará garantida.`
    }

    // Contato
    if (q.includes('telefone') || q.includes('contato') || q.includes('whatsapp') || q.includes('zap') || q.includes('endereço') || q.includes('onde')) {
      let resp = `Informações de contato e localização de **${bizName}**:\n`
      if (biz.city) resp += `• **Localização:** ${biz.city}\n`
      if (biz.phone) resp += `• **Contato:** ${biz.phone}\n`
      if (biz.description) resp += `• **Sobre:** ${biz.description}\n`
      return resp
    }

    // Resposta padrão no modo estabelecimento
    return `Estou à disposição para tirar qualquer dúvida sobre **${bizName}**! Você pode me perguntar sobre preços, duração dos procedimentos, horários, como agendar ou políticas de cancelamento.`
  }

  // 2. MODO PLATAFORMA GERAL (Hub, Meus Agendamentos, Perfil, etc.)

  // Saudações gerais
  if (/^(ol[aá]|oi|oie|bom dia|boa tarde|boa noite|e a[ií]|tudo bem|sauda[çc][oõ]es)/i.test(q)) {
    return `Olá! Sou o **Schedia Assist**, o assistente virtual oficial da plataforma Schedia.\n\nPosso te orientar sobre:\n• Como encontrar estabelecimentos e serviços no **Hub**\n• Como consultar ou cancelar seus **Agendamentos**\n• Como explorar o laboratório **SchedLab 3D**\n• Como cadastrar e gerenciar seu negócio\n\nComo posso te ajudar hoje?`
  }

  // Hub / Descobrir
  if (q.includes('hub') || q.includes('descobrir') || q.includes('encontrar') || q.includes('buscar') || q.includes('estabelecimentos') || q.includes('salão') || q.includes('barbearia')) {
    return `Para encontrar estabelecimentos no Schedia:\n1. Acesse **Descobrir** no menu superior.\n2. Você pode filtrar por categoria (Barbearia, Cabelo, Estética e pele, Maquiagem, Unhas) ou pesquisar por nome.\n3. Clique no estabelecimento desejado para ver os serviços e agendar seu horário online em poucos segundos!`
  }

  // Agendamentos / Cancelamentos
  if (q.includes('agendamento') || q.includes('cancelar') || q.includes('reagendar') || q.includes('minhas reservas') || q.includes('histórico') || q.includes('marcado') || q.includes('calendário')) {
    return `Para visualizar ou gerenciar suas reservas:\n1. Clique em **Agendamentos** no menu superior.\n2. Você verá um calendário mensal interativo com todos os seus atendimentos futuros e anteriores.\n3. Clicando em qualquer dia com agendamento, abre-se uma tela suspensa com todos os detalhes (horário, serviço, profissional, valor e botão para falar diretamente com o local via WhatsApp).\n4. Se precisar cancelar, use a opção correspondente respeitando o prazo mínimo do estabelecimento.`
  }

  // SchedLab 3D
  if (q.includes('schedlab') || q.includes('3d') || q.includes('laboratório') || q.includes('cabelo')) {
    return `O **SchedLab** é o nosso laboratório 3D inovador de simulação e cuidados capilares!\n\nVocê pode acessá-lo a qualquer momento clicando no botão **SchedLab 3D** no menu superior. Lá você experimenta uma visão tridimensional interativa de tratamentos e cuidados.`
  }

  // Cadastrar negócio / Painel
  if (q.includes('cadastrar') || q.includes('meu negócio') || q.includes('painel') || q.includes('empresa') || q.includes('proprietário') || q.includes('dono')) {
    return `Se você é proprietário de um salão, barbearia ou clínica:\n1. Clique em **Meus Negócios** no menu superior.\n2. Escolha **Cadastrar novo negócio** se ainda não tiver um cadastrado.\n3. Após a aprovação, você terá acesso ao Painel de Gestão completo com controle de agenda, catálogo de serviços, produtos e bloqueios de expediente.`
  }

  // Perfil / Conta
  if (q.includes('perfil') || q.includes('foto') || q.includes('sair') || q.includes('logout') || q.includes('conta')) {
    return `Para gerenciar seus dados ou encerrar a sessão:\n• Acesse **Perfil** no canto superior direito do menu.\n• Lá você pode alterar sua foto de perfil, verificar seu e-mail cadastrado ou clicar no botão **Sair da conta** para fazer logout com segurança.`
  }

  // Resposta padrão de plataforma
  return `Posso te orientar a utilizar todos os recursos do Schedia! Você pode me perguntar como agendar no Hub, como funciona o calendário de agendamentos, o que é o SchedLab 3D ou como cadastrar seu estabelecimento.`
}
