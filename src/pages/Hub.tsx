import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type Biz = {
  id: string
  slug: string
  name: string
  description: string | null
  city: string | null
  categories: { name: string } | null
}

export default function Hub() {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [cats, setCats] = useState<{ id: number; name: string }[]>([])
  const [items, setItems] = useState<Biz[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true)
      let query = supabase
        .from('businesses')
        .select('id,slug,name,description,city,categories(name)')
        .eq('is_published', true)
        .order('name')
        .limit(30)
      const term = q.replace(/[%_]/g, '').trim()
      if (term) query = query.ilike('name', `%${term}%`)
      if (cat) query = query.eq('category_id', Number(cat))
      const { data } = await query
      setItems((data as unknown as Biz[]) ?? [])
      setLoading(false)
    }, 220)
    return () => clearTimeout(t)
  }, [q, cat])

  useEffect(() => {
    supabase.from('categories').select('id,name').order('name').then(({ data }) => setCats(data ?? []))
  }, [])

  return (
    <main>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ marginBottom: '.35rem' }}>Descubra negócios e serviços</h1>
        <p style={{ color: 'var(--muted)', fontSize: '.95rem' }}>
          Explore profissionais perto de você e agende seu horário com praticidade.
        </p>
      </div>

      <div className="search-area">
        <input
          className="search"
          type="search"
          placeholder="🔍 Buscar por nome do negócio ou serviço..."
          aria-label="Buscar negócios"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        <select
          aria-label="Filtrar por categoria"
          value={cat}
          onChange={e => setCat(e.target.value)}
        >
          <option value="">Todas as categorias</option>
          {cats.map(c => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Category Pills for quick filter */}
      {cats.length > 0 && (
        <div className="chips" style={{ marginBottom: '1.25rem', overflowX: 'auto', paddingBottom: '.25rem' }}>
          <button
            type="button"
            className="chip"
            aria-pressed={cat === ''}
            onClick={() => setCat('')}
          >
            Todos
          </button>
          {cats.slice(0, 7).map(c => (
            <button
              type="button"
              key={c.id}
              className="chip"
              aria-pressed={cat === String(c.id)}
              onClick={() => setCat(cat === String(c.id) ? '' : String(c.id))}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="center">
          <div className="spinner" />
          <p style={{ marginTop: '.75rem' }}>Buscando negócios disponíveis...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="card empty">
          <span className="empty-icon">🏪</span>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '.35rem' }}>Nenhum negócio encontrado</h2>
          <p>Tente ajustar a busca ou limpar os filtros de categoria.</p>
          {(q || cat) && (
            <button
              className="btn ghost sm"
              style={{ marginTop: '1rem' }}
              onClick={() => {
                setQ('')
                setCat('')
              }}
            >
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        <section className="grid">
          {items.map(b => (
            <Link className="card" key={b.id} to={`/n/${b.slug}`} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.65rem' }}>
                  <span className="badge badge-info">
                    {b.categories?.name ?? 'Geral'}
                  </span>
                  {b.city && (
                    <small style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '.2rem' }}>
                      📍 {b.city}
                    </small>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '.85rem', alignItems: 'flex-start', marginBottom: '.65rem' }}>
                  <div className="avatar" style={{ width: '42px', height: '42px', fontSize: '1.05rem' }}>
                    {b.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '1.08rem' }}>{b.name}</h2>
                  </div>
                </div>

                {b.description && (
                  <p style={{ color: 'var(--muted)', fontSize: '.85rem', lineHeight: 1.45, marginBottom: '1rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {b.description}
                  </p>
                )}
              </div>

              <div style={{ paddingTop: '.75rem', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '.8rem', color: 'var(--primary)', fontWeight: 600 }}>
                  Agendar horário →
                </span>
                <span className="badge badge-ok" style={{ fontSize: '.7rem' }}>
                  Aberto
                </span>
              </div>
            </Link>
          ))}
        </section>
      )}
    </main>
  )
}
