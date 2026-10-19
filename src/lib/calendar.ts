/**
 * Schedia · Utilitários de Integração de Calendário (Google Agenda & iCalendar .ics)
 */

export type CalendarEventData = {
  id: string
  serviceName: string
  businessName: string
  startsAt: string
  durationMin: number
  timezone?: string
}

/**
 * Converte um objeto Date para o formato ISO 8601 compacto em UTC (ex: 20261025T140000Z)
 */
export function toUtcCompact(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

/**
 * Gera URL de criação de evento direto no Google Agenda com parâmetros codificados.
 */
export function buildGoogleCalendarUrl(event: CalendarEventData): string {
  const start = new Date(event.startsAt)
  const end = new Date(start.getTime() + event.durationMin * 60000)
  const dates = `${toUtcCompact(start)}/${toUtcCompact(end)}`

  const params = new URLSearchParams()
  params.set('action', 'TEMPLATE')
  params.set('text', `${event.serviceName} — ${event.businessName}`)
  params.set('dates', dates)
  params.set(
    'details',
    `Agendamento confirmado via Schedia\nServiço: ${event.serviceName}\nEstabelecimento: ${event.businessName}\nDuração: ${event.durationMin} min`
  )
  if (event.businessName) {
    params.set('location', event.businessName)
  }
  if (event.timezone) {
    params.set('ctz', event.timezone)
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

/**
 * Escapa texto de acordo com a especificação RFC 5545 para iCalendar (.ics)
 */
export function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/**
 * Cria e dispara o download de um arquivo .ics (iCalendar) no navegador,
 * liberando os recursos temporários de URL logo após o download.
 */
export function downloadIcsFile(event: CalendarEventData): void {
  const start = new Date(event.startsAt)
  const end = new Date(start.getTime() + event.durationMin * 60000)
  const now = new Date()

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Schedia//Agendamentos//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.id}@schedia.app`,
    `DTSTAMP:${toUtcCompact(now)}`,
    `DTSTART:${toUtcCompact(start)}`,
    `DTEND:${toUtcCompact(end)}`,
    `SUMMARY:${escapeIcsText(`${event.serviceName} — ${event.businessName}`)}`,
    `DESCRIPTION:${escapeIcsText(
      `Agendamento confirmado via Schedia\nServiço: ${event.serviceName}\nEstabelecimento: ${event.businessName}\nDuração: ${event.durationMin} min`
    )}`,
    event.businessName ? `LOCATION:${escapeIcsText(event.businessName)}` : '',
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean)

  const icsContent = lines.join('\r\n')
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  const safeFilename = `${event.serviceName}-${event.businessName}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  const a = document.createElement('a')
  a.href = url
  a.download = `${safeFilename || 'agendamento'}.ics`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
