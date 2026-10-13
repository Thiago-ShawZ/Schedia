import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

const root = createRoot(document.getElementById('root')!)
if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  root.render(<main className="narrow"><h1>Configuração pendente</h1><p>Defina <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> (arquivo <code>.env</code> ou variáveis da Vercel) e reinicie.</p></main>)
} else {
  import('./App').then(({ default: App }) => root.render(<StrictMode><App /></StrictMode>))
}
