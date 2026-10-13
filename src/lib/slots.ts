export type Slot = { startMs: number; label: string }
export type Hours = Record<string, string[][]> // {"1":[["09:00","18:00"]]} · 0 = domingo
type Busy = { starts_at: string; ends_at: string }

function offsetMs(ts: number, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ts)).map(x => [x.type, x.value]))
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ts
}

/** Data/hora local do negócio → instante UTC (ms). */
export function zonedToUtc(date: string, time: string, tz: string) {
  const [y, m, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, h, mi)
  return guess - offsetMs(guess - offsetMs(guess, tz), tz)
}

export const todayIn = (tz: string, now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now)
export const addDays = (date: string, n: number) => {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}
export const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay()

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

export function computeSlots(o: { date: string; tz: string; hours: Hours; durationMin: number; stepMin: number; busy: Busy[]; now?: number }): Slot[] {
  const now = o.now ?? Date.now()
  const busy = o.busy.map(b => [Date.parse(b.starts_at), Date.parse(b.ends_at)])
  const out: Slot[] = []
  for (const [open, close] of o.hours[String(weekday(o.date))] ?? []) {
    for (let m = toMin(open); m + o.durationMin <= toMin(close); m += o.stepMin) {
      const s = zonedToUtc(o.date, fmt(m), o.tz)
      const e = s + o.durationMin * 60000
      if (s <= now || busy.some(([bs, be]) => s < be && e > bs)) continue
      out.push({ startMs: s, label: fmt(m) })
    }
  }
  return out
}
