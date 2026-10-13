import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type M = {
  business_id: string
  role: string
  businesses: { name: string; slug: string; city: string | null } | null
}

export function PainelSeletor() {
  const [items, setItems] = useState<M[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('business_memberships')
      .select('business_id,role,businesses(name,slug,city)')
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
            Gerencie seus estabelecimentos, serviços, produtos e agenda.
          </p>
        </div>
        <Link className="btn" to="/painel/novo">
          + Criar novo negócio
        </Link>
      </div>

      {loading ? (
        <div className="center">
          <div className="spinner" />
          <p style={{ marginTop: '.75rem' }}>Carregando seus estabelecimentos...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="card empty">
          <span className="empty-icon">🏪</span>
          <h2>Você ainda não gerencia nenhum negócio</h2>
          <p>Crie seu primeiro estabelecimento para começar a receber agendamentos de clientes.</p>
          <Link className="btn" to="/painel/novo" style={{ marginTop: '1rem' }}>
            Cadastrar meu negócio agora
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
                    <small style={{ color: 'var(--muted)' }}>📍 {m.businesses.city}</small>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '.85rem', alignItems: 'center' }}>
                  <div className="avatar" style={{ width: '40px', height: '40px', fontSize: '1rem' }}>
                    {m.businesses?.name?.charAt(0) ?? 'B'}
                  </div>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{m.businesses?.name}</h2>
                    <small style={{ color: 'var(--muted)' }}>schedia.app/n/{m.businesses?.slug}</small>
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
  { path: 'agenda', label: 'Agenda', icon: '🗓️' },
  { path: 'servicos', label: 'Serviços', icon: '✂️' },
  { path: 'produtos', label: 'Produtos', icon: '🛍️' },
  { path: 'bloqueios', label: 'Bloqueios', icon: '⛔' },
  { path: 'configuracoes', label: 'Configurações', icon: '⚙️' },
]

export function PainelLayout() {
  const { id } = useParams()
  const [biz, setBiz] = useState<{ name: string; slug: string } | null>(null)
  const [found, setFound] = useState<boolean | null>(null)

  useEffect(() => {
    supabase
      .from('businesses')
      .select('name,slug')
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
        <span style={{ fontSize: '3rem' }}>⚠️</span>
        <h1>Negócio não encontrado</h1>
        <p style={{ color: 'var(--muted)' }}>Ele não existe ou você não tem permissão para acessá-lo.</p>
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
        {navItems.map(item => (
          <NavLink key={item.path} to={item.path}>
            <span style={{ marginRight: '.3rem' }}>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
        {biz?.slug && (
          <a href={`/n/${biz.slug}`} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>
            👁️ Ver página pública
          </a>
        )}
      </nav>

      <div className="panel-layout">
        {/* Desktop Dedicated Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-header">
            <Link to="/painel" className="sidebar-back">
              ← Meus Negócios
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', marginTop: '.35rem' }}>
              <div className="avatar" style={{ width: '36px', height: '36px', fontSize: '.9rem' }}>
                {biz?.name?.charAt(0) ?? 'N'}
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="sidebar-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {biz?.name || 'Carregando...'}
                </div>
                <small style={{ fontSize: '.72rem', color: 'var(--muted)' }}>Painel Administrativo</small>
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
                👁️ Ver página pública ↗
              </a>
            )}
          </div>

          <nav className="sidebar-nav" aria-label="Navegação administrativa">
            {navItems.map(item => (
              <NavLink key={item.path} to={item.path}>
                <span style={{ fontSize: '1rem' }}>{item.icon}</span>
                <span>{item.label}</span>
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
