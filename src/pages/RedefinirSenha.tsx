import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { AlertCircleIcon } from '../components/Icons'

export default function RedefinirSenha() {
  const { session, loading } = useAuth()
  const nav = useNavigate()
  const [pwd, setPwd] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  if (loading) {
    return (
      <div className="center" style={{ paddingTop: '4rem' }}>
        <div className="spinner" />
        <p style={{ marginTop: '.75rem', fontSize: '.88rem' }}>Verificando link de acesso...</p>
      </div>
    )
  }

  if (!session) {
    return (
      <main className="narrow" style={{ textAlign: 'center', paddingTop: '3rem' }}>
        <div className="card" style={{ padding: '2rem' }}>
          <div style={{ display: 'inline-flex', padding: '1rem', background: 'var(--err-lt)', color: 'var(--err)', borderRadius: '50%', marginBottom: '.75rem' }}>
            <AlertCircleIcon size={32} />
          </div>
          <h1 style={{ fontSize: '1.3rem', margin: '.5rem 0' }}>Link inválido ou expirado</h1>
          <p style={{ color: 'var(--muted)', fontSize: '.88rem' }}>
            Este link de redefinição de senha já foi utilizado ou perdeu a validade.
          </p>
          <Link className="btn" to="/entrar" style={{ marginTop: '1rem' }}>
            Voltar para o login
          </Link>
        </div>
      </main>
    )
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    const { error } = await supabase.auth.updateUser({ password: pwd })
    setBusy(false)
    if (error) {
      return setMsg('Não foi possível redefinir a senha (use ao menos 8 caracteres).')
    }
    nav('/inicio')
  }

  return (
    <main className="narrow" style={{ paddingTop: '2rem' }}>
      <div className="card" style={{ padding: '2rem 1.75rem', boxShadow: 'var(--sh-md)' }}>
        <h1 style={{ fontSize: '1.35rem', margin: '0 0 .35rem' }}>Redefinir sua senha</h1>
        <p style={{ color: 'var(--muted)', fontSize: '.88rem', margin: '0 0 1.25rem' }}>
          Crie uma nova senha de no mínimo 8 caracteres para a sua conta.
        </p>

        <form className="form" onSubmit={submit} style={{ margin: 0 }}>
          <label>
            Nova senha
            <input
              type="password"
              required
              minLength={8}
              value={pwd}
              onChange={e => setPwd(e.target.value)}
              placeholder="Digite ao menos 8 caracteres"
              autoComplete="new-password"
            />
          </label>

          {msg && (
            <p role="alert" className="msg" style={{ margin: '.5rem 0' }}>
              {msg}
            </p>
          )}

          <div className="actions" style={{ marginTop: '.75rem' }}>
            <button className="btn" style={{ width: '100%' }} disabled={busy}>
              {busy ? 'Salvando...' : 'Salvar nova senha'}
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}
