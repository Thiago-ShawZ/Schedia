import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { brl, toCents } from '../lib/format'

type Item = {
  id: string
  name: string
  description: string | null
  price_cents: number
  duration_min?: number
  is_active: boolean
}
const empty = { name: '', description: '', price: '', duration: '60' }

export default function CatalogoCrud({ table }: { table: 'services' | 'products' }) {
  const { id: businessId } = useParams()
  const isSvc = table === 'services'
  const [items, setItems] = useState<Item[]>([])
  const [form, setForm] = useState(empty)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from(table)
      .select('*')
      .eq('business_id', businessId)
      .order('name')
    setItems(data ?? [])
  }, [table, businessId])

  useEffect(() => {
    load()
  }, [load])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setMsg('')
    const price_cents = toCents(form.price)
    if (!Number.isFinite(price_cents) || price_cents < 0) return setMsg('Preço inválido.')
    const row: Record<string, unknown> = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      price_cents,
    }
    if (isSvc) {
      const d = parseInt(form.duration, 10)
      if (!(d > 0)) return setMsg('Duração inválida.')
      row.duration_min = d
    }

    setBusy(true)
    const { error } = editingId
      ? await supabase.from(table).update(row).eq('id', editingId)
      : await supabase.from(table).insert({ ...row, business_id: businessId })
    setBusy(false)

    if (error) return setMsg(error.message)
    setForm(empty)
    setEditingId(null)
    load()
  }

  async function toggle(it: Item) {
    const { error } = await supabase.from(table).update({ is_active: !it.is_active }).eq('id', it.id)
    if (error) setMsg(error.message)
    else load()
  }

  function edit(it: Item) {
    setEditingId(it.id)
    setForm({
      name: it.name,
      description: it.description ?? '',
      price: (it.price_cents / 100).toFixed(2).replace('.', ','),
      duration: String(it.duration_min ?? 60),
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <>
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: '1.4rem', margin: 0 }}>
          {isSvc ? 'Catálogo de Serviços' : 'Catálogo de Produtos'}
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: '.88rem', margin: '.2rem 0 0' }}>
          {isSvc
            ? 'Cadastre os serviços que seus clientes podem agendar online.'
            : 'Cadastre os itens e produtos físicos comercializados no seu espaço.'}
        </p>
      </div>

      <div className="card" style={{ marginBottom: '2rem', padding: '1.5rem' }}>
        <form className="form" onSubmit={submit} style={{ margin: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>
              {editingId
                ? `Editar ${isSvc ? 'serviço' : 'produto'}`
                : `Novo ${isSvc ? 'serviço' : 'produto'}`}
            </h2>
            {editingId && (
              <span className="badge badge-info">Modo Edição</span>
            )}
          </div>

          <label>
            Nome
            <input
              required
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder={isSvc ? 'Ex.: Corte de Cabelo Masculino' : 'Ex.: Pomada Modeladora'}
            />
          </label>
          <label>
            Descrição (opcional)
            <input
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Detalhes ou diferenciais do item..."
            />
          </label>
          <div className="row2">
            <label>
              Preço (R$)
              <input
                required
                inputMode="decimal"
                placeholder="Ex.: 45,00"
                value={form.price}
                onChange={e => setForm({ ...form, price: e.target.value })}
              />
            </label>
            {isSvc && (
              <label>
                Duração estimada (minutos)
                <input
                  required
                  type="number"
                  min={5}
                  step={5}
                  value={form.duration}
                  onChange={e => setForm({ ...form, duration: e.target.value })}
                />
              </label>
            )}
          </div>

          {msg && (
            <p role="alert" className="msg" style={{ margin: '.5rem 0' }}>
              {msg}
            </p>
          )}

          <div className="actions" style={{ marginTop: '.5rem' }}>
            <button className="btn" disabled={busy}>
              {busy ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Cadastrar item'}
            </button>
            {editingId && (
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setEditingId(null)
                  setForm(empty)
                }}
              >
                Cancelar edição
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="sec-hdr">
        <h2>Itens cadastrados ({items.length})</h2>
      </div>

      <ul className="list">
        {items.length === 0 && (
          <li className="card center">
            Nenhum {isSvc ? 'serviço' : 'produto'} cadastrado ainda. Use o formulário acima para adicionar.
          </li>
        )}
        {items.map(it => (
          <li
            key={it.id}
            className={it.is_active ? '' : 'off'}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '1rem',
              padding: '1rem 1.25rem',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.25rem' }}>
                <span className={`badge ${it.is_active ? 'badge-ok' : 'badge-muted'}`}>
                  {it.is_active ? '● Ativo' : 'Inativo'}
                </span>
                <strong style={{ fontSize: '1rem' }}>{it.name}</strong>
              </div>
              <small style={{ color: 'var(--muted)' }}>
                {it.description ? `${it.description} · ` : ''}
                <strong style={{ color: 'var(--fg)' }}>{brl(it.price_cents)}</strong>
                {it.duration_min ? ` · ⏱️ ${it.duration_min} min` : ''}
              </small>
            </div>

            <div className="actions">
              <button className="btn ghost sm" onClick={() => edit(it)}>
                Editar
              </button>
              <button
                className={`btn ghost sm ${it.is_active ? 'danger' : ''}`}
                style={
                  it.is_active
                    ? { borderColor: 'var(--line)', color: 'var(--muted)' }
                    : { borderColor: 'var(--ok)', color: 'var(--ok)' }
                }
                onClick={() => toggle(it)}
              >
                {it.is_active ? 'Desativar' : 'Ativar'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
