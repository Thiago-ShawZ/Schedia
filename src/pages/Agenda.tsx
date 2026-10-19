import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { brl } from '../lib/format'
import { todayIn, zonedToUtc } from '../lib/slots'
import { STATUS_LABELS } from './MeusAgendamentos'
import { CalendarIcon, ClockIcon, CheckIcon } from '../components/Icons'

type Row = {
  id: string
  starts_at: string
  status: string
  service_name: string
  client_name: string
  client_phone: string | null
  price_cents: number
}

const RANGES = [
  ['hoje', 'Hoje'],
  ['7', 'Próximos 7 dias'],
  ['30', 'Próximos 30 dias'],
  ['passados', 'Últimos 30 dias'],
] as const
type R = typeof RANGES[number][0]

export default function Agenda() {
  const { id } = useParams()
  const [tz, setTz] = useState('')
  const [range, setRange] = useState<R>('7')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    supabase
      .from('business_settings')
      .select('timezone')
      .eq('business_id', id)
      .single()
      .then(({ data }) => setTz(data?.timezone ?? 'America/Sao_Paulo'))
  }, [id])

  const load = useCallback(async () => {
    if (!tz) return
    const DAY = 86400000
    const d0 = zonedToUtc(todayIn(tz), '00:00', tz)
    const now = Date.now()
    const [from, to] =
      range === 'hoje'
        ? [d0, d0 + DAY]
        : range === '7'
        ? [d0, d0 + 7 * DAY]
        : range === '30'
        ? [d0, d0 + 30 * DAY]
        : [now - 30 * DAY, now]

    const { data, error } = await supabase.rpc('get_business_agenda', {
      p_business: id,
      p_from: new Date(from).toISOString(),
      p_to: new Date(to).toISOString(),
    })
    if (error) setMsg('Não foi possível carregar a agenda.')
    setRows(error ? [] : data ?? [])
  }, [id, tz, range])

  useEffect(() => {
    load()
  }, [load])

  async function mudar(r: Row, status: 'completed' | 'no_show') {
    const { error } = await supabase.from('appointments').update({ status }).eq('id', r.id)
    if (error) {
      setMsg(
        /too_early/.test(error.message)
          ? 'Só é possível concluir após o horário previsto do atendimento.'
          : 'Não foi possível atualizar o status.'
      )
    } else {
      setMsg('')
    }
    load()
  }

  async function cancelar(r: Row) {
    if (!confirm(`Deseja cancelar o atendimento de ${r.client_name}?`)) return
    const { error } = await supabase.rpc('cancel_appointment', { p_id: r.id })
    if (error) setMsg('Não foi possível cancelar.')
    else setMsg('Agendamento cancelado com sucesso.')
    load()
  }

  const dia = (iso: string) =>
    new Date(iso).toLocaleDateString('pt-BR', {
      timeZone: tz,
      weekday: 'long',
      day: '2-digit',
      month: 'long',
    })

  const hora = (iso: string) =>
    new Date(iso).toLocaleTimeString('pt-BR', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
    })

  const grupos = new Map<string, Row[]>()
  rows?.forEach(r =>
    grupos.set(dia(r.starts_at), [...(grupos.get(dia(r.starts_at)) ?? []), r])
  )
  const soma = (st: string) =>
    rows?.filter(r => r.status === st).reduce((s, r) => s + r.price_cents, 0) ?? 0

  const totalConfirmados = rows?.filter(r => r.status === 'confirmed').length ?? 0
  const totalConcluidos = rows?.filter(r => r.status === 'completed').length ?? 0

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', margin: 0 }}>Agenda de Atendimentos</h1>
          <p style={{ color: 'var(--muted)', fontSize: '.88rem', margin: '.2rem 0 0' }}>
            Acompanhe suas reservas confirmadas e finalize atendimentos.
          </p>
        </div>
        <div className="chips" role="group" aria-label="Período" style={{ margin: 0 }}>
          {RANGES.map(([k, l]) => (
            <button
              key={k}
              className="chip"
              aria-pressed={range === k}
              onClick={() => setRange(k)}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Cards */}
      {rows && (
        <div className="stat-grid">
          <div className="stat">
            <div className="stat-val">{totalConfirmados}</div>
            <div className="stat-lbl">Confirmados</div>
          </div>
          <div className="stat">
            <div className="stat-val" style={{ color: 'var(--ok)' }}>
              {totalConcluidos}
            </div>
            <div className="stat-lbl">Concluídos</div>
          </div>
          <div className="stat">
            <div className="stat-val">{brl(soma('confirmed'))}</div>
            <div className="stat-lbl">Previsto</div>
          </div>
          <div className="stat">
            <div className="stat-val" style={{ color: 'var(--ok)' }}>
              {brl(soma('completed'))}
            </div>
            <div className="stat-lbl">Realizado</div>
          </div>
        </div>
      )}

      {msg && (
        <p role="alert" className="msg" style={{ marginBottom: '1rem' }}>
          {msg}
        </p>
      )}

      {rows === null ? (
        <div className="center">
          <div className="spinner" />
          <p style={{ marginTop: '.75rem', fontSize: '.88rem' }}>Carregando agenda...</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="card empty">
          <div style={{ display: 'inline-flex', padding: '1rem', background: 'var(--bg-sub)', borderRadius: '50%', color: 'var(--muted)', marginBottom: '.75rem' }}>
            <CalendarIcon size={32} />
          </div>
          <h2>Nenhum agendamento neste período</h2>
          <p style={{ fontSize: '.88rem' }}>
            Quando os clientes agendarem horários na sua página pública, eles aparecerão aqui.
          </p>
        </div>
      ) : (
        [...grupos].map(([d, lista]) => (
          <section key={d} style={{ marginBottom: '1.75rem' }}>
            <div className="agenda-day-lbl">{d}</div>
            <ul className="list" style={{ marginTop: '.6rem' }}>
              {lista.map(r => {
                const st = STATUS_LABELS[r.status] ?? { label: r.status, badge: 'badge-muted' }
                const isPast = Date.parse(r.starts_at) <= Date.now()

                return (
                  <li
                    key={r.id}
                    className={r.status === 'cancelled' ? 'off' : ''}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '1rem',
                      flexWrap: 'wrap',
                      padding: '1rem 1.15rem',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: '220px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.3rem' }}>
                        <span
                          style={{
                            fontWeight: 800,
                            fontSize: '.95rem',
                            color: 'var(--primary)',
                            background: 'var(--primary-lt)',
                            padding: '.2rem .55rem',
                            borderRadius: 'var(--r-sm)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '.25rem',
                          }}
                        >
                          <ClockIcon size={13} />
                          {hora(r.starts_at)}
                        </span>
                        <strong style={{ fontSize: '1rem' }}>{r.client_name || 'Cliente'}</strong>
                        <span className={`badge ${st.badge}`}>{st.label}</span>
                      </div>

                      <div style={{ display: 'flex', gap: '.65rem', alignItems: 'center', flexWrap: 'wrap', fontSize: '.84rem', color: 'var(--muted)' }}>
                        <span>{r.service_name}</span>
                        <span>·</span>
                        <span style={{ fontWeight: 600, color: 'var(--fg)' }}>{brl(r.price_cents)}</span>
                        {r.client_phone && (
                          <>
                            <span>·</span>
                            <span>Tel: {r.client_phone}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {r.status === 'confirmed' && (
                      <div className="actions appt-actions">
                        {isPast && (
                          <>
                            <button
                              className="btn sm"
                              style={{ background: 'var(--ok)' }}
                              onClick={() => mudar(r, 'completed')}
                            >
                              <CheckIcon size={14} style={{ marginRight: '.25rem' }} />
                              Concluir
                            </button>
                            <button
                              className="btn ghost sm"
                              style={{ borderColor: 'var(--warn)', color: 'var(--warn)' }}
                              onClick={() => mudar(r, 'no_show')}
                            >
                              Faltou
                            </button>
                          </>
                        )}
                        <button
                          className="btn sm danger"
                          onClick={() => cancelar(r)}
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}
    </>
  )
}
