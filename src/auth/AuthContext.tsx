import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type Ctx = {
  session: Session | null
  loading: boolean
  isApprover: boolean
}

const AuthCtx = createContext<Ctx>({ session: null, loading: true, isApprover: false })
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [isApprover, setIsApprover] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) =>
      setSession(prev => (prev?.access_token === s?.access_token && prev?.user?.id === s?.user?.id ? prev : s))
    )
    return () => subscription.unsubscribe()
  }, [])

  const userId = session?.user?.id

  // Consulta platform_approvers estritamente uma vez por userId
  useEffect(() => {
    if (!userId) {
      setIsApprover(false)
      return
    }
    let active = true
    supabase
      .from('platform_approvers')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (active) {
          setIsApprover(!error && !!data)
        }
      })
    return () => {
      active = false
    }
  }, [userId])

  const value = useMemo(() => ({ session, loading, isApprover }), [session, loading, isApprover])
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <p className="center">Carregando…</p>
  return session ? <>{children}</> : <Navigate to="/entrar" replace />
}

export function RequireApprover({ children }: { children: ReactNode }) {
  const { session, loading, isApprover } = useAuth()
  if (loading) return <p className="center">Carregando…</p>
  if (!session) return <Navigate to="/entrar" replace />
  if (!isApprover) return <Navigate to="/painel" replace />
  return <>{children}</>
}
