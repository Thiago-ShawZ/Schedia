import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { brl, buildWhatsAppLink } from '../lib/format'
import SlotPicker from '../components/SlotPicker'
import { msgErro } from '../components/Reserva'
import type { Hours, Slot } from '../lib/slots'
import {
  CalendarIcon,
  ClockIcon,
  BuildingIcon,
  DownloadIcon,
  WhatsAppIcon,
} from '../components/Icons'
import { buildGoogleCalendarUrl, downloadIcsFile } from '../lib/calendar'

type A = {
  id: string
  business_name: string
  business_slug: string
  business_id: string
  service_name: string
  starts_at: string
  status: string
  price_cents: number
  duration_min: number
  timezone: string
  opening_hours: Hours
  slot_step_min: number
  min_cancel_hours: number
}

export const STATUS_LABELS: Record<string, { label: string; badge: string; color: string }> = {
  confirmed: { label: 'Confirmado', badge: 'badge-ok', color: 'var(--ok)' },
  cancelled: { label: 'Cancelado', badge: 'badge-err', color: 'var(--err)' },
  completed: { label: 'Concluído', badge: 'badge-info', color: 'var(--info)' },
  no_show: { label: 'Não compareceu', badge: 'badge-warn', color: 'var(--warn)' },
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function formatDateToKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getApptDateKey(startsAt: string, timezone?: string): string {
  try {
    const d = new Date(startsAt)
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    return formatter.format(d)
  } catch {
    return startsAt.slice(0, 10)
  }
}

function getDaysForMonth(year: number, month: number) {
  const firstDay = new Date(year, month, 1)
  const firstDayOfWeek = firstDay.getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, month, 0).getDate()

  const days: {
    date: Date
    dateStr: string
    dayNum: number
    isCurrentMonth: boolean
  }[] = []

  // Dias do mês anterior para completar a primeira semana
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, daysInPrevMonth - i)
    days.push({
      date: d,
      dateStr: formatDateToKey(d),
      dayNum: daysInPrevMonth - i,
      isCurrentMonth: false,
    })
  }

  // Dias do mês atual
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(year, month, i)
    days.push({
      date: d,
      dateStr: formatDateToKey(d),
      dayNum: i,
      isCurrentMonth: true,
    })
  }

  // Dias do próximo mês para fechar a grade (múltiplo de 7)
  const remaining = (7 - (days.length % 7)) % 7
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(year, month + 1, i)
    days.push({
      date: d,
      dateStr: formatDateToKey(d),
      dayNum: i,
      isCurrentMonth: false,
    })
  }

  return days
}

export default function MeusAgendamentos() {
  const [items, setItems] = useState<A[] | null>(null)
  const [bizPhones, setBizPhones] = useState<Map<string, string | null>>(new Map())
  const [msg, setMsg] = useState('')
  const [resch, setResch] = useState<string | null>(null)
  const [slot, setSlot] = useState<Slot | null>(null)

  // Controle de Mês, Data Selecionada e Modal Suspenso
  const todayKey = useMemo(() => formatDateToKey(new Date()), [])
  const [viewDate, setViewDate] = useState<Date>(() => new Date())
  const [selectedDate, setSelectedDate] = useState<string>(todayKey)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [showAllList, setShowAllList] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_my_appointments')
    if (error) {
      setMsg('Não foi possível carregar seus agendamentos.')
      setItems([])
      return
    }

    const appts: A[] = data ?? []
    setItems(appts)

    // Busca telefones das empresas cadastradas para o botão de contato
    const bizIds = Array.from(new Set(appts.map(a => a.business_id)))
    if (bizIds.length > 0) {
      const { data: bData } = await supabase
        .from('businesses')
        .select('id, phone')
        .in('id', bizIds)
      if (bData) {
        const phoneMap = new Map<string, string | null>()
        bData.forEach(b => phoneMap.set(b.id, b.phone))
        setBizPhones(phoneMap)
      }
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Bloqueio de scroll ao abrir o modal suspenso
  useEffect(() => {
    if (isDetailsOpen) {
      document.body.style.overflow = 'hidden'
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setIsDetailsOpen(false)
      }
      window.addEventListener('keydown', onKey)
      return () => {
        document.body.style.overflow = ''
        window.removeEventListener('keydown', onKey)
      }
    } else {
      document.body.style.overflow = ''
    }
  }, [isDetailsOpen])

  // Agrupa os agendamentos por dia (chave YYYY-MM-DD)
  const apptsByDay = useMemo(() => {
    const map = new Map<string, A[]>()
    if (!items) return map
    for (const a of items) {
      const key = getApptDateKey(a.starts_at, a.timezone)
      const list = map.get(key) ?? []
      list.push(a)
      map.set(key, list)
    }
    return map
  }, [items])

  const editavel = (a: A) =>
    a.status === 'confirmed' &&
    Date.parse(a.starts_at) - Date.now() >= a.min_cancel_hours * 3600000

  async function cancelar(a: A) {
    if (!confirm(`Tem certeza que deseja cancelar o agendamento de "${a.service_name}"?`)) return
    const { error } = await supabase.rpc('cancel_appointment', { p_id: a.id })
    setMsg(error ? msgErro(error) : 'Agendamento cancelado com sucesso.')
    load()
  }

  async function reagendar() {
    if (!resch || !slot) return
    const { error } = await supabase.rpc('reschedule_appointment', {
      p_id: resch,
      p_start: new Date(slot.startMs).toISOString(),
    })
    if (error) return setMsg(msgErro(error))
    setMsg('Agendamento reagendado com sucesso.')
    setResch(null)
    setSlot(null)
    load()
  }

  // Navegação do Calendário
  const prevMonth = () => {
    setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
  }

  const nextMonth = () => {
    setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
  }

  const goToToday = () => {
    const now = new Date()
    setViewDate(new Date(now.getFullYear(), now.getMonth(), 1))
    setSelectedDate(todayKey)
  }

  const handleDayClick = (dateStr: string) => {
    setSelectedDate(dateStr)
    setResch(null)
    setSlot(null)
    setIsDetailsOpen(true)
  }

  const calendarDays = useMemo(() => {
    return getDaysForMonth(viewDate.getFullYear(), viewDate.getMonth())
  }, [viewDate])

  const monthLabel = useMemo(() => {
    return viewDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  }, [viewDate])

  // Agendamentos da data selecionada
  const selectedDayAppts = useMemo(() => {
    const list = apptsByDay.get(selectedDate) ?? []
    return [...list].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
  }, [apptsByDay, selectedDate])

  // Formatação amigável da data selecionada
  const selectedDateLabel = useMemo(() => {
    const [y, m, d] = selectedDate.split('-').map(Number)
    const dateObj = new Date(y, m - 1, d)
    const isToday = selectedDate === todayKey
    const formatted = dateObj.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    return isToday ? `Hoje, ${formatted}` : formatted
  }, [selectedDate, todayKey])

  const quando = (a: A) =>
    new Date(a.starts_at).toLocaleString('pt-BR', {
      timeZone: a.timezone,
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })

  const horaFormatada = (a: A) => {
    const start = new Date(a.starts_at).toLocaleTimeString('pt-BR', {
      timeZone: a.timezone,
      hour: '2-digit',
      minute: '2-digit',
    })
    const end = new Date(Date.parse(a.starts_at) + a.duration_min * 60000).toLocaleTimeString('pt-BR', {
      timeZone: a.timezone,
      hour: '2-digit',
      minute: '2-digit',
    })
    return `${start} às ${end}`
  }

  if (!items) {
    return (
      <div className="center" style={{ paddingTop: '4rem' }}>
        <div className="spinner" />
        <p style={{ marginTop: '.75rem', fontSize: '.88rem' }}>Carregando seus agendamentos...</p>
      </div>
    )
  }

  return (
    <main>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '.75rem' }}>
        <div>
          <h1 style={{ marginBottom: '.25rem' }}>Meus agendamentos</h1>
          <p style={{ color: 'var(--muted)', fontSize: '.92rem', margin: 0 }}>
            Clique em qualquer dia para ver os detalhes, entrar em contato ou gerenciar horários.
          </p>
        </div>

        <button
          type="button"
          className="btn ghost sm"
          onClick={() => setShowAllList(!showAllList)}
          style={{ fontSize: '.84rem' }}
        >
          {showAllList ? 'Ocultar histórico em lista' : 'Ver histórico completo em lista'}
        </button>
      </div>

      {msg && (
        <div role="status" className="msg" style={{ marginBottom: '1.25rem' }}>
          {msg}
        </div>
      )}

      {/* ─── CALENDÁRIO MENSAL INTEGRADO ─── */}
      <section className="calendar-card" aria-label="Calendário mensal de agendamentos">
        {/* Barra Superior de Navegação */}
        <div className="calendar-top-bar">
          <h2 className="calendar-month-title">
            <CalendarIcon size={20} style={{ color: 'var(--primary)' }} />
            <span>{monthLabel}</span>
          </h2>

          <div className="calendar-nav-controls">
            <button
              type="button"
              className="btn ghost sm"
              onClick={goToToday}
              style={{ padding: '.3rem .75rem', fontSize: '.78rem', marginRight: '.25rem' }}
              title="Ir para o mês atual e selecionar hoje"
            >
              Hoje
            </button>
            <button
              type="button"
              className="calendar-nav-btn"
              onClick={prevMonth}
              aria-label="Mês anterior"
              title="Mês anterior"
            >
              ◀
            </button>
            <button
              type="button"
              className="calendar-nav-btn"
              onClick={nextMonth}
              aria-label="Próximo mês"
              title="Próximo mês"
            >
              ▶
            </button>
          </div>
        </div>

        {/* Legenda de Status */}
        <div className="calendar-legend" aria-label="Legenda de status dos agendamentos">
          <span style={{ fontWeight: 700, color: 'var(--fg)', marginRight: '.25rem' }}>Status:</span>
          <span className="calendar-legend-item">
            <span className="calendar-dot confirmed" />
            <span>Confirmado</span>
          </span>
          <span className="calendar-legend-item">
            <span className="calendar-dot completed" />
            <span>Concluído</span>
          </span>
          <span className="calendar-legend-item">
            <span className="calendar-dot no_show" />
            <span>Não compareceu</span>
          </span>
          <span className="calendar-legend-item">
            <span className="calendar-dot cancelled" />
            <span>Cancelado</span>
          </span>
        </div>

        {/* Grade Semanal (Cabeçalho) */}
        <div className="calendar-grid" style={{ marginBottom: '4px' }}>
          {WEEKDAYS.map(w => (
            <div key={w} className="calendar-weekday">
              {w}
            </div>
          ))}
        </div>

        {/* Grade dos Dias */}
        <div className="calendar-grid">
          {calendarDays.map(item => {
            const isToday = item.dateStr === todayKey
            const isSelected = item.dateStr === selectedDate
            const dayAppts = apptsByDay.get(item.dateStr) ?? []
            const hasAppts = dayAppts.length > 0

            return (
              <div
                key={item.dateStr}
                role="button"
                tabIndex={0}
                onClick={() => handleDayClick(item.dateStr)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleDayClick(item.dateStr)
                  }
                }}
                className={`calendar-day-cell${!item.isCurrentMonth ? ' other-month' : ''}${
                  isToday ? ' today' : ''
                }${isSelected ? ' selected' : ''}${hasAppts ? ' has-appts' : ''}`}
                aria-label={`${item.dayNum} de ${monthLabel}, ${dayAppts.length} agendamento(s)`}
              >
                <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="calendar-day-num">{item.dayNum}</span>
                  {hasAppts && dayAppts.length > 1 && (
                    <span className="calendar-dot-more">+{dayAppts.length}</span>
                  )}
                </div>

                {/* Marcadores Coloridos */}
                {hasAppts && (
                  <div className="calendar-dots">
                    {dayAppts.slice(0, 3).map((a, idx) => (
                      <span
                        key={idx}
                        className={`calendar-dot ${a.status}`}
                        title={`${a.service_name} (${STATUS_LABELS[a.status]?.label || a.status})`}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* ─── TELA SUSPENSA (MODAL) COM OS DETALHES DO AGENDAMENTO ─── */}
      {isDetailsOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setIsDetailsOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`Detalhes de agendamentos em ${selectedDateLabel}`}
        >
          <div
            className="modal-dialog"
            onClick={e => e.stopPropagation()}
          >
            {/* Cabeçalho do Modal */}
            <div className="modal-header">
              <div>
                <h3 className="modal-title">
                  <CalendarIcon size={18} style={{ color: 'var(--primary)' }} />
                  <span>{selectedDateLabel}</span>
                </h3>
                <small style={{ color: 'var(--muted)', display: 'block', marginTop: '.2rem' }}>
                  {selectedDayAppts.length === 0
                    ? 'Nenhum compromisso agendado para esta data'
                    : `${selectedDayAppts.length} agendamento${selectedDayAppts.length > 1 ? 's' : ''} registrado${selectedDayAppts.length > 1 ? 's' : ''}`}
                </small>
              </div>

              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsDetailsOpen(false)}
                aria-label="Fechar detalhes"
                title="Fechar"
              >
                ✕
              </button>
            </div>

            {/* Conteúdo do Modal */}
            <div className="modal-body">
              {selectedDayAppts.length === 0 ? (
                <div className="center" style={{ padding: '2rem 1rem' }}>
                  <div
                    style={{
                      display: 'inline-flex',
                      padding: '.85rem',
                      background: 'var(--bg-sub)',
                      borderRadius: '50%',
                      color: 'var(--muted)',
                      marginBottom: '.5rem',
                    }}
                  >
                    <CalendarIcon size={28} />
                  </div>
                  <h4 style={{ color: 'var(--fg)', fontSize: '1rem', margin: '.25rem 0' }}>
                    Sem agendamentos neste dia
                  </h4>
                  <p style={{ maxWidth: '380px', margin: '.25rem auto 1.25rem', fontSize: '.86rem', color: 'var(--muted)' }}>
                    Você não possui horários marcados para esta data. Deseja agendar um novo serviço?
                  </p>
                  <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'center' }}>
                    <Link className="btn sm" to="/hub" onClick={() => setIsDetailsOpen(false)}>
                      Explorar negócios no Hub
                    </Link>
                    <button type="button" className="btn ghost sm" onClick={() => setIsDetailsOpen(false)}>
                      Fechar
                    </button>
                  </div>
                </div>
              ) : (
                selectedDayAppts.map(a => {
                  const st = STATUS_LABELS[a.status] ?? { label: a.status, badge: 'badge-muted' }
                  const isConfirmed = a.status === 'confirmed'
                  const isFuture = Date.parse(a.starts_at) > Date.now()
                  const phone = bizPhones.get(a.business_id)
                  const waLink = phone
                    ? buildWhatsAppLink(
                        phone,
                        `Olá! Gostaria de tirar uma dúvida sobre meu agendamento no Schedia: "${a.service_name}" em ${quando(a)}.`
                      )
                    : null

                  return (
                    <div
                      key={a.id}
                      className={`card ${a.status === 'cancelled' ? 'off' : ''}`}
                      style={{
                        padding: '1.25rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '.85rem',
                        background: 'var(--bg-sub)',
                        border: '1px solid var(--line)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          flexWrap: 'wrap',
                          gap: '.5rem',
                          width: '100%',
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.35rem' }}>
                            <span className={`badge ${st.badge}`}>{st.label}</span>
                            <span
                              style={{
                                fontSize: '.8rem',
                                color: 'var(--muted)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '.25rem',
                              }}
                            >
                              <ClockIcon size={12} />
                              {a.duration_min} min
                            </span>
                          </div>
                          <strong style={{ fontSize: '1.1rem' }}>{a.service_name}</strong>
                          <div style={{ marginTop: '.3rem' }}>
                            <Link
                              to={`/n/${a.business_slug}`}
                              onClick={() => setIsDetailsOpen(false)}
                              style={{
                                color: 'var(--primary)',
                                fontWeight: 600,
                                fontSize: '.88rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '.35rem',
                              }}
                            >
                              <BuildingIcon size={14} />
                              <span>{a.business_name}</span>
                            </Link>
                          </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--fg)' }}>
                            {brl(a.price_cents)}
                          </div>
                          <small style={{ color: 'var(--muted)', fontSize: '.76rem' }}>Preço do serviço</small>
                        </div>
                      </div>

                      {/* Faixa de Horário e Botão de Contato */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: '.5rem',
                          background: 'var(--card)',
                          padding: '.65rem .85rem',
                          borderRadius: 'var(--r-sm)',
                          fontSize: '.88rem',
                          color: 'var(--fg)',
                          border: '1px solid var(--line)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                          <ClockIcon size={15} style={{ color: 'var(--primary)' }} />
                          <span style={{ fontWeight: 700 }}>{horaFormatada(a)}</span>
                        </div>

                        {/* Botão de Contato com a Loja */}
                        {waLink ? (
                          <a
                            href={waLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn sm whatsapp"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem', padding: '.32rem .75rem' }}
                            title="Enviar mensagem no WhatsApp do estabelecimento"
                          >
                            <WhatsAppIcon size={14} />
                            <span>Entrar em contato</span>
                          </a>
                        ) : phone ? (
                          <a
                            href={`tel:${phone}`}
                            className="btn sm ghost"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem', padding: '.32rem .75rem' }}
                            title="Ligar para o estabelecimento"
                          >
                            <span>Ligar: {phone}</span>
                          </a>
                        ) : (
                          <Link
                            to={`/n/${a.business_slug}`}
                            onClick={() => setIsDetailsOpen(false)}
                            className="btn sm ghost"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem', padding: '.32rem .75rem' }}
                            title="Ver página da loja"
                          >
                            <BuildingIcon size={13} />
                            <span>Página da loja</span>
                          </Link>
                        )}
                      </div>

                      {/* Reschedule inline area */}
                      {resch === a.id && (
                        <div className="reserva" style={{ width: '100%', marginTop: '.5rem' }}>
                          <h4 style={{ marginTop: 0, textTransform: 'none', color: 'var(--fg)', fontSize: '.95rem' }}>
                            Selecione uma nova data e horário
                          </h4>
                          <SlotPicker
                            bizId={a.business_id}
                            durationMin={a.duration_min}
                            cfg={a}
                            excludeStartsAt={a.starts_at}
                            onPick={setSlot}
                          />
                          <div className="actions" style={{ marginTop: '1rem' }}>
                            <button className="btn sm" disabled={!slot} onClick={reagendar}>
                              Confirmar novo horário
                            </button>
                            <button
                              className="btn ghost sm"
                              onClick={() => {
                                setResch(null)
                                setSlot(null)
                              }}
                            >
                              Cancelar alteração
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Ações do Agendamento */}
                      <div
                        className="appt-actions"
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: '.75rem',
                          alignItems: 'center',
                          borderTop: '1px solid var(--line)',
                          paddingTop: '.75rem',
                          width: '100%',
                          flexWrap: 'wrap',
                        }}
                      >
                        {/* Ações de Calendário (Google Agenda e .ics) */}
                        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                          {isConfirmed && isFuture && (
                            <>
                              <a
                                href={buildGoogleCalendarUrl({
                                  id: a.id,
                                  serviceName: a.service_name,
                                  businessName: a.business_name,
                                  startsAt: a.starts_at,
                                  durationMin: a.duration_min,
                                  timezone: a.timezone,
                                })}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn ghost sm"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem' }}
                                title="Adicionar evento ao Google Agenda"
                              >
                                <CalendarIcon size={14} />
                                <span>Adicionar à agenda</span>
                              </a>
                              <button
                                type="button"
                                className="btn ghost sm"
                                onClick={() =>
                                  downloadIcsFile({
                                    id: a.id,
                                    serviceName: a.service_name,
                                    businessName: a.business_name,
                                    startsAt: a.starts_at,
                                    durationMin: a.duration_min,
                                    timezone: a.timezone,
                                  })
                                }
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem' }}
                                title="Baixar arquivo de calendário (.ics)"
                              >
                                <DownloadIcon size={14} />
                                <span>Baixar .ics</span>
                              </button>
                            </>
                          )}
                        </div>

                        {/* Ações de Gestão (Reagendar / Cancelar) */}
                        <div style={{ display: 'flex', gap: '.65rem', alignItems: 'center', flexWrap: 'wrap' }}>
                          {isConfirmed && isFuture && resch !== a.id && (
                            editavel(a) ? (
                              <>
                                <button className="btn ghost sm" onClick={() => setResch(a.id)}>
                                  Reagendar
                                </button>
                                <button className="btn sm danger" onClick={() => cancelar(a)}>
                                  Cancelar
                                </button>
                              </>
                            ) : (
                              <small style={{ color: 'var(--muted)', fontSize: '.78rem' }}>
                                Prazo de cancelamento ({a.min_cancel_hours}h antes) expirado.
                              </small>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── HISTÓRICO COMPLETO EM LISTA (PRESERVAÇÃO INTEGRAL) ─── */}
      {showAllList && (
        <section style={{ borderTop: '1px solid var(--line)', paddingTop: '1.5rem', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Histórico Completo de Agendamentos ({items.length})</h2>
            <button type="button" className="btn ghost sm" onClick={() => setShowAllList(false)}>
              Fechar lista
            </button>
          </div>

          <ul className="list">
            {items.map(a => {
              const st = STATUS_LABELS[a.status] ?? { label: a.status, badge: 'badge-muted' }
              const dateKey = getApptDateKey(a.starts_at, a.timezone)

              return (
                <li
                  key={a.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '1rem',
                    flexWrap: 'wrap',
                    padding: '.85rem 1.15rem',
                  }}
                >
                  <div style={{ flex: 1, minWidth: '220px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.25rem' }}>
                      <span className={`badge ${st.badge}`}>{st.label}</span>
                      <strong style={{ fontSize: '.95rem' }}>{a.service_name}</strong>
                      <span style={{ color: 'var(--muted)', fontSize: '.84rem' }}>· {a.business_name}</span>
                    </div>
                    <div style={{ fontSize: '.82rem', color: 'var(--muted)', display: 'flex', gap: '.65rem' }}>
                      <span>{quando(a)}</span>
                      <span>·</span>
                      <span style={{ fontWeight: 600, color: 'var(--fg)' }}>{brl(a.price_cents)}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => {
                      setSelectedDate(dateKey)
                      const [y, m] = dateKey.split('-').map(Number)
                      setViewDate(new Date(y, m - 1, 1))
                      setIsDetailsOpen(true)
                    }}
                    style={{ fontSize: '.78rem' }}
                  >
                    Ver detalhes no calendário →
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </main>
  )
}
