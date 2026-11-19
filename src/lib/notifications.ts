import { supabase } from './supabase'

export type NotificationType =
  | 'appointment_booked'
  | 'appointment_cancelled'
  | 'appointment_rescheduled'
  | 'appointment_completed'
  | 'appointment_no_show'
  | 'business_approved'
  | 'business_rejected'
  | 'business_application_submitted'
  | string

export interface NotificationData {
  appointment_id?: string
  business_id?: string
  business_slug?: string
  business_name?: string
  service_id?: string
  service_name?: string
  starts_at?: string
  old_starts_at?: string
  new_starts_at?: string
  cancelled_by?: 'client' | 'business'
  rescheduled_by?: 'client' | 'business'
  status?: string
  application_id?: string
  trade_name?: string
  review_comment?: string
  client_id?: string
  client_name?: string
  [key: string]: unknown
}

export interface NotificationItem {
  id: string
  type: NotificationType
  title: string
  body: string
  data: NotificationData
  read_at: string | null
  created_at: string
}

export async function fetchNotifications(limit = 30, onlyUnread = false): Promise<NotificationItem[]> {
  const { data, error } = await supabase.rpc('get_my_notifications', {
    p_limit: limit,
    p_only_unread: onlyUnread,
  })

  if (error) {
    console.error('Erro ao buscar notificações:', error)
    return []
  }

  return (data as NotificationItem[]) || []
}

export async function fetchUnreadCount(): Promise<number> {
  const { data, error } = await supabase.rpc('count_unread_notifications')
  if (error) {
    console.error('Erro ao contar notificações não lidas:', error)
    return 0
  }
  return typeof data === 'number' ? data : 0
}

export async function markAsRead(id: string): Promise<boolean> {
  const { error } = await supabase.rpc('mark_notification_read', { p_id: id })
  if (error) {
    console.error('Erro ao marcar notificação como lida:', error)
    return false
  }
  return true
}

export async function markAllAsRead(): Promise<boolean> {
  const { error } = await supabase.rpc('mark_all_notifications_read')
  if (error) {
    console.error('Erro ao marcar todas notificações como lidas:', error)
    return false
  }
  return true
}

/**
 * Retorna o link contextual para navegação interna
 */
export function getNotificationLink(item: NotificationItem): string | null {
  const { type, data } = item
  if (!data) return null

  switch (type) {
    case 'appointment_booked':
      if (data.business_id) return `/painel/${data.business_id}/agenda`
      return '/agendamentos'

    case 'appointment_cancelled':
    case 'appointment_rescheduled':
      if (data.cancelled_by === 'client' || data.rescheduled_by === 'client') {
        if (data.business_id) return `/painel/${data.business_id}/agenda`
      }
      return '/agendamentos'

    case 'appointment_completed':
    case 'appointment_no_show':
      return '/agendamentos'

    case 'business_approved':
      if (data.business_slug) return `/n/${data.business_slug}`
      return '/painel'

    case 'business_rejected':
      return '/painel'

    case 'business_application_submitted':
      return '/aprovadores'

    default:
      if (data.business_id) return `/painel/${data.business_id}/agenda`
      if (data.appointment_id) return '/agendamentos'
      return null
  }
}

/**
 * Formata timestamp relativo em português
 */
export function formatRelativeTime(dateStr: string): string {
  try {
    const now = new Date()
    const d = new Date(dateStr)
    const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000)

    if (diffSec < 60) return 'agora'
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return `há ${diffMin} min`
    const diffHour = Math.floor(diffMin / 60)
    if (diffHour < 24) return `há ${diffHour} h`
    const diffDays = Math.floor(diffHour / 24)
    if (diffDays === 1) return 'ontem'
    if (diffDays < 7) return `há ${diffDays} dias`

    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  } catch {
    return ''
  }
}
