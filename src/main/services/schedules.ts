// Lecture/écriture des horaires hebdomadaires (établissement ou membre de l'équipe).

import { randomUUID } from 'node:crypto'
import { eq, isNull } from 'drizzle-orm'
import type { DaySchedule } from '@shared/types'
import { getDb } from '../db/client'
import { staffBreaks, workingHours } from '../db/schema'

export function defaultWeek(): DaySchedule[] {
  return [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
    weekday,
    open: weekday !== 7,
    start: 9 * 60,
    end: 19 * 60,
    breaks: []
  }))
}

export function readSchedule(staffId: string | null): DaySchedule[] {
  const db = getDb()
  const hoursRows = db
    .select()
    .from(workingHours)
    .where(staffId ? eq(workingHours.staffId, staffId) : isNull(workingHours.staffId))
    .all()
  const breakRows = db
    .select()
    .from(staffBreaks)
    .where(staffId ? eq(staffBreaks.staffId, staffId) : isNull(staffBreaks.staffId))
    .all()
  if (hoursRows.length === 0) return defaultWeek()
  return [1, 2, 3, 4, 5, 6, 7].map((weekday) => {
    const h = hoursRows.find((r) => r.weekday === weekday)
    return {
      weekday,
      open: h ? h.isOpen : false,
      start: h ? h.startMin : 9 * 60,
      end: h ? h.endMin : 19 * 60,
      breaks: breakRows
        .filter((b) => b.weekday === weekday)
        .map((b) => ({ start: b.startMin, end: b.endMin }))
        .sort((a, b) => a.start - b.start)
    }
  })
}

/** Remplace les horaires (à appeler dans une transaction). */
export function writeSchedule(staffId: string | null, week: DaySchedule[]): void {
  const db = getDb()
  db.delete(workingHours).where(staffId ? eq(workingHours.staffId, staffId) : isNull(workingHours.staffId)).run()
  db.delete(staffBreaks).where(staffId ? eq(staffBreaks.staffId, staffId) : isNull(staffBreaks.staffId)).run()
  for (const day of week) {
    db.insert(workingHours)
      .values({
        id: randomUUID(),
        staffId,
        weekday: day.weekday,
        isOpen: day.open,
        startMin: day.start,
        endMin: Math.max(day.end, day.start + 5)
      })
      .run()
    for (const br of day.breaks) {
      if (br.end <= br.start) continue
      db.insert(staffBreaks)
        .values({ id: randomUUID(), staffId, weekday: day.weekday, startMin: br.start, endMin: br.end })
        .run()
    }
  }
}
