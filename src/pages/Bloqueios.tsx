import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { todayIn, zonedToUtc } from '../lib/slots'

type Blk = {
  id: string
  starts_at: string
  ends_at: string
  reason: string | null
}

export default function Bloqueios() {
  const { id } = useParams()
  const [tz, setTz] = useState('')
  const [items, setItems] = useState<Blk[]>([])
  const [f, setF] = useState({ date: '', start: '09:00', end: '10:00', reason: '' })
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase
      .from('business_settings')
      .select('timezone')
      .eq('business_id', id)
      .single()
      .then(({ data }) => {
        const z = data?.timezone ?? 'America/Sao_Paulo'
        setTz(z)
        setF(p => ({ ...p, date: todayIn(z) }))
      })
  }, [id])

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('blocked_times')
      .select('id,starts_at,ends_at,reason')
      .eq('business_id', id)
      .gte('ends_at', new Date().toISOString())
      .order('starts_at')
    setItems(data ?? [])
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  async function add(e: FormEvent) {
    e.preventDefault()
    setMsg('')
    const s = zonedToUtc(f.date, f.start, tz)
    const en = zonedToUtc(f.date, f.end, tz)
    if (en <= s) return setMsg('O horário de término deve ser posterior ao de início.')

    setBusy(true)
    const { error } = await supabase.from('blocked_times').insert({
      business_id: id,
      starts_at: new Date(s).toISOString(),
      ends_at: new Date(en).toISOString(),
      reason: f.reason.trim() || null,
    })
    setBusy(false)

    if (error) return setMsg('Não foi possível registrar o bloqueio.')

    const { data } = await supabase.rpc('get_business_agenda', {
      p_business: id,
      p_from: new Date(s - 36e5).toISOString(),
      p_to: new Date(en).toISOString(),
    })
    const n = (data ?? []).filter(
      (r: { status: string; starts_at: string; ends_at: string }) =>
        r.status === 'confirmed' && Date.parse(r.starts_at) < en && Date.parse(r.ends_at) > s
    ).length

    setMsg(
      n
        ? `⚠️ Bloqueio registrado! Atenção: há ${n} agendamento(s) confirmado(s) nesse intervalo. Verifique na Agenda.`
        : 'Horário bloqueado com sucesso! ✅'
    )
    setF({ ...f, reason: '' })
    load()
  }

  async function remove(b: Blk) {
    await supabase.from('blocked_times').delete().eq('id', b.id)
    load()
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('pt-BR', {
      timeZone: tz,
      dateStyle: 'short',
      timeStyle: 'short',
    })

  return (
    <>
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: '1.4rem', margin: 0 }}>Bloqueios de Horário</h1>
        <p style={{ color: 'var(--muted)', fontSize: '.88rem', margin: '.2rem 0 0' }}>
          Interdite períodos para almoço, folgas, compromissos ou manutenção.
        </p>
      </div>

      <div className="card" style={{ marginBottom: '2rem', padding: '1.5rem' }}>
        <form className="form" onSubmit={add} style={{ margin: 0 }}>
          <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Novo bloqueio</h2>
          <div className="row2">
            <label>
              Data
              <input
                type="date"
                required
                value={f.date}
                onChange={e => setF({ ...f, date: e.target.value })}
              />
            </label>
            <label>
              Início
              <input
                type="time"
                required
                value={f.start}
                onChange={e => setF({ ...f, start: e.target.value })}
              />
            </label>
            <label>
              Término
              <input
                type="time"
                required
                value={f.end}
                onChange={e => setF({ ...f, end: e.target.value })}
              />
            </label>
          </div>
          <label>
            Motivo do bloqueio (opcional)
            <input
              value={f.reason}
              onChange={e => setF({ ...f, reason: e.target.value })}
              placeholder="Ex.: Almoço, consulta médica, folga..."
            />
          </label>

          {msg && (
            <p
              role="alert"
              className="msg"
              style={{
                margin: '.5rem 0',
                background: msg.includes('Atenção')
                  ? 'var(--warn-lt)'
                  : msg.includes('sucesso')
                  ? 'var(--ok-lt)'
                  : 'var(--err-lt)',
                color: msg.includes('Atenção')
                  ? 'var(--warn)'
                  : msg.includes('sucesso')
                  ? 'var(--ok)'
                  : 'var(--err)',
                borderLeftColor: msg.includes('Atenção')
                  ? 'var(--warn)'
                  : msg.includes('sucesso')
                  ? 'var(--ok)'
                  : 'var(--err)',
              }}
            >
              {msg}
            </p>
          )}

          <div className="actions" style={{ marginTop: '.5rem' }}>
            <button className="btn" disabled={busy}>
              {busy ? 'Bloqueando...' : 'Bloquear horário'}
            </button>
          </div>
        </form>
      </div>

      <div className="sec-hdr">
        <h2>Bloqueios futuros ({items.length})</h2>
      </div>

      <ul className="list">
        {items.length === 0 && (
          <li className="card center">Nenhum horário bloqueado programado para o futuro.</li>
        )}
        {items.map(b => (
          <li key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.25rem' }}>
                <span className="badge badge-warn">⛔ Bloqueado</span>
                <strong style={{ fontSize: '.95rem' }}>
                  {fmt(b.starts_at)} → {fmt(b.ends_at)}
                </strong>
              </div>
              <small style={{ color: 'var(--muted)' }}>
                {b.reason ? `Motivo: ${b.reason}` : 'Sem motivo informado'}
              </small>
            </div>
            <button
              className="btn ghost sm danger"
              style={{ borderColor: 'var(--err)', color: 'var(--err)' }}
              onClick={() => remove(b)}
            >
              Desbloquear
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}
