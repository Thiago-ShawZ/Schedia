import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { brl } from '../lib/format'
import SlotPicker from '../components/SlotPicker'
import { msgErro } from '../components/Reserva'
import type { Hours, Slot } from '../lib/slots'
import { CalendarIcon, ClockIcon, BuildingIcon } from '../components/Icons'

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

export const STATUS_LABELS: Record<string, { label: string; badge: string }> = {
  confirmed: { label: 'Confirmado', badge: 'badge-ok' },
  cancelled: { label: 'Cancelado', badge: 'badge-err' },
  completed: { label: 'Concluído', badge: 'badge-info' },
  no_show: { label: 'Não compareceu', badge: 'badge-warn' },
}

const quando = (a: A) =>
  new Date(a.starts_at).toLocaleString('pt-BR', {
    timeZone: a.timezone,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

export default function MeusAgendamentos() {
  const [items, setItems] = useState<A[] | null>(null)
  const [msg, setMsg] = useState('')
  const [resch, setResch] = useState<string | null>(null)
  const [slot, setSlot] = useState<Slot | null>(null)
  const [activeTab, setActiveTab] = useState<'futuros' | 'historico'>('futuros')

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('get_my_appointments')
    setItems(data ?? [])
  }, [])

  useEffect(() => {
    load()
  }, [load])

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

  if (!items) {
    return (
      <div className="center" style={{ paddingTop: '4rem' }}>
        <div className="spinner" />
        <p style={{ marginTop: '.75rem', fontSize: '.88rem' }}>Carregando seus agendamentos...</p>
      </div>
    )
  }

  const futuros = items
    .filter(a => a.status === 'confirmed' && Date.parse(a.starts_at) > Date.now())
    .reverse()
  const historico = items.filter(a => !futuros.includes(a))
  const displayItems = activeTab === 'futuros' ? futuros : historico

  return (
    <main>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ marginBottom: '.35rem' }}>Meus agendamentos</h1>
        <p style={{ color: 'var(--muted)', fontSize: '.92rem' }}>
          Consulte suas reservas, reagende ou cancele atendimentos.
        </p>
      </div>

      {msg && (
        <div role="status" className="msg" style={{ marginBottom: '1.25rem' }}>
          {msg}
        </div>
      )}

      {/* Tabs / Filter switch */}
      <div
        style={{
          display: 'flex',
          gap: '.5rem',
          borderBottom: '1px solid var(--line)',
          marginBottom: '1.25rem',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('futuros')}
          style={{
            padding: '.65rem 1rem',
            border: 'none',
            background: 'none',
            fontSize: '.9rem',
            fontWeight: activeTab === 'futuros' ? 700 : 500,
            color: activeTab === 'futuros' ? 'var(--primary)' : 'var(--muted)',
            borderBottom: activeTab === 'futuros' ? '2.5px solid var(--primary)' : '2.5px solid transparent',
            cursor: 'pointer',
            transition: 'all var(--tr)',
          }}
        >
          Próximos ({futuros.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('historico')}
          style={{
            padding: '.65rem 1rem',
            border: 'none',
            background: 'none',
            fontSize: '.9rem',
            fontWeight: activeTab === 'historico' ? 700 : 500,
            color: activeTab === 'historico' ? 'var(--primary)' : 'var(--muted)',
            borderBottom: activeTab === 'historico' ? '2.5px solid var(--primary)' : '2.5px solid transparent',
            cursor: 'pointer',
            transition: 'all var(--tr)',
          }}
        >
          Histórico ({historico.length})
        </button>
      </div>

      {displayItems.length === 0 ? (
        <div className="card empty">
          <div style={{ display: 'inline-flex', padding: '1rem', background: 'var(--bg-sub)', borderRadius: '50%', color: 'var(--muted)', marginBottom: '.75rem' }}>
            <CalendarIcon size={32} />
          </div>
          <h2>
            {activeTab === 'futuros'
              ? 'Nenhum agendamento futuro'
              : 'Nenhum agendamento no histórico'}
          </h2>
          <p style={{ maxWidth: '400px', margin: '.35rem auto 1rem', fontSize: '.88rem' }}>
            {activeTab === 'futuros'
              ? 'Você não possui reservas agendadas no momento.'
              : 'Seus atendimentos concluídos ou cancelados aparecerão aqui.'}
          </p>
          {activeTab === 'futuros' && (
            <Link className="btn" to="/hub">
              Explorar negócios no Hub
            </Link>
          )}
        </div>
      ) : (
        <ul className="list">
          {displayItems.map(a => {
            const st = STATUS_LABELS[a.status] ?? { label: a.status, badge: 'badge-muted' }
            const isConfirmed = a.status === 'confirmed'
            const isFuture = futuros.includes(a)

            return (
              <li
                key={a.id}
                className={a.status === 'cancelled' ? 'off' : ''}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '.85rem',
                  padding: '1.25rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '.5rem', width: '100%' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.35rem' }}>
                      <span className={`badge ${st.badge}`}>{st.label}</span>
                      <span style={{ fontSize: '.8rem', color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: '.25rem' }}>
                        <ClockIcon size={12} />
                        {a.duration_min} min
                      </span>
                    </div>
                    <strong style={{ fontSize: '1.08rem' }}>{a.service_name}</strong>
                    <div style={{ marginTop: '.25rem' }}>
                      <Link
                        to={`/n/${a.business_slug}`}
                        style={{ color: 'var(--primary)', fontWeight: 600, fontSize: '.88rem', display: 'inline-flex', alignItems: 'center', gap: '.3rem' }}
                      >
                        <BuildingIcon size={13} />
                        {a.business_name}
                      </Link>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1.08rem', fontWeight: 800, color: 'var(--fg)' }}>
                      {brl(a.price_cents)}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '.5rem',
                    background: 'var(--bg-sub)',
                    padding: '.55rem .85rem',
                    borderRadius: 'var(--r-sm)',
                    fontSize: '.88rem',
                    color: 'var(--fg)',
                  }}
                >
                  <CalendarIcon size={15} style={{ color: 'var(--primary)' }} />
                  <span style={{ fontWeight: 600 }}>{quando(a)}</span>
                </div>

                {/* Reschedule inline area */}
                {resch === a.id && (
                  <div className="reserva" style={{ width: '100%', marginTop: '.5rem' }}>
                    <h3 style={{ marginTop: 0, textTransform: 'none', color: 'var(--fg)', fontSize: '1rem' }}>
                      Selecione uma nova data e horário
                    </h3>
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

                {/* Actions footer */}
                {isConfirmed && isFuture && resch !== a.id && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                      gap: '.75rem',
                      alignItems: 'center',
                      borderTop: '1px solid var(--line)',
                      paddingTop: '.75rem',
                      width: '100%',
                    }}
                  >
                    {editavel(a) ? (
                      <>
                        <button
                          className="btn ghost sm"
                          onClick={() => setResch(a.id)}
                        >
                          Reagendar
                        </button>
                        <button
                          className="btn ghost sm danger"
                          style={{ borderColor: 'var(--err)', color: 'var(--err)' }}
                          onClick={() => cancelar(a)}
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <small style={{ color: 'var(--muted)', fontSize: '.78rem' }}>
                        Prazo de alteração ({a.min_cancel_hours}h antes) encerrado.
                      </small>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
