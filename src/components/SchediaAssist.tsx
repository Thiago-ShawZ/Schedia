import { useState, useRef, useEffect, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { SparklesIcon, SendIcon } from './Icons'

export type SchediaAssistProps = {
  biz: {
    id: string
    name: string
    description?: string | null
    city?: string | null
    phone?: string | null
    slug?: string
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
  } | null
  currentService?: {
    name: string
    price_cents: number
    duration_min: number
  } | null
  bookingStep?: number
  bookingWhen?: string
}

interface ChatMessage {
  id: string
  sender: 'user' | 'assistant'
  text: string
  isError?: boolean
}

export default function SchediaAssist({
  biz,
  services = [],
  products = [],
  settings = null,
  currentService = null,
  bookingStep,
  bookingWhen,
}: SchediaAssistProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Mensagem inicial de boas-vindas personalizada
  const initialGreeting = useMemoGreeting(biz.name, currentService?.name)

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: initialGreeting,
    },
  ])

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

  // Sugestões de perguntas frequentes
  const suggestions = [
    'Quais serviços vocês oferecem?',
    currentService ? `Como é feito o serviço ${currentService.name}?` : 'Qual a duração média dos serviços?',
    'Como funciona o cancelamento ou reagendamento?',
    'Qual o horário de atendimento?',
  ]

  async function handleSend(textToSend?: string) {
    const query = (textToSend || input).trim()
    if (!query || loading) return

    const userMsgId = crypto.randomUUID()
    const newHistory = [...messages, { id: userMsgId, sender: 'user' as const, text: query }]
    setMessages(newHistory)
    setInput('')
    setLoading(true)

    // Prepara o contexto sanitizado para enviar à Edge Function
    const contextPayload = {
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

    try {
      // Histórico recente para continuidade de diálogo (máx 5 anteriores)
      const chatHistory = newHistory.slice(-5).map(m => ({
        sender: m.sender,
        text: m.text,
      }))

      const { data, error } = await supabase.functions.invoke('schedia-assist', {
        body: {
          message: query,
          history: chatHistory,
          context: contextPayload,
        },
      })

      if (error) {
        throw error
      }

      const botReply = data?.reply || 'Não consegui obter uma resposta no momento. Por favor, tente novamente.'

      setMessages(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          sender: 'assistant',
          text: botReply,
        },
      ])
    } catch {
      setMessages(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          sender: 'assistant',
          text: 'Tivemos uma instabilidade momentânea na conexão com o assistente. Por favor, tente novamente em instantes.',
          isError: true,
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
      {/* Botão Flutuante (Launcher) */}
      <div className="schedia-assist-launcher-wrap">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`schedia-assist-launcher${isOpen ? ' active' : ''}`}
          aria-expanded={isOpen}
          aria-label={isOpen ? 'Fechar Schedia Assist' : 'Abrir assistente virtual Schedia Assist'}
          title="Tirar dúvidas com o Schedia Assist"
        >
          <div className="schedia-assist-launcher-icon">
            <SparklesIcon size={20} />
          </div>
          <span className="schedia-assist-launcher-text">
            {isOpen ? 'Fechar Assistente' : 'Schedia Assist'}
          </span>
          <span className="schedia-assist-badge-ia">IA</span>
        </button>
      </div>

      {/* Janela de Conversa Suspensa (Chat Window) */}
      {isOpen && (
        <div
          className="schedia-assist-window"
          role="dialog"
          aria-modal="false"
          aria-label="Janela de conversa do Schedia Assist"
        >
          {/* Header da Janela */}
          <div className="schedia-assist-header">
            <div className="schedia-assist-header-info">
              <div className="schedia-assist-header-avatar">
                <SparklesIcon size={16} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
                  <strong style={{ fontSize: '.95rem', color: '#ffffff' }}>Schedia Assist</strong>
                  <span className="schedia-assist-tag">IA Oficial</span>
                </div>
                <small style={{ color: 'rgba(255, 255, 255, 0.75)', fontSize: '.75rem', display: 'block' }}>
                  {biz.name}
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
                      <SparklesIcon size={12} />
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
                  <SparklesIcon size={12} />
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
                placeholder="Tire sua dúvida sobre serviços, horários..."
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
              Schedia Assist • Respostas com base nos dados oficiais de {biz.name}.
            </div>
          </form>
        </div>
      )}
    </>
  )
}

function useMemoGreeting(bizName: string, serviceName?: string | null): string {
  if (serviceName) {
    return `Olá! Sou o **Schedia Assist** do **${bizName}**.\n\nVi que você está interessado em **${serviceName}**. Posso te explicar sobre o procedimento, cuidados, tempo estimado ou valores. Como posso te ajudar?`
  }
  return `Olá! Sou o **Schedia Assist**, assistente virtual de inteligência artificial do **${bizName}**.\n\nPosso te ajudar a escolher o melhor serviço, esclarecer valores, horários e regras de agendamento. Como posso te ajudar hoje?`
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
