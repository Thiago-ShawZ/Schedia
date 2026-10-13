import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import AuthForm from '../auth/AuthForm'

export default function Auth() {
  const { session } = useAuth()
  const nav = useNavigate()
  if (session) return <Navigate to="/inicio" replace />
  return <main className="narrow"><AuthForm onSuccess={() => nav('/inicio')} /></main>
}
