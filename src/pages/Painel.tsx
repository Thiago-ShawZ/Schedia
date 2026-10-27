import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  CalendarIcon,
  ScissorsIcon,
  ShoppingBagIcon,
  BanIcon,
  SettingsIcon,
  ExternalLinkIcon,
  BuildingIcon,
  ArrowLeftIcon,
  LocationIcon,
} from '../components/Icons'

type M = {
  business_id: string
  role: string
  businesses: {
    name: string
    slug: string
    city: string | null
    logo_url?: string | null
    approval_status?: 'pending' | 'approved' | 'rejected'
    is_published?: boolean
  } | null
  application?: {
    id: string
    status: string
    review_comment: string | null
  } | null
}

export function PainelSeletor() {
  const [items, setItems] = useState<M[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const { data: mems } = await supabase
        .from('business_memberships')
        .select('business_id,role,businesses(name,slug,city,logo_url,approval_status,is_published)')
        .eq('status', 'active')

      if (mems && mems.length > 0) {
        const bizIds = mems.map((m: any) => m.business_id)
        const { data: apps } = await supabase
          .from('business_applications')
          .select('id,business_id,status,review_comment,created_at')
          .in('business_id', bizIds)
          .order('created_at', { ascending: false })

        const appMap = new Map<string, any>()
        if (apps) {
          for (const a of apps) {
            if (!appMap.has(a.business_id)) {
              appMap.set(a.business_id, a)
            }
          }
        }

        const merged: M[] = mems.map((m: any) => ({
          business_id: m.business_id,
          role: m.role,
          businesses: m.businesses,
          application: appMap.get(m.business_id) || null,
        }))
        setItems(merged)
      } else {
        setItems([])
      }
      setLoading(false)
    })()
  }, [])

  return (
    <main>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>Painel de Gestão</h1>
          <p style={{ color: 'var(--muted)', fontSize: '.9rem', margin: '.25rem 0 0' }}>
            Gerencie seus estabelecimentos, equipe, catálogo e agenda.
          </p>
        </div>
        <Link className="btn" to="/painel/novo">
          + Cadastrar negócio
        </Link>
      </div>

      {loading ? (
        <div className="center">
          <div className="spinner" />
          <p style={{ marginTop: '.75rem', fontSize: '.88rem' }}>Carregando estabelecimentos...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="card empty">
          <div style={{ display: 'inline-flex', padding: '1rem', background: 'var(--bg-sub)', borderRadius: '50%', color: 'var(--muted)', marginBottom: '.75rem' }}>
            <BuildingIcon size={32} />
          </div>
          <h2>Você ainda não gerencia nenhum negócio</h2>
          <p style={{ maxWidth: '420px', margin: '.25rem auto 1rem' }}>
            Crie seu primeiro estabelecimento para disponibilizar serviços e receber agendamentos.
          </p>
          <Link className="btn" to="/painel/novo">
            Cadastrar meu negócio
          </Link>
        </div>
      ) : (
        <section className="grid">
          {items.map(m => {
            const status = m.businesses?.approval_status ?? 'approved'
            const isApproved = status === 'approved'
            const isRejected = status === 'rejected'
            const isPending = status === 'pending'
            const hasApp = !!m.application

            return (
              <div
                className="card"
                key={m.business_id}
                style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '1rem' }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem', flexWrap: 'wrap', gap: '.4rem' }}>
                    <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
                      <span className="badge badge-info">
                        {m.role === 'owner' ? 'Proprietário' : m.role}
                      </span>
                      {isApproved ? (
                        <span className="badge badge-ok">Aprovado</span>
                      ) : isRejected ? (
                        <span className="badge badge-danger">Reprovado</span>
                      ) : hasApp ? (
                        <span className="badge badge-info">Em análise</span>
                      ) : (
                        <span className="badge badge-warning">Incompleto</span>
                      )}
                    </div>
                    {m.businesses?.city && (
                      <small style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '.25rem', fontSize: '.78rem' }}>
                        <LocationIcon size={12} />
                        {m.businesses.city}
                      </small>
                    )}
                  </div>

                  <Link to={`/painel/${m.business_id}`} style={{ display: 'flex', gap: '.85rem', alignItems: 'center', textDecoration: 'none', color: 'inherit' }}>
                    <div className="avatar" style={{ width: '42px', height: '42px', fontSize: '1rem', flexShrink: 0 }}>
                      {m.businesses?.logo_url ? (
                        <img src={m.businesses.logo_url} alt={m.businesses.name} className="avatar-img" loading="lazy" decoding="async" />
                      ) : (
                        m.businesses?.name?.charAt(0) ?? 'B'
                      )}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <h2 style={{ margin: 0, fontSize: '1.05rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {m.businesses?.name}
                      </h2>
                      <small style={{ color: 'var(--muted)', fontSize: '.78rem' }}>
                        schedia.app/n/{m.businesses?.slug}
                      </small>
                    </div>
                  </Link>

                  {/* Alerta de reprovação */}
                  {isRejected && (
                    <div
                      style={{
                        marginTop: '.85rem',
                        padding: '.65rem .8rem',
                        borderRadius: 'var(--r-md)',
                        background: 'rgba(239, 68, 68, 0.08)',
                        border: '1px solid #f87171',
                        fontSize: '.78rem',
                      }}
                    >
                      <strong style={{ color: '#dc2626' }}>Cadastro reprovado:</strong>
                      <p style={{ margin: '.2rem 0 .5rem', color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
                        {m.application?.review_comment || 'Verifique as pendências apontadas pela equipe.'}
                      </p>
                      <Link to={`/painel/${m.business_id}/analise`} className="btn sm" style={{ padding: '.25rem .6rem', fontSize: '.75rem' }}>
                        Corrigir e reenviar →
                      </Link>
                    </div>
                  )}

                  {/* Alerta de incompleto */}
                  {isPending && !hasApp && (
                    <div
                      style={{
                        marginTop: '.85rem',
                        padding: '.65rem .8rem',
                        borderRadius: 'var(--r-md)',
                        background: 'rgba(245, 158, 11, 0.08)',
                        border: '1px solid #fbbf24',
                        fontSize: '.78rem',
                      }}
                    >
                      <strong style={{ color: '#b45309' }}>Complete o envio para análise:</strong>
                      <p style={{ margin: '.2rem 0 .5rem', color: 'var(--text)' }}>
                        Envie fotos e endereço para que o Schedia possa avaliar seu negócio.
                      </p>
                      <Link to={`/painel/${m.business_id}/analise`} className="btn sm" style={{ padding: '.25rem .6rem', fontSize: '.75rem' }}>
                        Completar envio →
                      </Link>
                    </div>
                  )}
                </div>

                <div style={{ paddingTop: '.75rem', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Link to={`/painel/${m.business_id}`} style={{ fontSize: '.84rem', color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>
                    Acessar painel →
                  </Link>
                </div>
              </div>
            )
          })}
        </section>
      )}
    </main>
  )
}


const navItems = [
  { path: 'agenda', label: 'Agenda', Icon: CalendarIcon },
  { path: 'servicos', label: 'Serviços', Icon: ScissorsIcon },
  { path: 'produtos', label: 'Produtos', Icon: ShoppingBagIcon },
  { path: 'bloqueios', label: 'Bloqueios', Icon: BanIcon },
  { path: 'configuracoes', label: 'Configurações', Icon: SettingsIcon },
]

export function PainelLayout() {
  const { id } = useParams()
  const [biz, setBiz] = useState<{ name: string; slug: string; logo_url?: string | null } | null>(null)
  const [found, setFound] = useState<boolean | null>(null)

  useEffect(() => {
    supabase
      .from('businesses')
      .select('name,slug,logo_url')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (data) {
          setBiz(data)
          setFound(true)
        } else {
          setFound(false)
        }
      })
  }, [id])

  if (found === false) {
    return (
      <main className="narrow" style={{ textAlign: 'center', paddingTop: '3rem' }}>
        <div style={{ display: 'inline-flex', padding: '1rem', background: 'var(--bg-sub)', borderRadius: '50%', color: 'var(--muted)', marginBottom: '.75rem' }}>
          <BuildingIcon size={36} />
        </div>
        <h1>Negócio não encontrado</h1>
        <p style={{ color: 'var(--muted)', fontSize: '.88rem' }}>
          Ele não existe ou você não tem permissão para acessá-lo.
        </p>
        <Link className="btn" to="/painel" style={{ marginTop: '1rem' }}>
          Voltar aos meus negócios
        </Link>
      </main>
    )
  }

  return (
    <div className="panel-wrap">
      {/* Mobile Horizontal Navigation Tabs */}
      <nav className="panel-mobile-nav" aria-label="Seções do painel">
        {navItems.map(({ path, label, Icon }) => (
          <NavLink key={path} to={path} style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem' }}>
            <Icon size={14} />
            <span>{label}</span>
          </NavLink>
        ))}
        {biz?.slug && (
          <a
            href={`/n/${biz.slug}`}
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '.3rem' }}
          >
            <span>Página pública</span>
            <ExternalLinkIcon size={13} />
          </a>
        )}
      </nav>

      <div className="panel-layout">
        {/* Desktop Dedicated Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-header">
            <Link to="/painel" className="sidebar-back">
              <ArrowLeftIcon size={13} />
              <span>Meus Negócios</span>
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.65rem', marginTop: '.35rem' }}>
              <div className="avatar" style={{ width: '38px', height: '38px', fontSize: '.95rem' }}>
                {biz?.logo_url ? (
                  <img src={biz.logo_url} alt={biz.name} className="avatar-img" loading="lazy" decoding="async" />
                ) : (
                  biz?.name?.charAt(0) ?? 'N'
                )}
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="sidebar-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {biz?.name || 'Carregando...'}
                </div>
                <small style={{ fontSize: '.72rem', color: 'var(--muted)' }}>Painel de Gestão</small>
              </div>
            </div>
            {biz?.slug && (
              <a
                href={`/n/${biz.slug}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '.35rem',
                  fontSize: '.75rem',
                  color: 'var(--primary)',
                  marginTop: '.6rem',
                  fontWeight: 600,
                }}
              >
                <span>Ver página pública</span>
                <ExternalLinkIcon size={12} />
              </a>
            )}
          </div>

          <nav className="sidebar-nav" aria-label="Navegação administrativa">
            {navItems.map(({ path, label, Icon }) => (
              <NavLink key={path} to={path}>
                <Icon size={16} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
        </aside>

        {/* Panel Viewport */}
        <main className="panel-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
