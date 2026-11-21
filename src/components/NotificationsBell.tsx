import { Component, useEffect, useRef, useState, useCallback, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { BellIcon, CheckIcon } from './Icons'
import {
  fetchNotifications,
  fetchUnreadCount,
  markAsRead,
  markAllAsRead,
  getNotificationLink,
  formatRelativeTime,
  NotificationItem,
} from '../lib/notifications'
import { supabase } from '../lib/supabase'

// ─── Error Boundary (captura erros de render sem travar o Header) ───
class NotifErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { error: false }
  }
  static getDerivedStateFromError() { return { error: true } }
  render() {
    if (this.state.error) return null // falha silenciosa — não trava o Header
    return this.props.children
  }
}

interface NotificationsBellProps {
  onNavigate?: () => void
}

function NotificationsBellInner({ onNavigate }: NotificationsBellProps) {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [markingAll, setMarkingAll] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const uid = session?.user?.id

  const loadUnreadCount = useCallback(async () => {
    if (!uid) return
    try {
      const count = await fetchUnreadCount()
      setUnreadCount(count)
    } catch {
      // silencia erros de rede / tabela ainda não criada
    }
  }, [uid])

  const loadNotifications = useCallback(async () => {
    if (!uid) return
    setLoading(true)
    try {
      const items = await fetchNotifications(30)
      setNotifications(items)
      setUnreadCount(items.filter(n => !n.read_at).length)
    } catch {
      // silencia
    } finally {
      setLoading(false)
    }
  }, [uid])

  // Carga inicial
  useEffect(() => {
    loadUnreadCount()
  }, [loadUnreadCount])

  // Recarrega ao focar a janela
  useEffect(() => {
    const onFocus = () => loadUnreadCount()
    const onVisible = () => { if (document.visibilityState === 'visible') loadUnreadCount() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [loadUnreadCount])

  // Canal Realtime (opcional — falha silenciosamente se Realtime não estiver ativo)
  useEffect(() => {
    if (!uid) return
    let channel: ReturnType<typeof supabase.channel> | null = null
    try {
      channel = supabase
        .channel(`notif:${uid}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` },
          payload => {
            const n = payload.new as NotificationItem
            setNotifications(prev => {
              if (prev.some(item => item.id === n.id)) return prev
              return [n, ...prev]
            })
            setUnreadCount(c => c + 1)
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` },
          payload => {
            const updated = payload.new as NotificationItem
            setNotifications(prev => prev.map(n => (n.id === updated.id ? updated : n)))
            loadUnreadCount()
          }
        )
        .subscribe()
    } catch {
      // Realtime não disponível — funciona sem tempo real
    }
    return () => {
      if (channel) {
        try { supabase.removeChannel(channel) } catch { /* ignore */ }
      }
    }
  }, [uid, loadUnreadCount])

  const toggleOpen = () => {
    if (!open) loadNotifications()
    setOpen(prev => !prev)
  }

  // Fecha ao clicar fora ou Escape
  useEffect(() => {
    if (!open) return
    const onOutside = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onOutside)
    document.addEventListener('touchstart', onOutside)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onOutside)
      document.removeEventListener('touchstart', onOutside)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const handleItemClick = async (item: NotificationItem) => {
    if (!item.read_at) {
      setNotifications(prev => prev.map(n => n.id === item.id ? { ...n, read_at: new Date().toISOString() } : n))
      setUnreadCount(c => Math.max(0, c - 1))
      markAsRead(item.id).catch(() => {})
    }
    setOpen(false)
    const link = getNotificationLink(item)
    if (link) {
      navigate(link)
      onNavigate?.()
    }
  }

  const handleMarkAll = async () => {
    if (markingAll || unreadCount === 0) return
    setMarkingAll(true)
    try {
      await markAllAsRead()
      const now = new Date().toISOString()
      setNotifications(prev => prev.map(n => n.read_at ? n : { ...n, read_at: now }))
      setUnreadCount(0)
    } catch { /* ignore */ } finally {
      setMarkingAll(false)
    }
  }

  if (!session) return null

  return (
    <div className="notif-bell-wrapper" ref={menuRef}>
      <button
        type="button"
        className={`notif-bell-btn${open ? ' active' : ''}`}
        onClick={toggleOpen}
        aria-label={unreadCount > 0 ? `Notificações: ${unreadCount} não lida${unreadCount > 1 ? 's' : ''}` : 'Notificações'}
        aria-expanded={open}
        aria-haspopup="true"
        title="Notificações"
      >
        <BellIcon size={17} />
        {unreadCount > 0 && (
          <span className="notif-badge-count">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <>
          <div
            className="notif-mobile-backdrop"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="notif-dropdown" role="region" aria-label="Painel de notificações">
            <div className="notif-header">
            <div className="notif-header-title">
              <span>Notificações</span>
              {unreadCount > 0 && (
                <span className="badge badge-info" style={{ fontSize: '.72rem', padding: '.15rem .45rem' }}>
                  {unreadCount} nova{unreadCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                className="btn ghost sm"
                style={{ padding: '.25rem .55rem', fontSize: '.75rem', gap: '.3rem' }}
                onClick={handleMarkAll}
                disabled={markingAll}
              >
                <CheckIcon size={13} />
                <span>Marcar lidas</span>
              </button>
            )}
          </div>

          <div className="notif-list">
            {loading ? (
              <div className="center" style={{ padding: '2rem 1rem' }}>
                <div className="spinner" style={{ width: '22px', height: '22px' }} />
              </div>
            ) : notifications.length === 0 ? (
              <div className="notif-empty">
                <div style={{ opacity: 0.45, marginBottom: '.5rem' }}><BellIcon size={28} /></div>
                <span>Nenhuma notificação no momento</span>
              </div>
            ) : (
              notifications.map(item => {
                const isUnread = !item.read_at
                return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    className={`notif-item${isUnread ? ' unread' : ''}`}
                    onClick={() => handleItemClick(item)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleItemClick(item) } }}
                  >
                    <div className="notif-item-dot" style={{ visibility: isUnread ? 'visible' : 'hidden' }} aria-hidden="true" />
                    <div className="notif-item-body">
                      <div className="notif-item-title">{item.title}</div>
                      <div className="notif-item-desc">{item.body}</div>
                      <div className="notif-item-time">{formatRelativeTime(item.created_at)}</div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </>
    )}
  </div>
)
}

export function NotificationsBell(props: NotificationsBellProps) {
  return (
    <NotifErrorBoundary>
      <NotificationsBellInner {...props} />
    </NotifErrorBoundary>
  )
}
export default NotificationsBell

