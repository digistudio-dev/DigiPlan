// Génération des occurrences d'un rendez-vous récurrent.

import { addMonths, addWeeks, endOfDay } from 'date-fns'
import { MAX_RECURRENCE_OCCURRENCES } from '../constants'
import { fromIsoDate } from '../format'

export type RecurrenceFrequency = 'weekly' | 'biweekly' | 'monthly'

export interface RecurrenceRule {
  frequency: RecurrenceFrequency
  /** Nombre total d'occurrences (première incluse). */
  count?: number | null
  /** Date de fin incluse, format « yyyy-MM-dd ». */
  until?: string | null
}

export const FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  weekly: 'Chaque semaine',
  biweekly: 'Toutes les 2 semaines',
  monthly: 'Chaque mois'
}

/**
 * Retourne les débuts des occurrences, la première étant `startAt`.
 * Les calculs se font en heure locale : l'heure du rendez-vous est conservée
 * malgré les changements d'heure. Pour le mensuel, le jour est plafonné à la fin du mois
 * (31 janvier → 28/29 février → 31 mars) sans dérive.
 */
export function generateOccurrences(startAt: number, rule: RecurrenceRule): number[] {
  const limit = Math.min(
    rule.count && rule.count > 0 ? Math.floor(rule.count) : MAX_RECURRENCE_OCCURRENCES,
    MAX_RECURRENCE_OCCURRENCES
  )
  const untilMs = rule.until ? endOfDay(fromIsoDate(rule.until)).getTime() : Number.POSITIVE_INFINITY
  if (!rule.count && !rule.until) return [startAt]

  const out: number[] = []
  for (let i = 0; out.length < limit; i++) {
    let next: number
    switch (rule.frequency) {
      case 'weekly':
        next = addWeeks(startAt, i).getTime()
        break
      case 'biweekly':
        next = addWeeks(startAt, i * 2).getTime()
        break
      case 'monthly':
        next = addMonths(startAt, i).getTime()
        break
    }
    if (next > untilMs) break
    out.push(next)
  }
  return out
}
