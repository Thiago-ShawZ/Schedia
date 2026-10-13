import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const ERROS: Record<string, string> = {
  'Invalid login credentials': 'E-mail ou senha incorretos.',
  'User already registered': 'Este e-mail já está cadastrado.',
  'Email not confirmed': 'Confirme seu e-mail antes de entrar.',
}

export default function AuthForm({ onSuccess }: { onSuccess?: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [isSuccess, setIsSuccess] = useState(false)
  const [busy, setBusy] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    setIsSuccess(false)
    const { data, error } =
      mode === 'login'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { data: { full_name: name.trim() } },
          })
    setBusy(false)
    if (error) {
      return setMsg(
        ERROS[error.message] ??
          (/password/i.test(error.message)
            ? 'Senha inválida. Use ao menos 8 caracteres.'
            : 'Não foi possível concluir. Tente novamente.')
      )
    }
    if (!data.session) {
      setIsSuccess(true)
      return setMsg('Conta criada com sucesso! Verifique seu e-mail para confirmar.')
    }
    onSuccess?.()
  }

  async function esqueci(e: FormEvent) {
    e.preventDefault()
    if (!email) return setMsg('Digite seu e-mail para receber as instruções.')
    setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/redefinir-senha`,
    })
    setBusy(false)
    if (error) {
      setMsg('Não foi possível enviar o link. Verifique o e-mail digitado.')
    } else {
      setIsSuccess(true)
      setMsg('Enviamos um link de recuperação para o seu e-mail.')
      setForgotOpen(false)
    }
  }

  return (
    <div className="card" style={{ padding: '2rem 1.75rem', boxShadow: 'var(--sh-md)' }}>
      {/* Tab Segmented Control */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          background: 'var(--bg-sub)',
          padding: '4px',
          borderRadius: 'var(--r-sm)',
          marginBottom: '1.5rem',
          gap: '4px',
        }}
      >
        <button
          type="button"
          onClick={() => {
            setMode('login')
            setMsg('')
            setForgotOpen(false)
          }}
          style={{
            padding: '.55rem',
            borderRadius: 'var(--r-sm)',
            border: 'none',
            cursor: 'pointer',
            fontSize: '.88rem',
            fontWeight: 600,
            background: mode === 'login' ? 'var(--card)' : 'transparent',
            color: mode === 'login' ? 'var(--fg)' : 'var(--muted)',
            boxShadow: mode === 'login' ? 'var(--sh)' : 'none',
            transition: 'all var(--tr)',
          }}
        >
          Entrar
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('signup')
            setMsg('')
            setForgotOpen(false)
          }}
          style={{
            padding: '.55rem',
            borderRadius: 'var(--r-sm)',
            border: 'none',
            cursor: 'pointer',
            fontSize: '.88rem',
            fontWeight: 600,
            background: mode === 'signup' ? 'var(--card)' : 'transparent',
            color: mode === 'signup' ? 'var(--fg)' : 'var(--muted)',
            boxShadow: mode === 'signup' ? 'var(--sh)' : 'none',
            transition: 'all var(--tr)',
          }}
        >
          Criar conta
        </button>
      </div>

      <div style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: '1.35rem', margin: 0 }}>
          {forgotOpen
            ? 'Recuperar senha'
            : mode === 'login'
            ? 'Acesse sua conta'
            : 'Comece no Schedia'}
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: '.85rem', marginTop: '.25rem' }}>
          {forgotOpen
            ? 'Informe seu e-mail para receber o link de redefinição'
            : mode === 'login'
            ? 'Entre para agendar serviços ou gerenciar sua empresa'
            : 'Crie seu perfil em segundos'}
        </p>
      </div>

      {msg && (
        <div
          role="alert"
          className="msg"
          style={{
            marginBottom: '1rem',
            background: isSuccess ? 'var(--ok-lt)' : 'var(--err-lt)',
            color: isSuccess ? 'var(--ok)' : 'var(--err)',
            borderLeftColor: isSuccess ? 'var(--ok)' : 'var(--err)',
          }}
        >
          {msg}
        </div>
      )}

      {forgotOpen ? (
        <form onSubmit={esqueci} className="form" style={{ margin: 0 }}>
          <label>
            E-mail cadastrado
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              autoComplete="email"
            />
          </label>
          <div className="actions" style={{ marginTop: '.5rem', display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
            <button className="btn" style={{ width: '100%' }} disabled={busy}>
              {busy ? 'Enviando link...' : 'Enviar link de recuperação'}
            </button>
            <button
              type="button"
              className="link"
              style={{ fontSize: '.85rem', alignSelf: 'center', marginTop: '.5rem' }}
              onClick={() => {
                setForgotOpen(false)
                setMsg('')
              }}
            >
              Voltar ao login
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={submit} className="form" style={{ margin: 0 }}>
          {mode === 'signup' && (
            <label>
              Nome completo
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ex.: Maria Oliveira"
                required
                autoComplete="name"
              />
            </label>
          )}

          <label>
            E-mail
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              autoComplete="email"
            />
          </label>

          <label>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Senha</span>
              {mode === 'login' && (
                <button
                  type="button"
                  className="link"
                  style={{ fontSize: '.78rem', fontWeight: 500 }}
                  onClick={() => {
                    setForgotOpen(true)
                    setMsg('')
                  }}
                >
                  Esqueci a senha
                </button>
              )}
            </div>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              required
              minLength={8}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>

          <div style={{ marginTop: '.75rem' }}>
            <button className="btn" style={{ width: '100%', padding: '.75rem' }} disabled={busy}>
              {busy
                ? 'Processando...'
                : mode === 'login'
                ? 'Entrar no Schedia'
                : 'Criar minha conta'}
            </button>
          </div>
        </form>
      )}

      <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '.85rem', color: 'var(--muted)' }}>
        <Link to="/" className="link" style={{ fontSize: '.85rem' }}>
          ← Voltar para a página inicial
        </Link>
      </div>
    </div>
  )
}
