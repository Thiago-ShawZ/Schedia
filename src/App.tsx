import { Suspense, lazy, useEffect, useState } from 'react'
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, RequireAuth, RequireApprover, useAuth } from './auth/AuthContext'
import { ThemeProvider, useTheme } from './lib/theme'
import { supabase } from './lib/supabase'
import Landing from './pages/Landing'
const Auth = lazy(() => import('./pages/Auth'))
const Inicio = lazy(() => import('./pages/Inicio'))
const Hub = lazy(() => import('./pages/Hub'))
const Negocio = lazy(() => import('./pages/Negocio'))
const PainelLayout = lazy(() => import('./pages/Painel').then(m => ({ default: m.PainelLayout })))
const PainelSeletor = lazy(() => import('./pages/Painel').then(m => ({ default: m.PainelSeletor })))
const NovoNegocio = lazy(() => import('./pages/NovoNegocio'))
const CatalogoCrud = lazy(() => import('./pages/CatalogoCrud'))
const Configuracoes = lazy(() => import('./pages/Configuracoes'))
const Agenda = lazy(() => import('./pages/Agenda'))
const Bloqueios = lazy(() => import('./pages/Bloqueios'))
const MeusAgendamentos = lazy(() => import('./pages/MeusAgendamentos'))
const Perfil = lazy(() => import('./pages/Perfil'))
const RedefinirSenha = lazy(() => import('./pages/RedefinirSenha'))
const Aprovadores = lazy(() => import('./pages/Aprovadores'))
import {
  BrandLogoMark,
  SearchIcon,
  CalendarIcon,
  BuildingIcon,
  UserIcon,
  LogOutIcon,
  ShieldCheckIcon,
} from './components/Icons'

/** Ícone sol para tema claro */
function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  )
}

/** Ícone lua para tema escuro */
function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function ThemeToggleBtn({ className = 'theme-toggle' }: { className?: string }) {
  const { theme, toggle } = useTheme()
  return (
    <button
      className={className}
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}

function Header() {
  const { session, isApprover } = useAuth()
  const [open, setOpen] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const close = () => setOpen(false)

  const uid = session?.user?.id
  useEffect(() => {
    if (!uid) {
      setAvatarUrl(null)
      return
    }
    let off = false
    supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', uid)
      .maybeSingle()
      .then(({ data }) => {
        if (!off && data?.avatar_url) setAvatarUrl(data.avatar_url)
      })
    return () => {
      off = true
    }
  }, [uid])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    if (open) {
      document.body.style.overflow = 'hidden'
      window.addEventListener('keydown', handleKeyDown)
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <>
      <header className="top">
        <Link to="/" className="brand" onClick={close}>
          <BrandLogoMark size={28} />
          <span>Schedia</span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="top-nav" aria-label="Principal">
          {session ? (
            <>
              <NavLink to="/hub">Descobrir</NavLink>
              <NavLink to="/agendamentos">Agendamentos</NavLink>
              <NavLink to="/painel">Meus Negócios</NavLink>
              {isApprover && <NavLink to="/aprovadores">Aprovadores</NavLink>}
              <NavLink to="/perfil" style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem' }}>
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="Perfil"
                    style={{ width: '22px', height: '22px', borderRadius: '50%', objectFit: 'cover' }}
                  />
                ) : null}
                <span>Perfil</span>
              </NavLink>
              <button
                className="btn ghost sm"
                style={{ marginLeft: '.5rem', padding: '.32rem .75rem' }}
                onClick={() => supabase.auth.signOut()}
              >
                Sair
              </button>
            </>
          ) : (
            <Link to="/entrar" className="btn sm">
              Entrar
            </Link>
          )}
        </nav>

        {/* Theme toggle + Mobile Hamburger */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem', flexShrink: 0 }}>
          <ThemeToggleBtn />
          <button
            className="nav-toggle"
            aria-label={open ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {open ? (
                <path d="M18 6L6 18M6 6l12 12" />
              ) : (
                <path d="M3 12h18M3 6h18M3 18h18" />
              )}
            </svg>
          </button>
        </div>
      </header>

      {/* Mobile Drawer */}
      <div className={`mobile-drawer ${open ? 'open' : ''}`} role="dialog" aria-modal="true" aria-label="Menu de navegação">
        <div className="mobile-overlay" onClick={close} />
        <div className="mobile-menu">
          <div className="mobile-menu-header">
            <span className="brand" style={{ fontSize: '1.05rem' }}>
              <BrandLogoMark size={24} />
              <span>Schedia</span>
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem' }}>
              <ThemeToggleBtn />
              <button className="icon-btn" onClick={close} aria-label="Fechar menu">
                ✕
              </button>
            </div>
          </div>

          {session ? (
            <>
              <NavLink to="/hub" onClick={close}>
                <SearchIcon size={17} style={{ color: 'var(--muted)' }} />
                <span>Descobrir Negócios</span>
              </NavLink>
              <NavLink to="/agendamentos" onClick={close}>
                <CalendarIcon size={17} style={{ color: 'var(--muted)' }} />
                <span>Meus Agendamentos</span>
              </NavLink>
              <NavLink to="/painel" onClick={close}>
                <BuildingIcon size={17} style={{ color: 'var(--muted)' }} />
                <span>Gestão / Negócios</span>
              </NavLink>
              {isApprover && (
                <NavLink to="/aprovadores" onClick={close}>
                  <ShieldCheckIcon size={17} style={{ color: 'var(--muted)' }} />
                  <span>Aprovadores</span>
                </NavLink>
              )}
              <NavLink to="/perfil" onClick={close}>
                <UserIcon size={17} style={{ color: 'var(--muted)' }} />
                <span>Meu Perfil</span>
              </NavLink>
              <div className="divider" style={{ margin: '.5rem 0' }} />
              <button
                className="menu-link"
                onClick={() => {
                  close()
                  supabase.auth.signOut()
                }}
              >
                <LogOutIcon size={17} style={{ color: 'var(--muted)' }} />
                <span>Sair da conta</span>
              </button>
            </>
          ) : (
            <>
              <NavLink to="/" onClick={close}>
                Início
              </NavLink>
              <Link to="/entrar" className="btn" style={{ marginTop: '1rem' }} onClick={close}>
                Entrar ou Cadastrar
              </Link>
            </>
          )}
        </div>
      </div>
    </>
  )
}

const guard = (el: JSX.Element) => <RequireAuth>{el}</RequireAuth>

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <Header />
          <Suspense fallback={<div className="center" style={{ paddingTop: '4rem' }}><div className="spinner" /></div>}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/n/:slug" element={<Negocio />} />
            <Route path="/entrar" element={<Auth />} />
            <Route path="/inicio" element={guard(<Inicio />)} />
            <Route path="/hub" element={guard(<Hub />)} />
            <Route path="/agendamentos" element={guard(<MeusAgendamentos />)} />
            <Route path="/perfil" element={guard(<Perfil />)} />
            <Route path="/redefinir-senha" element={<RedefinirSenha />} />
            <Route path="/aprovadores" element={<RequireApprover><Aprovadores /></RequireApprover>} />
            <Route path="/painel" element={guard(<PainelSeletor />)} />
            <Route path="/painel/novo" element={guard(<NovoNegocio />)} />
            <Route path="/painel/:id" element={guard(<PainelLayout />)}>
              <Route index element={<Navigate to="agenda" replace />} />
              <Route path="agenda" element={<Agenda />} />
              <Route path="bloqueios" element={<Bloqueios />} />
              <Route path="servicos" element={<CatalogoCrud key="s" table="services" />} />
              <Route path="produtos" element={<CatalogoCrud key="p" table="products" />} />
              <Route path="configuracoes" element={<Configuracoes />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
