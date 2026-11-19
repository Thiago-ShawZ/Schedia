import { useState, useRef, useEffect, useMemo, type FormEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { SparklesIcon, SendIcon } from './Icons'
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
        return `Olá! Sou o **Schedia Assist** do **${biz.name}**.\n\nVi que você está interessado em **${currentService.name}**. Posso te explicar sobre o procedimento, cuidados, tempo estimado ou valores. Como posso te ajudar?`
      }
      return `Olá! Sou o **Schedia Assist**, assistente virtual inteligente do **${biz.name}**.\n\nPosso te ajudar a esclarecer serviços, valores, regras de agendamento e informações sobre o atendimento. Como posso te ajudar hoje?`
    }
    return `Olá! Sou o **Schedia Assist**, o assistente virtual inteligente da plataforma Schedia.\n\nPosso te ajudar a encontrar estabelecimentos no Hub, entender como funcionam os agendamentos, gerenciar sua conta ou conhecer o **SchedLab 3D**. Como posso te ajudar?`
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
      {/* Botão Flutuante Fixo no Canto Inferior (Launcher) */}
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

      {/* Janela de Conversa Suspensa Fixa (Chat Window) */}
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
                  <span className="schedia-assist-tag">
                    {isBusinessMode ? 'IA do Local' : 'IA Oficial'}
                  </span>
                </div>
                <small style={{ color: 'rgba(255, 255, 255, 0.75)', fontSize: '.75rem', display: 'block' }}>
                  {isBusinessMode && biz ? biz.name : 'Guia inteligente da plataforma'}
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
                ? `Schedia Assist • Respostas com base nos dados oficiais de ${biz.name}.`
                : 'Schedia Assist • Assistente oficial de navegação e suporte do Schedia.'}
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
