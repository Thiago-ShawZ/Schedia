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
  businesses: { name: string; slug: string; city: string | null; logo_url?: string | null } | null
}

export function PainelSeletor() {
  const [items, setItems] = useState<M[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('business_memberships')
      .select('business_id,role,businesses(name,slug,city,logo_url)')
      .eq('status', 'active')
      .then(({ data }) => {
        setItems((data as unknown as M[]) ?? [])
        setLoading(false)
      })
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
          {items.map(m => (
            <Link
              className="card"
              key={m.business_id}
              to={`/painel/${m.business_id}`}
              style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem' }}>
                  <span className="badge badge-info">
                    {m.role === 'owner' ? 'Proprietário' : m.role}
                  </span>
                  {m.businesses?.city && (
                    <small style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '.25rem', fontSize: '.78rem' }}>
                      <LocationIcon size={12} />
                      {m.businesses.city}
                    </small>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '.85rem', alignItems: 'center' }}>
                  <div className="avatar" style={{ width: '42px', height: '42px', fontSize: '1rem' }}>
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
                </div>
              </div>

              <div style={{ marginTop: '1.25rem', paddingTop: '.75rem', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '.84rem', color: 'var(--primary)', fontWeight: 600 }}>
                  Acessar painel →
                </span>
              </div>
            </Link>
          ))}
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
