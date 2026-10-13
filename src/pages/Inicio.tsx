import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// Fluxo A: 0 negócios → hub · 1 → painel direto · 2+ → seletor
export default function Inicio() {
  const [to, setTo] = useState<string | null>(null)
  useEffect(() => {
    supabase.from('business_memberships').select('business_id').eq('status', 'active').then(({ data, error }) => {
      const ids = (data ?? []).map(r => r.business_id as string)
      setTo(error || ids.length === 0 ? '/hub' : ids.length === 1 ? `/painel/${ids[0]}` : '/painel')
    })
  }, [])
  return to ? <Navigate to={to} replace /> : <p className="center">Carregando…</p>
}
