import { describe, expect, it } from 'vitest'
import { checkSlot, findAvailableSlots, hasBlockingConflict, toBusyInterval, type SlotContext } from '@shared/domain/availability'
import type { DaySchedule } from '@shared/types'

// Mardi 6 octobre 2026 (heure du Maroc).
const day = new Date(2026, 9, 6).getTime()
const at = (h: number, m = 0) => new Date(2026, 9, 6, h, m).getTime()
const MIN = 60_000

const business: DaySchedule = { weekday: 2, open: true, start: 9 * 60, end: 19 * 60, breaks: [{ start: 13 * 60, end: 14 * 60 }] }

function ctx(partial: Partial<SlotContext> = {}): SlotContext {
  return { businessDay: business, staffDay: null, staffBusy: [], resourceBusy: [], bufferBeforeMin: 0, bufferAfterMin: 0, ...partial }
}

describe('checkSlot — détection de conflits', () => {
  it('accepte un créneau libre dans les horaires', () => {
    expect(checkSlot(at(10), at(10, 30), ctx())).toEqual([])
  })

  it("refuse un jour de fermeture", () => {
    const c = checkSlot(at(10), at(10, 30), ctx({ businessDay: { ...business, open: false } }))
    expect(c.map((x) => x.code)).toContain('closed')
    expect(hasBlockingConflict(c)).toBe(true)
  })

  it("refuse un créneau qui dépasse l'heure de fermeture", () => {
    const c = checkSlot(at(18, 45), at(19, 15), ctx())
    expect(c.map((x) => x.code)).toContain('outside_business_hours')
  })

  it("refuse un créneau pendant la pause de l'établissement", () => {
    const c = checkSlot(at(12, 45), at(13, 15), ctx())
    expect(c.map((x) => x.code)).toContain('business_break')
  })

  it('accepte un rendez-vous qui se termine exactement au début de la pause', () => {
    expect(checkSlot(at(12, 30), at(13), ctx())).toEqual([])
  })

  it('détecte un chevauchement avec un rendez-vous du même membre', () => {
    const busy = [toBusyInterval({ id: 'a1', startAt: at(10), endAt: at(10, 30), bufferBeforeMin: 0, bufferAfterMin: 0 }, 'Salma')]
    const c = checkSlot(at(10, 15), at(10, 45), ctx({ staffBusy: busy }))
    expect(c).toHaveLength(1)
    expect(c[0].code).toBe('staff_busy')
    expect(c[0].appointmentId).toBe('a1')
    expect(c[0].blocking).toBe(true)
  })

  it('autorise deux rendez-vous bout à bout', () => {
    const busy = [toBusyInterval({ id: 'a1', startAt: at(10), endAt: at(10, 30), bufferBeforeMin: 0, bufferAfterMin: 0 })]
    expect(checkSlot(at(10, 30), at(11), ctx({ staffBusy: busy }))).toEqual([])
  })

  it('prend en compte les temps tampons (avant/après)', () => {
    // Rendez-vous existant 10:00–10:30 avec 10 min de nettoyage après.
    const busy = [toBusyInterval({ id: 'a1', startAt: at(10), endAt: at(10, 30), bufferBeforeMin: 0, bufferAfterMin: 10 })]
    expect(checkSlot(at(10, 30), at(11), ctx({ staffBusy: busy }))[0]?.code).toBe('staff_busy')
    expect(checkSlot(at(10, 40), at(11, 10), ctx({ staffBusy: busy }))).toEqual([])
    // Le nouveau rendez-vous nécessite 15 min de préparation avant.
    expect(checkSlot(at(10, 45), at(11, 15), ctx({ staffBusy: busy, bufferBeforeMin: 15 }))[0]?.code).toBe('staff_busy')
  })

  it('rend le chevauchement non bloquant si explicitement autorisé', () => {
    const busy = [toBusyInterval({ id: 'a1', startAt: at(10), endAt: at(11), bufferBeforeMin: 0, bufferAfterMin: 0 })]
    const c = checkSlot(at(10, 30), at(11), ctx({ staffBusy: busy, allowOverlap: true }))
    expect(c[0].code).toBe('staff_busy')
    expect(hasBlockingConflict(c)).toBe(false)
  })

  it('une ressource déjà réservée reste toujours bloquante', () => {
    const busy = [toBusyInterval({ id: 'a2', startAt: at(15), endAt: at(16), bufferBeforeMin: 0, bufferAfterMin: 0 })]
    const c = checkSlot(at(15, 30), at(16), ctx({ resourceBusy: busy, allowOverlap: true }))
    expect(c[0].code).toBe('resource_busy')
    expect(hasBlockingConflict(c)).toBe(true)
  })

  it('respecte les horaires et pauses du membre de l’équipe', () => {
    const staffDay: DaySchedule = { weekday: 2, open: true, start: 10 * 60, end: 16 * 60, breaks: [{ start: 11 * 60, end: 11 * 60 + 30 }] }
    expect(checkSlot(at(9, 30), at(10), ctx({ staffDay }))[0].code).toBe('outside_staff_hours')
    expect(checkSlot(at(11), at(11, 30), ctx({ staffDay }))[0].code).toBe('staff_break')
    expect(checkSlot(at(15), at(15, 30), ctx({ staffDay: { ...staffDay, open: false } }))[0].code).toBe('staff_off')
  })

  it('signale un créneau passé sans le bloquer', () => {
    const c = checkSlot(at(10), at(10, 30), ctx({ now: at(12) }))
    expect(c[0].code).toBe('past')
    expect(hasBlockingConflict(c)).toBe(false)
  })

  it('refuse une durée nulle ou négative', () => {
    expect(checkSlot(at(10), at(10), ctx())[0].code).toBe('invalid_duration')
  })
})

describe('findAvailableSlots — créneaux libres', () => {
  it('propose les créneaux alignés sur le pas en évitant pause et rendez-vous', () => {
    const busy = [toBusyInterval({ id: 'a1', startAt: at(9), endAt: at(10), bufferBeforeMin: 0, bufferAfterMin: 0 })]
    const slots = findAvailableSlots(day, 30, 30, ctx({ staffBusy: busy }))
    const times = slots.map((s) => new Date(s).toTimeString().slice(0, 5))
    expect(times[0]).toBe('10:00')
    expect(times).not.toContain('09:00')
    expect(times).not.toContain('13:00')
    expect(times).toContain('12:30')
    expect(times).toContain('14:00')
    expect(times.at(-1)).toBe('18:30')
  })

  it("ne propose aucun créneau si la durée dépasse l'amplitude", () => {
    expect(findAvailableSlots(day, 11 * 60, 15, ctx())).toEqual([])
  })

  it('exclut les créneaux déjà passés', () => {
    const slots = findAvailableSlots(day, 30, 30, ctx({ now: at(17, 10) }))
    expect(slots.map((s) => (s - at(0)) / MIN / 60)).toEqual([17.5, 18, 18.5])
  })
})
