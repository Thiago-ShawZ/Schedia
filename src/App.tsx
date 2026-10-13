import { useState } from 'react'
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, RequireAuth, useAuth } from './auth/AuthContext'
import { supabase } from './lib/supabase'
import Landing from './pages/Landing'
import Auth from './pages/Auth'
import Inicio from './pages/Inicio'
import Hub from './pages/Hub'
import Negocio from './pages/Negocio'
import { PainelLayout, PainelSeletor } from './pages/Painel'
import NovoNegocio from './pages/NovoNegocio'
import CatalogoCrud from './pages/CatalogoCrud'
import Configuracoes from './pages/Configuracoes'
import Agenda from './pages/Agenda'
import Bloqueios from './pages/Bloqueios'
import MeusAgendamentos from './pages/MeusAgendamentos'
import Perfil from './pages/Perfil'
import RedefinirSenha from './pages/RedefinirSenha'

function Header() {
  const { session } = useAuth()
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  return (
    <>
      <header className="top">
        <Link to="/" className="brand" onClick={close}>
          <span style={{ fontSize: '1.25rem' }}>📅</span> Schedia
        </Link>

        {/* Desktop Navigation */}
        <nav className="top-nav" aria-label="Principal">
          {session ? (
            <>
              <NavLink to="/hub">Descobrir</NavLink>
              <NavLink to="/agendamentos">Agendamentos</NavLink>
              <NavLink to="/painel">Meus Negócios</NavLink>
              <NavLink to="/perfil">Perfil</NavLink>
              <button
                className="btn ghost sm"
                style={{ marginLeft: '.5rem', padding: '.3rem .75rem' }}
                onClick={() => supabase.auth.signOut()}
              >
                Sair
              </button>
            </>
          ) : (
            <>
              <Link to="/entrar" className="btn sm">
                Entrar
              </Link>
            </>
          )}
        </nav>

        {/* Mobile Hamburger Button */}
        <button
          className="nav-toggle"
          aria-label={open ? 'Fechar menu' : 'Abrir menu'}
          onClick={() => setOpen(!open)}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {open ? (
              <path d="M18 6L6 18M6 6l12 12" />
            ) : (
              <path d="M3 12h18M3 6h18M3 18h18" />
            )}
          </svg>
        </button>
      </header>

      {/* Mobile Drawer */}
      <div className={`mobile-drawer ${open ? 'open' : ''}`}>
        <div className="mobile-overlay" onClick={close} />
        <div className="mobile-menu">
          <div className="mobile-menu-header">
            <span className="brand" style={{ fontSize: '1.1rem' }}>
              <span>📅</span> Schedia
            </span>
            <button className="icon-btn" onClick={close} aria-label="Fechar">
              ✕
            </button>
          </div>

          {session ? (
            <>
              <NavLink to="/hub" onClick={close}>
                🔍 Descobrir Negócios
              </NavLink>
              <NavLink to="/agendamentos" onClick={close}>
                🗓️ Meus Agendamentos
              </NavLink>
              <NavLink to="/painel" onClick={close}>
                💼 Gestão / Meus Negócios
              </NavLink>
              <NavLink to="/perfil" onClick={close}>
                👤 Meu Perfil
              </NavLink>
              <div className="divider" style={{ margin: '.5rem 0' }} />
              <button
                className="menu-link"
                onClick={() => {
                  close()
                  supabase.auth.signOut()
                }}
              >
                🚪 Sair da conta
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
      <AuthProvider>
        <Header />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/n/:slug" element={<Negocio />} />
          <Route path="/entrar" element={<Auth />} />
          <Route path="/inicio" element={guard(<Inicio />)} />
          <Route path="/hub" element={guard(<Hub />)} />
          <Route path="/agendamentos" element={guard(<MeusAgendamentos />)} />
          <Route path="/perfil" element={guard(<Perfil />)} />
          <Route path="/redefinir-senha" element={<RedefinirSenha />} />
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
      </AuthProvider>
    </BrowserRouter>
  )
}
