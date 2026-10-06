// Moteur de disponibilité : calcule les créneaux libres et détecte les conflits.
// Fonctions pures, sans accès à la base : le processus principal fournit les données.

import type { DaySchedule, TimeRange } from '../types'
import { MINUTE, atMinutes, overlaps } from './time'

export interface BusyInterval {
  appointmentId: string
  /** Début occupé, tampon « avant » inclus. */
  start: number
  /** Fin occupée, tampon « après » inclus. */
  end: number
  label?: string
}

export type ConflictCode =
  | 'closed'
  | 'outside_business_hours'
  | 'staff_off'
  | 'outside_staff_hours'
  | 'business_break'
  | 'staff_break'
  | 'staff_busy'
  | 'resource_busy'
  | 'past'
  | 'invalid_duration'

export interface Conflict {
  code: ConflictCode
  message: string
  /** Un conflit bloquant empêche l'enregistrement (sauf chevauchement explicitement autorisé). */
  blocking: boolean
  appointmentId?: string
}

export interface SlotContext {
  /** Horaires de l'établissement pour ce jour. */
  businessDay: DaySchedule | null
  /** Horaires du membre de l'équipe pour ce jour (null = suit les horaires de l'établissement). */
  staffDay: DaySchedule | null
  staffBusy: BusyInterval[]
  resourceBusy: BusyInterval[]
  bufferBeforeMin: number
  bufferAfterMin: number
  /** Si vrai, les chevauchements avec d'autres rendez-vous ne sont pas bloquants. */
  allowOverlap?: boolean
  /** Instant courant ; les créneaux passés sont refusés si fourni. */
  now?: number
}

const fmt = (ms: number) => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function rangesFor(dayMs: number, ranges: TimeRange[]): Array<{ start: number; end: number }> {
  return ranges.map((r) => ({ start: atMinutes(dayMs, r.start), end: atMinutes(dayMs, r.end) }))
}

/**
 * Vérifie un créneau [start, end[ et retourne la liste des conflits (vide = disponible).
 */
export function checkSlot(start: number, end: number, ctx: SlotContext): Conflict[] {
  const conflicts: Conflict[] = []
  if (!(end > start)) {
    return [{ code: 'invalid_duration', message: 'La durée du rendez-vous est invalide.', blocking: true }]
  }
  const dayMs = start

  if (ctx.now !== undefined && start < ctx.now - MINUTE) {
    conflicts.push({ code: 'past', message: 'Ce créneau est déjà passé.', blocking: false })
  }

  const biz = ctx.businessDay
  if (!biz || !biz.open) {
    conflicts.push({ code: 'closed', message: "L'établissement est fermé ce jour-là.", blocking: true })
  } else {
    const open = atMinutes(dayMs, biz.start)
    const close = atMinutes(dayMs, biz.end)
    if (start < open || end > close) {
      conflicts.push({
        code: 'outside_business_hours',
        message: `En dehors des horaires d'ouverture (${fmt(open)} – ${fmt(close)}).`,
        blocking: true
      })
    }
    for (const br of rangesFor(dayMs, biz.breaks)) {
      if (overlaps(start, end, br.start, br.end)) {
        conflicts.push({
          code: 'business_break',
          message: `Pendant la pause de l'établissement (${fmt(br.start)} – ${fmt(br.end)}).`,
          blocking: true
        })
      }
    }
  }

  const staff = ctx.staffDay
  if (staff) {
    if (!staff.open) {
      conflicts.push({ code: 'staff_off', message: 'Ce membre de l’équipe ne travaille pas ce jour-là.', blocking: true })
    } else {
      const s = atMinutes(dayMs, staff.start)
      const e = atMinutes(dayMs, staff.end)
      if (start < s || end > e) {
        conflicts.push({
          code: 'outside_staff_hours',
          message: `En dehors de ses horaires de travail (${fmt(s)} – ${fmt(e)}).`,
          blocking: true
        })
      }
      for (const br of rangesFor(dayMs, staff.breaks)) {
        if (overlaps(start, end, br.start, br.end)) {
          conflicts.push({
            code: 'staff_break',
            message: `Pendant sa pause (${fmt(br.start)} – ${fmt(br.end)}).`,
            blocking: true
          })
        }
      }
    }
  }

  const occStart = start - ctx.bufferBeforeMin * MINUTE
  const occEnd = end + ctx.bufferAfterMin * MINUTE
  const overlapBlocking = !ctx.allowOverlap

  for (const b of ctx.staffBusy) {
    if (overlaps(occStart, occEnd, b.start, b.end)) {
      conflicts.push({
        code: 'staff_busy',
        message: b.label
          ? `Chevauche un autre rendez-vous (${b.label}, ${fmt(b.start)} – ${fmt(b.end)}).`
          : `Chevauche un autre rendez-vous (${fmt(b.start)} – ${fmt(b.end)}).`,
        blocking: overlapBlocking,
        appointmentId: b.appointmentId
      })
    }
  }
  for (const b of ctx.resourceBusy) {
    if (overlaps(occStart, occEnd, b.start, b.end)) {
      conflicts.push({
        code: 'resource_busy',
        message: `La ressource est déjà réservée (${fmt(b.start)} – ${fmt(b.end)}).`,
        blocking: true,
        appointmentId: b.appointmentId
      })
    }
  }
  return conflicts
}

export function hasBlockingConflict(conflicts: Conflict[]): boolean {
  return conflicts.some((c) => c.blocking)
}

/**
 * Liste les débuts de créneaux disponibles pour une journée.
 * @param dayMs  n'importe quel instant du jour concerné
 * @param durationMin  durée totale des prestations
 * @param stepMin  pas entre deux créneaux
 */
export function findAvailableSlots(dayMs: number, durationMin: number, stepMin: number, ctx: SlotContext): number[] {
  const biz = ctx.businessDay
  if (!biz || !biz.open || durationMin <= 0 || stepMin <= 0) return []
  const staff = ctx.staffDay
  if (staff && !staff.open) return []

  const fromMin = Math.max(biz.start, staff ? staff.start : biz.start)
  const toMin = Math.min(biz.end, staff ? staff.end : biz.end)
  const slots: number[] = []
  // Aligne le premier créneau sur le pas.
  const first = Math.ceil(fromMin / stepMin) * stepMin
  for (let m = first; m + durationMin <= toMin; m += stepMin) {
    const start = atMinutes(dayMs, m)
    const end = start + durationMin * MINUTE
    if (ctx.now !== undefined && start < ctx.now) continue
    const conflicts = checkSlot(start, end, { ...ctx, allowOverlap: false, now: undefined })
    if (conflicts.length === 0) slots.push(start)
  }
  return slots
}

/** Intervalle occupé par un rendez-vous existant (tampons inclus). */
export function toBusyInterval(
  appointment: { id: string; startAt: number; endAt: number; bufferBeforeMin: number; bufferAfterMin: number },
  label?: string
): BusyInterval {
  return {
    appointmentId: appointment.id,
    start: appointment.startAt - appointment.bufferBeforeMin * MINUTE,
    end: appointment.endAt + appointment.bufferAfterMin * MINUTE,
    label
  }
}
