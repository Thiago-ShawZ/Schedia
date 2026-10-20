/**
 * ThemeContext — gerencia tema claro/escuro com localStorage.
 * - Na primeira visita, respeita prefers-color-scheme do SO.
 * - Após escolha manual, mantém a preferência do usuário.
 * - Aplica o atributo data-theme="light"|"dark" no <html>.
 */
import { createContext, useCallback, useContext, useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

const KEY = 'schedia-theme'

function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // localStorage pode não estar disponível em alguns contextos
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  // Atualiza também a meta theme-color do navegador
  const meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null
  if (meta) meta.content = theme === 'dark' ? '#a78bfa' : '#7c3aed'
}

interface ThemeCtx {
  theme: Theme
  toggle: () => void
}

const Ctx = createContext<ThemeCtx>({ theme: 'light', toggle: () => {} })

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    // Lê o tema que foi aplicado pelo script anti-flash no index.html
    const attr = document.documentElement.getAttribute('data-theme')
    if (attr === 'light' || attr === 'dark') return attr
    return getInitialTheme()
  })

  useEffect(() => {
    applyTheme(theme)
    try {
      localStorage.setItem(KEY, theme)
    } catch { /* noop */ }
  }, [theme])

  const toggle = useCallback(() => {
    setTheme(t => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  return <Ctx.Provider value={{ theme, toggle }}>{children}</Ctx.Provider>
}

export const useTheme = () => useContext(Ctx)
