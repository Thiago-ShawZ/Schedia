import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { brl, normalizeWhatsAppPhone } from '../lib/format'
import Reserva, { type Cfg } from '../components/Reserva'
import { LocationIcon, ClockIcon, BuildingIcon, WhatsAppIcon } from '../components/Icons'

type Biz = {
  id: string
  name: string
  description: string | null
  city: string | null
  logo_url?: string | null
  phone?: string | null
  categories: { name: string } | null
}
type Item = {
  id: string
  name: string
  description: string | null
  price_cents: number
  duration_min: number
}
type Prod = {
  id: string
  name: string
  description: string | null
  price_cents: number
}

export default function Negocio() {
  const { slug } = useParams()
  const [state, setState] = useState<'load' | 'ok' | 'none'>('load')
  const [biz, setBiz] = useState<Biz | null>(null)
  const [svcs, setSvcs] = useState<Item[]>([])
  const [prods, setProds] = useState<Prod[]>([])
  const [cfg, setCfg] = useState<Cfg | null>(null)
  const [sel, setSel] = useState<Item | null>(null)

  useEffect(() => {
    ;(async () => {
      const { data: b } = await supabase
        .from('businesses')
        .select('id,name,description,city,logo_url,phone,categories(name)')
        .eq('slug', slug)
        .eq('is_published', true)
        .maybeSingle()
      if (!b) return setState('none')
      const [s, p, c] = await Promise.all([
        supabase
          .from('services')
          .select('id,name,description,price_cents,duration_min')
          .eq('business_id', b.id)
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('products')
          .select('id,name,description,price_cents')
          .eq('business_id', b.id)
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('business_settings')
          .select('timezone,opening_hours,slot_step_min,min_cancel_hours')
          .eq('business_id', b.id)
          .single(),
      ])
      setBiz(b as unknown as Biz)
      setSvcs(s.data ?? [])
      setProds(p.data ?? [])
      setCfg(c.data)
      setState('ok')
    })()
  }, [slug])

  if (state === 'load') {
    return (
      <div className="center" style={{ paddingTop: '4rem' }}>
        <div className="spinner" />
        <p style={{ marginTop: '.75rem', fontSize: '.88rem' }}>Carregando dados do estabelecimento...</p>
      </div>
    )
  }

  if (state === 'none' || !biz) {
    return (
      <main className="narrow" style={{ textAlign: 'center', paddingTop: '4rem' }}>
        <div style={{ display: 'inline-flex', padding: '1rem', background: 'var(--bg-sub)', borderRadius: '50%', color: 'var(--muted)', marginBottom: '.75rem' }}>
          <BuildingIcon size={36} />
        </div>
        <h1 style={{ marginTop: '.5rem', fontSize: '1.35rem' }}>Negócio não encontrado</h1>
        <p style={{ color: 'var(--muted)', fontSize: '.88rem' }}>
          Este estabelecimento não existe ou não está publicado no momento.
        </p>
        <Link className="btn" to="/hub" style={{ marginTop: '1rem' }}>
          Voltar ao Hub de Negócios
        </Link>
      </main>
    )
  }

  return (
    <main>
      {/* Business Header Profile Card */}
      <div className="card" style={{ marginBottom: '1.75rem', padding: '1.75rem 1.5rem' }}>
        <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div className="avatar" style={{ width: '68px', height: '68px', fontSize: '1.75rem' }}>
            {biz.logo_url ? (
              <img src={biz.logo_url} alt={biz.name} className="avatar-img" />
            ) : (
              biz.name.charAt(0).toUpperCase()
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '.35rem' }}>
              <span className="badge badge-info">
                {biz.categories?.name ?? 'Estabelecimento'}
              </span>
              {biz.city && (
                <span className="badge badge-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem' }}>
                  <LocationIcon size={12} />
                  {biz.city}
                </span>
              )}
              {biz.phone && normalizeWhatsAppPhone(biz.phone) && (
                <a
                  href={`https://wa.me/${normalizeWhatsAppPhone(biz.phone)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="badge badge-ok"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem', textDecoration: 'none' }}
                >
                  <WhatsAppIcon size={12} />
                  <span>{biz.phone}</span>
                </a>
              )}
            </div>
            <h1 style={{ margin: '0 0 .5rem', fontSize: '1.55rem' }}>{biz.name}</h1>
            {biz.description && (
              <p style={{ color: 'var(--muted)', fontSize: '.9rem', margin: 0, lineHeight: 1.55 }}>
                {biz.description}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Booking Form (when item selected) or Catalog */}
      {sel && cfg ? (
        <Reserva
          bizId={biz.id}
          bizName={biz.name}
          bizPhone={biz.phone}
          svc={sel}
          cfg={cfg}
          onClose={() => setSel(null)}
        />
      ) : (
        <>
          <div className="sec-hdr">
            <h2>Serviços disponíveis ({svcs.length})</h2>
          </div>

          <ul className="list">
            {svcs.length === 0 && (
              <li className="card center">
                Nenhum serviço disponível para agendamento no momento.
              </li>
            )}
            {svcs.map(s => (
              <li
                key={s.id}
                className="service-card-item"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '1rem',
                  padding: '1.1rem 1.25rem',
                }}
              >
                <div style={{ flex: 1 }}>
                  <strong style={{ fontSize: '1.05rem' }}>{s.name}</strong>
                  {s.description && (
                    <p style={{ color: 'var(--muted)', fontSize: '.84rem', margin: '.2rem 0' }}>
                      {s.description}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center', marginTop: '.35rem', flexWrap: 'wrap' }}>
                    <span className="badge badge-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem' }}>
                      <ClockIcon size={12} />
                      {s.duration_min} min
                    </span>
                    <span style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '.95rem' }}>
                      {brl(s.price_cents)}
                    </span>
                  </div>
                </div>
                <button
                  className="btn"
                  onClick={() => setSel(s)}
                  style={{ minWidth: '110px' }}
                >
                  Agendar
                </button>
              </li>
            ))}
          </ul>

          {prods.length > 0 && (
            <div style={{ marginTop: '2.5rem' }}>
              <div className="sec-hdr">
                <h2>Produtos no local ({prods.length})</h2>
              </div>
              <ul className="list">
                {prods.map(p => (
                  <li key={p.id} style={{ padding: '1rem 1.25rem' }}>
                    <div style={{ flex: 1 }}>
                      <strong style={{ fontSize: '1rem' }}>{p.name}</strong>
                      {p.description && (
                        <p style={{ color: 'var(--muted)', fontSize: '.84rem', margin: '.2rem 0' }}>
                          {p.description}
                        </p>
                      )}
                      <div style={{ marginTop: '.35rem', fontWeight: 700, color: 'var(--fg)', fontSize: '.9rem' }}>
                        {brl(p.price_cents)}
                      </div>
                    </div>
                    <span className="badge badge-muted" style={{ fontSize: '.75rem' }}>
                      Venda no local
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </main>
  )
}
