import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import ImageUploader from '../components/ImageUploader'
import { AlertCircleIcon, CheckIcon } from '../components/Icons'

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
type Dia = { on: boolean; start: string; end: string }
const dia0: Dia = { on: false, start: '09:00', end: '18:00' }
const ERROS: Record<string, string> = {
  publish_needs_category: 'Escolha uma categoria e salve antes de publicar.',
  publish_needs_service: 'Cadastre ao menos um serviço ativo antes de publicar.',
  publish_needs_hours: 'Defina e salve os horários de funcionamento antes de publicar.',
  publish_needs_approval: 'A publicação no Hub exige que o negócio tenha sido aprovado pela equipe do Schedia.',
}

export default function Configuracoes() {
  const { id } = useParams()
  const [cats, setCats] = useState<{ id: number; name: string }[]>([])
  const [biz, setBiz] = useState({
    name: '',
    slug: '',
    description: '',
    city: '',
    category_id: '',
    logo_url: '',
    phone: '',
    is_published: false,
    approval_status: 'pending' as 'pending' | 'approved' | 'rejected',
  })
  const [latestApp, setLatestApp] = useState<{ id: string; status: string; review_comment: string | null } | null>(null)
  const [cfg, setCfg] = useState({ slot_step_min: 30, min_cancel_hours: 24 })
  const [dias, setDias] = useState<Dia[]>(DIAS.map(() => dia0))
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    ;(async () => {
      const [c, b, s, app] = await Promise.all([
        supabase.from('categories').select('id,name').order('name'),
        supabase.from('businesses').select('*').eq('id', id).single(),
        supabase.from('business_settings').select('*').eq('business_id', id).single(),
        supabase
          .from('business_applications')
          .select('id,status,review_comment')
          .eq('business_id', id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])
      setCats(c.data ?? [])
      if (b.data) {
        setBiz({
          name: b.data.name,
          slug: b.data.slug,
          description: b.data.description ?? '',
          city: b.data.city ?? '',
          category_id: b.data.category_id ? String(b.data.category_id) : '',
          logo_url: b.data.logo_url ?? '',
          phone: b.data.phone ?? '',
          is_published: b.data.is_published,
          approval_status: b.data.approval_status ?? 'approved',
        })
      }
      if (app.data) {
        setLatestApp(app.data)
      }
      if (s.data) {
        setCfg({
          slot_step_min: s.data.slot_step_min,
          min_cancel_hours: s.data.min_cancel_hours,
        })
        setDias(
          DIAS.map((_, i) => {
            const h = s.data.opening_hours?.[i]?.[0]
            return h ? { on: true, start: h[0], end: h[1] } : dia0
          })
        )
      }
    })()
  }, [id])

  const setDia = (i: number, p: Partial<Dia>) =>
    setDias(dias.map((d, k) => (k === i ? { ...d, ...p } : d)))

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setMsg('')
    const hours: Record<string, string[][]> = {}
    for (let i = 0; i < 7; i++) {
      const d = dias[i]
      if (!d.on) continue
      if (d.start >= d.end)
        return setMsg(`${DIAS[i]}: o horário de fechamento deve ser posterior ao de abertura.`)
      hours[i] = [[d.start, d.end]]
    }

    setBusy(true)
    const [a, b] = await Promise.all([
      supabase
        .from('businesses')
        .update({
          name: biz.name.trim(),
          description: biz.description.trim() || null,
          city: biz.city.trim() || null,
          phone: biz.phone.trim() || null,
          category_id: biz.category_id ? Number(biz.category_id) : null,
          logo_url: biz.logo_url.trim() || null,
        })
        .eq('id', id),
      supabase
        .from('business_settings')
        .update({ ...cfg, opening_hours: hours })
        .eq('business_id', id),
    ])
    setBusy(false)
    setMsg(a.error?.message ?? b.error?.message ?? 'Configurações salvas com sucesso.')
  }

  async function publicar() {
    const next = !biz.is_published
    setBusy(true)
    const { error } = await supabase.from('businesses').update({ is_published: next }).eq('id', id)
    setBusy(false)
    if (error) return setMsg(ERROS[error.message] ?? error.message)
    setBiz({ ...biz, is_published: next })
    setMsg(next ? 'Negócio publicado no Hub com sucesso.' : 'Negócio despublicado do Hub.')
  }

  const isApproved = biz.approval_status === 'approved'

  return (
    <>
      <div style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', margin: 0 }}>Configurações do Negócio</h1>
          <p style={{ color: 'var(--muted)', fontSize: '.88rem', margin: '.2rem 0 0' }}>
            Atualize dados cadastrais, logotipo, horários e regras de agendamento.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.65rem', flexWrap: 'wrap' }}>
          {isApproved ? (
            <span className="badge badge-ok">Aprovado</span>
          ) : biz.approval_status === 'rejected' ? (
            <span className="badge badge-danger">Reprovado</span>
          ) : latestApp ? (
            <span className="badge badge-info">Em análise</span>
          ) : (
            <span className="badge badge-warning">Análise incompleta</span>
          )}

          <span className={`badge ${biz.is_published ? 'badge-ok' : 'badge-muted'}`}>
            {biz.is_published ? 'Publicado no Hub' : 'Rascunho / Oculto'}
          </span>
          <button
            type="button"
            className={`btn sm ${biz.is_published ? 'ghost' : ''}`}
            onClick={publicar}
            disabled={busy || (!biz.is_published && !isApproved)}
            title={!isApproved ? 'A publicação no Hub exige aprovação prévia da equipe.' : undefined}
          >
            {biz.is_published ? 'Despublicar do Hub' : 'Publicar no Hub'}
          </button>
        </div>
      </div>

      {/* Banner de status da moderação */}
      {!isApproved && (
        <div style={{ marginBottom: '1.25rem' }}>
          {biz.approval_status === 'rejected' ? (
            <div
              className="card"
              style={{
                borderColor: '#f87171',
                background: 'rgba(239, 68, 68, 0.08)',
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '.5rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', color: '#dc2626', fontWeight: 600, fontSize: '.9rem' }}>
                <AlertCircleIcon size={18} />
                <span>Cadastro reprovado pela moderação</span>
              </div>
              <p style={{ margin: 0, fontSize: '.86rem', color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
                {latestApp?.review_comment || 'Sua solicitação de cadastro não foi aprovada.'}
              </p>
              <div style={{ marginTop: '.35rem' }}>
                <Link to={`/painel/${id}/analise`} className="btn sm">
                  Corrigir e reenviar solicitação →
                </Link>
              </div>
            </div>
          ) : latestApp ? (
            <div
              className="card"
              style={{
                borderColor: '#60a5fa',
                background: 'rgba(59, 130, 246, 0.08)',
                padding: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '.75rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '.65rem' }}>
                <CheckIcon size={18} style={{ color: '#2563eb' }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '.88rem', color: '#1d4ed8' }}>
                    Cadastro em análise pela equipe do Schedia
                  </div>
                  <div style={{ fontSize: '.8rem', color: 'var(--muted)' }}>
                    Você já pode cadastrar seus serviços e horários. A publicação no Hub será liberada após a aprovação.
                  </div>
                </div>
              </div>
              <Link to={`/painel/${id}/analise`} className="link" style={{ fontSize: '.82rem' }}>
                Ver dados enviados
              </Link>
            </div>
          ) : (
            <div
              className="card"
              style={{
                borderColor: '#fbbf24',
                background: 'rgba(245, 158, 11, 0.08)',
                padding: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '.75rem',
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: '.88rem', color: '#b45309' }}>
                  Complete o envio para análise
                </div>
                <div style={{ fontSize: '.8rem', color: 'var(--muted)' }}>
                  Envie as fotos e dados do estabelecimento para que a equipe do Schedia possa aprovar sua publicação no Hub.
                </div>
              </div>
              <Link to={`/painel/${id}/analise`} className="btn sm">
                Completar envio para análise →
              </Link>
            </div>
          )}
        </div>
      )}


      <form className="form" onSubmit={salvar}>
        {/* Section 1: Business Details & Logo */}
        <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
          <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>Identidade e Dados</h2>

          <ImageUploader
            value={biz.logo_url}
            fallbackText={biz.name || 'B'}
            onChange={url => setBiz({ ...biz, logo_url: url })}
            label="Logotipo do negócio"
            size={76}
          />

          <label>
            Nome do estabelecimento
            <input
              required
              value={biz.name}
              onChange={e => setBiz({ ...biz, name: e.target.value })}
              placeholder="Ex.: Studio Lumina"
            />
          </label>
          <label>
            Endereço da página pública
            <input value={`schedia.app/n/${biz.slug}`} disabled style={{ opacity: 0.65 }} />
          </label>
          <div className="row2">
            <label>
              Categoria principal
              <select
                value={biz.category_id}
                onChange={e => setBiz({ ...biz, category_id: e.target.value })}
              >
                <option value="">Selecione uma categoria...</option>
                {cats.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Cidade / Região
              <input
                value={biz.city}
                onChange={e => setBiz({ ...biz, city: e.target.value })}
                placeholder="Ex.: São Paulo, SP"
              />
            </label>
          </div>

          <label>
            Telefone / WhatsApp comercial
            <input
              type="tel"
              value={biz.phone}
              onChange={e => setBiz({ ...biz, phone: e.target.value })}
              placeholder="Ex.: (11) 98765-4321"
            />
            <small style={{ color: 'var(--muted)', fontSize: '.78rem' }}>
              Utilizado para os clientes entrarem em contato pelo WhatsApp após agendar um serviço.
            </small>
          </label>

          <label>
            Descrição do negócio
            <textarea
              rows={3}
              value={biz.description}
              onChange={e => setBiz({ ...biz, description: e.target.value })}
              placeholder="Apresente sua proposta de valor e diferenciais aos clientes..."
            />
          </label>
        </div>

        {/* Section 2: Operating Hours */}
        <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
          <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>Horário de funcionamento</h2>
          <p style={{ color: 'var(--muted)', fontSize: '.84rem', marginBottom: '1.25rem' }}>
            Marque os dias de atendimento e configure os horários de início e término.
          </p>

          {DIAS.map((nome, i) => (
            <div className="dia" key={nome}>
              <label className="check" style={{ cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={dias[i].on}
                  onChange={e => setDia(i, { on: e.target.checked })}
                />
                {nome}
              </label>
              {dias[i].on ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
                  <input
                    type="time"
                    aria-label={`${nome}: abertura`}
                    value={dias[i].start}
                    onChange={e => setDia(i, { start: e.target.value })}
                  />
                  <span style={{ color: 'var(--muted)', fontSize: '.84rem' }}>às</span>
                  <input
                    type="time"
                    aria-label={`${nome}: fechamento`}
                    value={dias[i].end}
                    onChange={e => setDia(i, { end: e.target.value })}
                  />
                </div>
              ) : (
                <span className="badge badge-muted">Fechado</span>
              )}
            </div>
          ))}
        </div>

        {/* Section 3: Scheduling Rules */}
        <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
          <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>Regras de agendamento</h2>
          <div className="row2">
            <label>
              Intervalo entre horários (minutos)
              <input
                type="number"
                min={5}
                step={5}
                value={cfg.slot_step_min}
                onChange={e => setCfg({ ...cfg, slot_step_min: Number(e.target.value) })}
              />
            </label>
            <label>
              Prazo limite para cancelamento (horas antes)
              <input
                type="number"
                min={0}
                value={cfg.min_cancel_hours}
                onChange={e => setCfg({ ...cfg, min_cancel_hours: Number(e.target.value) })}
              />
            </label>
          </div>
        </div>

        {msg && (
          <p
            role="alert"
            className="msg"
            style={{
              margin: '0 0 1rem',
              background: msg.includes('sucesso') ? 'var(--ok-lt)' : 'var(--err-lt)',
              color: msg.includes('sucesso') ? 'var(--ok)' : 'var(--err)',
              borderLeftColor: msg.includes('sucesso') ? 'var(--ok)' : 'var(--err)',
            }}
          >
            {msg}
          </p>
        )}

        <div className="actions">
          <button className="btn" disabled={busy}>
            {busy ? 'Salvando...' : 'Salvar configurações'}
          </button>
        </div>
      </form>
    </>
  )
}
