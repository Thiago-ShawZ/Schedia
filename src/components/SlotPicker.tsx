import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { addDays, computeSlots, todayIn, weekday, zonedToUtc, type Hours, type Slot } from '../lib/slots'

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
  onPick: (s: Slot | null) => void
}

export default function SlotPicker({ bizId, durationMin, cfg, reload = 0, onPick }: Props) {
  const days = useMemo(() => {
    const t = todayIn(cfg.timezone)
    return Array.from({ length: 14 }, (_, i) => addDays(t, i)).filter(
      d => cfg.opening_hours[String(weekday(d))]
    )
  }, [cfg])

  const [date, setDate] = useState(days[0] ?? '')
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [sel, setSel] = useState<number | null>(null)

  useEffect(() => {
    if (!date) return
    setSlots(null)
    setSel(null)
    onPick(null)
    const from = zonedToUtc(date, '00:00', cfg.timezone)
    supabase
      .rpc('get_busy_slots', {
        p_business: bizId,
        p_from: new Date(from).toISOString(),
        p_to: new Date(from + 26 * 3600000).toISOString(),
      })
      .then(({ data }) =>
        setSlots(
          computeSlots({
            date,
            tz: cfg.timezone,
            hours: cfg.opening_hours,
            durationMin,
            stepMin: cfg.slot_step_min,
            busy: data ?? [],
          })
        )
      )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, reload, bizId, cfg, durationMin])

  if (days.length === 0) {
    return (
      <div className="card empty" style={{ padding: '1.5rem' }}>
        <p style={{ margin: 0 }}>Sem horários de funcionamento configurados neste negócio.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: '1.25rem', margin: '1rem 0' }}>
      {/* 1. Date Selector Cards */}
      <div>
        <label style={{ fontSize: '.84rem', fontWeight: 700, marginBottom: '.5rem', display: 'block' }}>
          1. Escolha a data
        </label>
        <div
          style={{
            display: 'flex',
            gap: '.5rem',
            overflowX: 'auto',
            paddingBottom: '.5rem',
            scrollbarWidth: 'thin',
          }}
          role="group"
          aria-label="Escolha o dia"
        >
          {days.map(d => {
            const { week, day } = dayLabel(d)
            const isSelected = d === date
            return (
              <button
                type="button"
                key={d}
                onClick={() => setDate(d)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: '68px',
                  padding: '.55rem .4rem',
                  borderRadius: 'var(--r-sm)',
                  border: isSelected ? '1.5px solid var(--primary)' : '1.5px solid var(--line)',
                  background: isSelected ? 'var(--primary-lt)' : 'var(--card)',
                  color: isSelected ? 'var(--primary)' : 'var(--fg)',
                  cursor: 'pointer',
                  fontWeight: isSelected ? 700 : 500,
                  transition: 'all var(--tr)',
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: '.72rem', textTransform: 'uppercase', opacity: isSelected ? 1 : 0.7 }}>
                  {week}
                </span>
                <span style={{ fontSize: '.95rem', fontWeight: 700, marginTop: '.15rem' }}>
                  {day}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 2. Time Slots Grid */}
      <div>
        <label style={{ fontSize: '.84rem', fontWeight: 700, marginBottom: '.5rem', display: 'block' }}>
          2. Escolha o horário de início
        </label>
        {slots === null ? (
          <div className="center" style={{ padding: '1.5rem' }}>
            <div className="spinner" />
            <small style={{ display: 'block', marginTop: '.5rem' }}>Verificando horários disponíveis...</small>
          </div>
        ) : slots.length === 0 ? (
          <div className="card center" style={{ padding: '1.25rem' }}>
            <p style={{ margin: 0, fontSize: '.9rem', color: 'var(--muted)' }}>
              Todos os horários estão ocupados para esta data. Tente outro dia!
            </p>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
              gap: '.45rem',
            }}
            role="group"
            aria-label="Horários disponíveis"
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
