import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { addDays, computeSlots, todayIn, weekday, zonedToUtc, type Hours, type Slot } from '../lib/slots'
import { CalendarIcon, ClockIcon } from './Icons'

export type Cfg = {
  timezone: string
  opening_hours: Hours
  slot_step_min: number
  min_cancel_hours: number
}

const dayLabel = (d: string) => {
  const dt = new Date(`${d}T12:00:00Z`)
  return {
    week: dt.toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' }).replace('.', ''),
    day: dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }),
  }
}

type Props = {
  bizId: string
  durationMin: number
  cfg: Cfg
  reload?: number
  excludeStartsAt?: string | null
  onPick: (s: Slot | null) => void
}

export default function SlotPicker({
  bizId,
  durationMin,
  cfg,
  reload = 0,
  excludeStartsAt = null,
  onPick,
}: Props) {
  const [horizon, setHorizon] = useState(14) // dias à frente; o servidor aceita até 180
  const days = useMemo(() => {
    const t = todayIn(cfg.timezone)
    return Array.from({ length: horizon }, (_, i) => addDays(t, i)).filter(
      d => (cfg.opening_hours[String(weekday(d))] ?? []).length > 0
    )
  }, [cfg, horizon])
  const stripRef = useRef<HTMLDivElement>(null)
  const scrollStrip = (dir: 1 | -1) =>
    stripRef.current?.scrollBy({ left: dir * stripRef.current.clientWidth * 0.8, behavior: 'smooth' })

  const [date, setDate] = useState(days[0] ?? '')
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [sel, setSel] = useState<number | null>(null)
  const [loadError, setLoadError] = useState(false)

  // Atualiza a data caso os dias mudem (por ex: carregamento assíncrono de configurações)
  useEffect(() => {
    if (!date && days.length > 0) {
      setDate(days[0])
    }
  }, [days, date])

  useEffect(() => {
    if (!date) return
    setSlots(null)
    setSel(null)
    setLoadError(false)
    onPick(null)
    let off = false // descarta respostas de datas antigas

    const from = zonedToUtc(date, '00:00', cfg.timezone)
    // Janela ampla (-4h a +30h) para garantir cobertura completa de fusos e bloqueios
    supabase
      .rpc('get_busy_slots', {
        p_business: bizId,
        p_from: new Date(from - 4 * 3600000).toISOString(),
        p_to: new Date(from + 30 * 3600000).toISOString(),
      })
      .then(({ data, error }) => {
        if (off) return
        if (error) {
          setLoadError(true)
          setSlots([])
          return
        }
        const computed = computeSlots({
          date,
          tz: cfg.timezone,
          hours: cfg.opening_hours,
          durationMin,
          stepMin: cfg.slot_step_min,
          busy: data ?? [],
          excludeStartsAt,
        })
        setSlots(computed)
      })
    return () => {
      off = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, reload, bizId, cfg, durationMin, excludeStartsAt])

  if (days.length === 0) {
    return (
      <div className="card empty" style={{ padding: '1.5rem' }}>
        <p style={{ margin: 0, color: 'var(--muted)' }}>
          Sem horários de funcionamento configurados neste negócio.
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '1.25rem', margin: '1rem 0' }}>
      {/* 1. Date Selector Cards */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', marginBottom: '.55rem' }}>
          <CalendarIcon size={16} style={{ color: 'var(--primary)' }} />
          <span style={{ fontSize: '.84rem', fontWeight: 700 }}>
            1. Selecione o dia
          </span>
        </div>

        <div className="date-strip-wrap">
          <button type="button" className="strip-arrow left" aria-label="Datas anteriores" onClick={() => scrollStrip(-1)}>‹</button>
          <div className="date-strip" ref={stripRef} role="group" aria-label="Escolha a data do atendimento">
            {days.map(d => {
              const { week, day } = dayLabel(d)
              const isSelected = d === date
              return (
                <button
                  type="button"
                  key={d}
                  className="date-btn"
                  aria-pressed={isSelected}
                  onClick={() => setDate(d)}
                >
                  <span className="dw">{week}</span>
                  <span className="dd">{day}</span>
                </button>
              )
            })}
            {horizon < 90 && (
              <button type="button" className="date-btn more" onClick={() => setHorizon(h => h + 14)}>
                <span className="dd">+ datas</span>
              </button>
            )}
          </div>
          <button type="button" className="strip-arrow right" aria-label="Próximas datas" onClick={() => scrollStrip(1)}>›</button>
        </div>
      </div>

      {/* 2. Time Slots Grid */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', marginBottom: '.55rem' }}>
          <ClockIcon size={16} style={{ color: 'var(--primary)' }} />
          <span style={{ fontSize: '.84rem', fontWeight: 700 }}>
            2. Selecione o horário de início
          </span>
        </div>

        {slots === null ? (
          <div className="center" style={{ padding: '1.5rem' }}>
            <div className="spinner" />
            <small style={{ display: 'block', marginTop: '.5rem', color: 'var(--muted)' }}>
              Verificando disponibilidade de horários...
            </small>
          </div>
        ) : loadError ? (
          <div className="card center" style={{ padding: '1.25rem' }}>
            <p style={{ margin: 0, fontSize: '.88rem', color: 'var(--err)' }}>
              Não foi possível consultar a agenda no momento. Tente novamente em instantes.
            </p>
          </div>
        ) : slots.length === 0 ? (
          <div className="card center" style={{ padding: '1.25rem' }}>
            <p style={{ margin: 0, fontSize: '.88rem', color: 'var(--muted)' }}>
              Nenhum horário livre restante nesta data. Por favor, selecione outro dia acima.
            </p>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))',
              gap: '.45rem',
            }}
            role="group"
            aria-label="Horários livres"
          >
            {slots.map(s => {
              const isSelected = sel === s.startMs
              return (
                <button
                  type="button"
                  key={s.startMs}
                  className="chip"
                  aria-pressed={isSelected}
                  onClick={() => {
                    setSel(s.startMs)
                    onPick(s)
                  }}
                  style={{
                    padding: '.55rem .25rem',
                    textAlign: 'center',
                    justifyContent: 'center',
                    fontSize: '.9rem',
                    fontWeight: isSelected ? 700 : 500,
                    minHeight: '44px',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  {s.label}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
