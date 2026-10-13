import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import ImageUploader from '../components/ImageUploader'

export default function Perfil() {
  const { session } = useAuth()
  const uid = session?.user.id ?? ''
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [pwd, setPwd] = useState('')
  const [msg, setMsg] = useState('')
  const [msg2, setMsg2] = useState('')
  const [busy, setBusy] = useState(false)
  const [busy2, setBusy2] = useState(false)

  useEffect(() => {
    if (uid) {
      supabase
        .from('profiles')
        .select('full_name,phone,avatar_url')
        .eq('id', uid)
        .single()
        .then(({ data }) => {
          if (data) {
            setName(data.full_name)
            setPhone(data.phone ?? '')
            setAvatarUrl(data.avatar_url ?? '')
          }
        })
    }
  }, [uid])

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg('')

    // Atualiza tabela profiles e metadados de autenticação
    const [pRes, aRes] = await Promise.all([
      supabase
        .from('profiles')
        .update({
          full_name: name.trim(),
          phone: phone.trim() || null,
          avatar_url: avatarUrl.trim() || null,
        })
        .eq('id', uid),
      supabase.auth.updateUser({
        data: {
          full_name: name.trim(),
          avatar_url: avatarUrl.trim() || null,
        },
      }),
    ])

    setBusy(false)
    if (pRes.error && aRes.error) {
      setMsg('Não foi possível salvar os dados do perfil.')
    } else {
      setMsg('Dados do perfil salvos com sucesso.')
    }
  }

  async function trocar(e: FormEvent) {
    e.preventDefault()
    setBusy2(true)
    setMsg2('')
    const { error } = await supabase.auth.updateUser({ password: pwd })
    setBusy2(false)
    setMsg2(
      error
        ? 'Não foi possível alterar a senha (mínimo de 8 caracteres).'
        : 'Senha alterada com sucesso.'
    )
    if (!error) setPwd('')
  }

  return (
    <main className="narrow">
      {/* User Header Profile Card */}
      <div className="card" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div className="avatar" style={{ width: '58px', height: '58px', fontSize: '1.3rem' }}>
          {avatarUrl ? (
            <img src={avatarUrl} alt="Avatar" className="avatar-img" />
          ) : (
            (name || session?.user.email || 'U').charAt(0).toUpperCase()
          )}
        </div>
        <div>
          <h1 style={{ fontSize: '1.25rem', margin: 0 }}>{name || 'Meu Perfil'}</h1>
          <small style={{ color: 'var(--muted)' }}>{session?.user.email}</small>
        </div>
      </div>

      {/* Personal Info Form */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
        <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>Dados pessoais</h2>
        <p style={{ color: 'var(--muted)', fontSize: '.84rem', marginBottom: '1rem' }}>
          Mantenha seus dados e sua foto atualizados para contato com os estabelecimentos.
        </p>

        <form className="form" onSubmit={salvar} style={{ margin: 0 }}>
          <ImageUploader
            value={avatarUrl}
            fallbackText={name || 'U'}
            onChange={setAvatarUrl}
            label="Foto de perfil"
            size={76}
          />

          <label>
            E-mail cadastrado
            <input value={session?.user.email ?? ''} disabled style={{ opacity: 0.65 }} />
          </label>
          <label>
            Nome completo
            <input
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Seu nome"
              autoComplete="name"
            />
          </label>
          <label>
            Telefone / WhatsApp
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="(11) 98765-4321"
              autoComplete="tel"
            />
          </label>

          {msg && (
            <p
              role="status"
              className="msg"
              style={{
                margin: '.5rem 0 0',
                background: msg.includes('sucesso') ? 'var(--ok-lt)' : 'var(--err-lt)',
                color: msg.includes('sucesso') ? 'var(--ok)' : 'var(--err)',
                borderLeftColor: msg.includes('sucesso') ? 'var(--ok)' : 'var(--err)',
              }}
            >
              {msg}
            </p>
          )}

          <div className="actions" style={{ marginTop: '.75rem' }}>
            <button className="btn" disabled={busy}>
              {busy ? 'Salvando...' : 'Salvar dados do perfil'}
            </button>
          </div>
        </form>
      </div>

      {/* Security Form */}
      <div className="card" style={{ padding: '1.5rem' }}>
        <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>Segurança & Acesso</h2>
        <p style={{ color: 'var(--muted)', fontSize: '.84rem', marginBottom: '1rem' }}>
          Defina uma nova senha para acessar sua conta com segurança.
        </p>

        <form className="form" onSubmit={trocar} style={{ margin: 0 }}>
          <label>
            Nova senha
            <input
              type="password"
              required
              minLength={8}
              value={pwd}
              onChange={e => setPwd(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              autoComplete="new-password"
            />
          </label>

          {msg2 && (
            <p
              role="status"
              className="msg"
              style={{
                margin: '.5rem 0 0',
                background: msg2.includes('sucesso') ? 'var(--ok-lt)' : 'var(--err-lt)',
                color: msg2.includes('sucesso') ? 'var(--ok)' : 'var(--err)',
                borderLeftColor: msg2.includes('sucesso') ? 'var(--ok)' : 'var(--err)',
              }}
            >
              {msg2}
            </p>
          )}

          <div className="actions" style={{ marginTop: '.75rem' }}>
            <button className="btn ghost" disabled={busy2}>
              {busy2 ? 'Atualizando...' : 'Atualizar senha'}
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}
