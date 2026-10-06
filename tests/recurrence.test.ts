import { describe, expect, it } from 'vitest'
import { generateOccurrences } from '@shared/domain/recurrence'
import { MAX_RECURRENCE_OCCURRENCES } from '@shared/constants'

const fmt = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

describe('generateOccurrences — rendez-vous récurrents', () => {
  const start = new Date(2026, 9, 6, 14, 30).getTime()

  it('chaque semaine, nombre de séances', () => {
    expect(generateOccurrences(start, { frequency: 'weekly', count: 4 }).map(fmt)).toEqual([
      '2026-10-06 14:30',
      '2026-10-13 14:30',
      '2026-10-20 14:30',
      '2026-10-27 14:30'
    ])
  })

  it('toutes les 2 semaines jusqu’à une date de fin incluse', () => {
    expect(generateOccurrences(start, { frequency: 'biweekly', until: '2026-11-17' }).map(fmt)).toEqual([
      '2026-10-06 14:30',
      '2026-10-20 14:30',
      '2026-11-03 14:30',
      '2026-11-17 14:30'
    ])
  })

  it('chaque mois sans dérive en fin de mois', () => {
    const jan31 = new Date(2027, 0, 31, 10, 0).getTime()
    expect(generateOccurrences(jan31, { frequency: 'monthly', count: 4 }).map(fmt)).toEqual([
      '2027-01-31 10:00',
      '2027-02-28 10:00',
      '2027-03-31 10:00',
      '2027-04-30 10:00'
    ])
  })

  it("conserve l'heure locale lors des changements d'heure", () => {
    // Le Maroc change d'heure autour du Ramadan (février–mars 2027).
    const occ = generateOccurrences(new Date(2027, 0, 20, 9, 0).getTime(), { frequency: 'weekly', count: 12 })
    expect(new Set(occ.map((o) => fmt(o).slice(11)))).toEqual(new Set(['09:00']))
  })

  it('respecte la plus restrictive entre nombre et date de fin', () => {
    expect(generateOccurrences(start, { frequency: 'weekly', count: 10, until: '2026-10-20' })).toHaveLength(3)
  })

  it("plafonne le nombre d'occurrences", () => {
    expect(generateOccurrences(start, { frequency: 'weekly', until: '2040-01-01' })).toHaveLength(MAX_RECURRENCE_OCCURRENCES)
  })

  it('sans règle de fin, renvoie uniquement la première occurrence', () => {
    expect(generateOccurrences(start, { frequency: 'weekly' })).toEqual([start])
  })
})
