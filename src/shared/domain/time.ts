import { getISODay, startOfDay } from 'date-fns'

export const MINUTE = 60_000
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR

/** 870 → « 14:30 » */
export function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** « 14:30 » → 870 ; retourne null si invalide. */
export function hhmmToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (h > 24 || m > 59 || (h === 24 && m > 0)) return null
  return h * 60 + m
}

/** Instant correspondant à `minutes` après minuit du jour local de `dayMs` (gère les changements d'heure). */
export function atMinutes(dayMs: number, minutes: number): number {
  const d = new Date(startOfDay(dayMs))
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)
  return d.getTime()
}

/** Minutes écoulées depuis minuit local. */
export function minutesOfDay(ms: number): number {
  const d = new Date(ms)
  return d.getHours() * 60 + d.getMinutes()
}

/** 1 = lundi … 7 = dimanche */
export function isoWeekday(ms: number): number {
  return getISODay(ms)
}

export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}
