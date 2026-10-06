// Formatage des dates/heures en français (fuseau local de la machine).

import { format, isSameDay, isToday, isTomorrow, isYesterday } from 'date-fns'
import { fr } from 'date-fns/locale'

/** « 06 octobre 2026 » */
export function formatDateLong(ms: number): string {
  return format(ms, 'dd MMMM yyyy', { locale: fr })
}

/** « mardi 06 octobre 2026 » */
export function formatDateFull(ms: number): string {
  return format(ms, 'EEEE dd MMMM yyyy', { locale: fr })
}

/** « 06/10/2026 » */
export function formatDateShort(ms: number): string {
  return format(ms, 'dd/MM/yyyy', { locale: fr })
}

/** « 14:30 » */
export function formatTime(ms: number): string {
  return format(ms, 'HH:mm', { locale: fr })
}

/** « 06 oct. 2026 · 14:30 » */
export function formatDateTime(ms: number): string {
  return `${format(ms, 'dd MMM yyyy', { locale: fr })} · ${format(ms, 'HH:mm')}`
}

/** « Aujourd'hui », « Demain », « Hier » ou « mar. 06 oct. » */
export function formatRelativeDay(ms: number): string {
  if (isToday(ms)) return "Aujourd'hui"
  if (isTomorrow(ms)) return 'Demain'
  if (isYesterday(ms)) return 'Hier'
  return format(ms, 'EEE dd MMM', { locale: fr })
}

export function formatTimeRange(start: number, end: number): string {
  return `${formatTime(start)} – ${formatTime(end)}`
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`
}

export function sameDay(a: number, b: number): boolean {
  return isSameDay(a, b)
}

/** « 2026-10-06 » (date locale) */
export function toIsoDate(ms: number): string {
  return format(ms, 'yyyy-MM-dd')
}

/** Minuit local d'une date ISO « yyyy-MM-dd ». */
export function fromIsoDate(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}
