import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import AuthForm from '../auth/AuthForm'
import SlotPicker, { type Cfg } from './SlotPicker'
import { brl } from '../lib/format'
import type { Slot } from '../lib/slots'

export type { Cfg } from './SlotPicker'
type Props = {
  bizId: string
  svc: { id: string; name: string; price_cents: number; duration_min: number }
  cfg: Cfg
  onClose: () => void
}
const PASSOS = ['1. Horário', '2. Identificação', '3. Confirmar', '4. Concluído']

export function msgErro(e: { code?: string; message: string }) {
  if (e.code === '23P01') return 'Esse horário acabou de ser reservado por outro cliente. Escolha outro.'
  if (/outside_hours|bad_slot|slot_blocked/.test(e.message)) return 'Horário indisponível neste negócio.'
  if (/past_time|too_far/.test(e.message)) return 'Escolha uma data e horário válidos.'
  if (/too_late/.test(e.message)) return 'Prazo de alteração encerrado. Entre em contato diretamente com o negócio.'
  return 'Não foi possível concluir o agendamento. Tente novamente.'
}

export default function Reserva({ bizId, svc, cfg, onClose }: Props) {
  const { session } = useAuth()
  const [step, setStep] = useState(0)
  const [slot, setSlot] = useState<Slot | null>(null)
  const [reload, setReload] = useState(0)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (step === 1 && session) setStep(2)
  }, [step, session])

  async function confirmar() {
    if (!slot) return
    setBusy(true)
    setErr('')
    const { error } = await supabase.rpc('book_appointment', {
      p_service: svc.id,
      p_start: new Date(slot.startMs).toISOString(),
    })
    setBusy(false)
    if (!error) return setStep(3)
    setErr(msgErro(error))
    if (error.code === '23P01') {
      setStep(0)
      setReload(r => r + 1)
    }
  }

  const quando = slot
    ? new Date(slot.startMs).toLocaleString('pt-BR', {
        timeZone: cfg.timezone,
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : ''

  return (
    <section className="reserva" aria-label={`Agendamento para ${svc.name}`}>
      {/* Step Indicator */}
      <ol className="steps">
        {PASSOS.map((p, i) => {
          const isDone = i < step
          const isCurrent = i === step
          return (
            <li
              key={p}
              aria-current={isCurrent ? 'step' : undefined}
              className={`${isCurrent ? 'on' : ''} ${isDone ? 'done' : ''}`}
            >
              {p}
            </li>
          )
        })}
      </ol>

      {/* Step 0: Horário */}
      {step === 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem', flexWrap: 'wrap', gap: '.5rem' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.2rem' }}>{svc.name}</h2>
              <small style={{ color: 'var(--muted)' }}>
                ⏱️ Duração: {svc.duration_min} minutos · Valor: <strong>{brl(svc.price_cents)}</strong>
              </small>
            </div>
            <button className="link" onClick={onClose} style={{ fontSize: '.88rem' }}>
              ✕ Trocar serviço
            </button>
          </div>

          <SlotPicker
            bizId={bizId}
            durationMin={svc.duration_min}
            cfg={cfg}
            reload={reload}
            onPick={setSlot}
          />

          {err && (
            <p role="alert" className="msg" style={{ margin: '1rem 0' }}>
              {err}
            </p>
          )}

          <div className="actions" style={{ marginTop: '1.5rem' }}>
            <button
              className="btn"
              disabled={!slot}
              onClick={() => setStep(session ? 2 : 1)}
            >
              Continuar para confirmação →
            </button>
            <button className="btn ghost" onClick={onClose}>
              Cancelar
            </button>
          </div>
        </>
      )}

      {/* Step 1: Login / Cadastro */}
      {step === 1 && (
        <div style={{ maxWidth: '440px', margin: '0 auto' }}>
          <div style={{ marginBottom: '1rem', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: '.95rem' }}>
              Para confirmar seu horário em <strong>{slot?.label}</strong>, entre ou crie sua conta no Schedia:
            </p>
          </div>
          <AuthForm onSuccess={() => setStep(2)} />
          <div style={{ textAlign: 'center', marginTop: '1rem' }}>
            <button className="link" onClick={() => setStep(0)}>
              ← Voltar e escolher outro horário
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Confirmar */}
      {step === 2 && (
        <div>
          <h2 style={{ marginTop: 0, fontSize: '1.25rem' }}>Confirme os dados do agendamento</h2>
          <div
            className="card"
            style={{
              background: 'var(--bg-sub)',
              padding: '1.25rem',
              margin: '1rem 0',
              border: '1.5px solid var(--line)',
            }}
          >
            <div style={{ display: 'grid', gap: '.65rem' }}>
              <div>
                <small style={{ color: 'var(--muted)', display: 'block', textTransform: 'uppercase', fontSize: '.72rem', fontWeight: 700 }}>
                  Serviço
                </small>
                <strong style={{ fontSize: '1.1rem' }}>{svc.name}</strong>
              </div>
              <div>
                <small style={{ color: 'var(--muted)', display: 'block', textTransform: 'uppercase', fontSize: '.72rem', fontWeight: 700 }}>
                  Data e Horário
                </small>
                <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--primary)' }}>
                  🗓️ {quando}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '2rem' }}>
                <div>
                  <small style={{ color: 'var(--muted)', display: 'block', textTransform: 'uppercase', fontSize: '.72rem', fontWeight: 700 }}>
                    Duração
                  </small>
                  <span>⏱️ {svc.duration_min} min</span>
                </div>
                <div>
                  <small style={{ color: 'var(--muted)', display: 'block', textTransform: 'uppercase', fontSize: '.72rem', fontWeight: 700 }}>
                    Valor Total
                  </small>
                  <strong style={{ fontSize: '1.1rem' }}>{brl(svc.price_cents)}</strong>
                </div>
              </div>
            </div>
          </div>

          <p style={{ fontSize: '.84rem', color: 'var(--muted)', margin: '.5rem 0 1rem' }}>
            ℹ️ Cancelamento ou reagendamento sem taxa permitido até {cfg.min_cancel_hours} horas antes do atendimento.
          </p>

          {err && (
            <p role="alert" className="msg" style={{ margin: '1rem 0' }}>
              {err}
            </p>
          )}

          <div className="actions">
            <button className="btn" disabled={busy} onClick={confirmar}>
              {busy ? 'Processando reserva...' : 'Confirmar agendamento'}
            </button>
            <button className="btn ghost" onClick={() => setStep(0)}>
              Voltar
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Concluído */}
      {step === 3 && (
        <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
          <span style={{ fontSize: '3.5rem' }}>🎉</span>
          <h2 style={{ fontSize: '1.4rem', margin: '.5rem 0' }}>Agendamento Confirmado!</h2>
          <p style={{ color: 'var(--muted)', maxWidth: '420px', margin: '0 auto 1.5rem' }}>
            Seu horário para <strong>{svc.name}</strong> foi reservado para <strong>{quando}</strong>.
          </p>
          <div className="row" style={{ gap: '.75rem', justifyContent: 'center' }}>
            <Link className="btn" to="/agendamentos">
              Ver meus agendamentos
            </Link>
            <button className="btn ghost" onClick={onClose}>
              Voltar ao negócio
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
