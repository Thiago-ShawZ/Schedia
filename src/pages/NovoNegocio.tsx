import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { slugify } from '../lib/format'
import ImageUploader from '../components/ImageUploader'
import { ArrowLeftIcon } from '../components/Icons'

export default function NovoNegocio() {
  const nav = useNavigate()
  const [cats, setCats] = useState<{ id: number; name: string }[]>([])
  const [f, setF] = useState({ name: '', slug: '', category_id: '', city: '', description: '', logo_url: '' })
  const [slugTouched, setSlugTouched] = useState(false)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase
      .from('categories')
      .select('id,name')
      .order('name')
      .then(({ data }) => setCats(data ?? []))
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setMsg('')
    setBusy(true)
    const id = crypto.randomUUID()
    const { error } = await supabase.from('businesses').insert({
      id,
      name: f.name.trim(),
      slug: f.slug,
      city: f.city.trim() || null,
      description: f.description.trim() || null,
      category_id: f.category_id ? Number(f.category_id) : null,
      logo_url: f.logo_url.trim() || null,
    })
    setBusy(false)

    if (error) {
      return setMsg(
        error.code === '23505'
          ? 'Este endereço (slug) já está em uso por outro negócio. Escolha outro.'
          : error.code === '23514'
          ? 'Endereço inválido: use de 3 a 60 letras minúsculas, números ou hífen.'
          : error.message
      )
    }
    nav(`/painel/${id}/servicos`)
  }

  return (
    <main className="narrow">
      <Link
        to="/painel"
        className="link"
        style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem', marginBottom: '1rem', fontSize: '.865rem' }}
      >
        <ArrowLeftIcon size={14} />
        <span>Voltar aos meus negócios</span>
      </Link>

      <div className="card" style={{ padding: '2rem 1.75rem', boxShadow: 'var(--sh-md)' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '1.35rem', margin: 0 }}>Cadastrar novo negócio</h1>
          <p style={{ color: 'var(--muted)', fontSize: '.88rem', margin: '.3rem 0 0' }}>
            Configure seu perfil comercial para começar a divulgar seus serviços e receber agendamentos.
          </p>
        </div>

        <form className="form" onSubmit={submit} style={{ margin: 0 }}>
          <ImageUploader
            value={f.logo_url}
            fallbackText={f.name || 'B'}
            onChange={url => setF({ ...f, logo_url: url })}
            label="Logotipo do negócio (opcional)"
            size={70}
          />

          <label>
            Nome do estabelecimento
            <input
              required
              value={f.name}
              onChange={e =>
                setF({
                  ...f,
                  name: e.target.value,
                  slug: slugTouched ? f.slug : slugify(e.target.value),
                })
              }
              placeholder="Ex.: Studio Lumina"
            />
          </label>

          <label>
            Endereço da sua página pública
            <input
              required
              value={f.slug}
              onChange={e => {
                setSlugTouched(true)
                setF({ ...f, slug: slugify(e.target.value) })
              }}
              placeholder="ex-studio-lumina"
            />
            <small style={{ color: 'var(--muted)', fontSize: '.78rem' }}>
              Seus clientes acessarão: <strong>schedia.app/n/{f.slug || 'seu-negocio'}</strong>
            </small>
          </label>

          <label>
            Categoria principal
            <select
              value={f.category_id}
              onChange={e => setF({ ...f, category_id: e.target.value })}
              required
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
            Cidade / Estado
            <input
              value={f.city}
              onChange={e => setF({ ...f, city: e.target.value })}
              placeholder="Ex.: São Paulo, SP"
            />
          </label>

          <label>
            Descrição breve
            <textarea
              rows={3}
              value={f.description}
              onChange={e => setF({ ...f, description: e.target.value })}
              placeholder="Apresente sua especialidade e diferenciais..."
            />
          </label>

          {msg && (
            <p role="alert" className="msg" style={{ margin: '.5rem 0' }}>
              {msg}
            </p>
          )}

          <div className="actions" style={{ marginTop: '.75rem' }}>
            <button className="btn" style={{ width: '100%', padding: '.75rem' }} disabled={busy}>
              {busy ? 'Criando negócio...' : 'Continuar para cadastro de serviços →'}
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}
