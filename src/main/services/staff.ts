// Gestion de l'équipe (membres, horaires, prestations assignées).

import { randomUUID } from 'node:crypto'
import { and, asc, eq, isNull } from 'drizzle-orm'
import type { DaySchedule, StaffDto } from '@shared/types'
import type { ChannelParsedInput } from '@shared/ipc'
import { staffLimit } from '@shared/edition'
import { getDb, tx } from '../db/client'
import { staff, staffServices } from '../db/schema'
import { get } from '../db/raw'
import { AppError, notFound } from '../errors'
import { getLicense } from '../license/service'
import { readSchedule, writeSchedule } from './schedules'
import { logActivity } from './activity'

type StaffRow = typeof staff.$inferSelect

function toDto(row: StaffRow, serviceIds: string[], businessWeek: DaySchedule[]): StaffDto {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    phone: row.phone,
    email: row.email,
    avatarDataUrl: row.avatarDataUrl,
    color: row.color,
    active: row.active,
    commissionRate: row.commissionRate,
    useBusinessHours: row.useBusinessHours,
    schedule: row.useBusinessHours ? businessWeek : readSchedule(row.id),
    serviceIds,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt
  }
}

export function listStaff(includeInactive = false): StaffDto[] {
  const db = getDb()
  const rows = db
    .select()
    .from(staff)
    .where(includeInactive ? isNull(staff.archivedAt) : and(isNull(staff.archivedAt), eq(staff.active, true)))
    .orderBy(asc(staff.sortOrder), asc(staff.createdAt))
    .all()
  const links = db.select().from(staffServices).all()
  const businessWeek = readSchedule(null)
  return rows.map((r) =>
    toDto(
      r,
      links.filter((l) => l.staffId === r.id).map((l) => l.serviceId),
      businessWeek
    )
  )
}

export function getStaff(id: string): StaffDto {
  const row = getDb().select().from(staff).where(eq(staff.id, id)).get()
  if (!row) throw notFound('Ce membre de l’équipe')
  const links = getDb().select().from(staffServices).where(eq(staffServices.staffId, id)).all()
  return toDto(
    row,
    links.map((l) => l.serviceId),
    readSchedule(null)
  )
}

/** Horaires effectifs d'un membre pour un jour donné (null = suit l'établissement). */
export function staffDaySchedule(staffId: string, weekday: number): DaySchedule | null {
  const row = getDb().select({ useBusinessHours: staff.useBusinessHours }).from(staff).where(eq(staff.id, staffId)).get()
  if (!row || row.useBusinessHours) return null
  return readSchedule(staffId).find((d) => d.weekday === weekday) ?? null
}

function countActiveStaff(excludeId?: string): number {
  const r = get<{ n: number }>(
    'SELECT COUNT(*) AS n FROM staff WHERE active = 1 AND archived_at IS NULL AND id != ?',
    [excludeId ?? '']
  )
  return r?.n ?? 0
}

export function assertStaffLimit(willBeActive: boolean, excludeId?: string): void {
  if (!willBeActive) return
  const limit = staffLimit(getLicense().edition)
  if (countActiveStaff(excludeId) + 1 > limit) {
    throw new AppError(
      'pro_required',
      "L'édition Free est limitée à un seul membre actif. Passez à DigiPlan Pro pour une équipe illimitée."
    )
  }
}

export function saveStaff(input: ChannelParsedInput<'staff.save'>): StaffDto {
  const now = Date.now()
  const id = input.id ?? randomUUID()
  assertStaffLimit(input.active, input.id)
  tx(() => {
    const db = getDb()
    const values = {
      name: input.name,
      role: input.role,
      phone: input.phone,
      email: input.email,
      avatarDataUrl: input.avatarDataUrl,
      color: input.color,
      active: input.active,
      commissionRate: input.commissionRate,
      useBusinessHours: input.useBusinessHours,
      updatedAt: now
    }
    if (input.id) {
      const existing = db.select({ id: staff.id }).from(staff).where(eq(staff.id, input.id)).get()
      if (!existing) throw notFound('Ce membre de l’équipe')
      if (!input.active && countActiveStaff(input.id) === 0) {
        throw new AppError('invalid', 'Au moins un membre de l’équipe doit rester actif.')
      }
      db.update(staff).set(values).where(eq(staff.id, input.id)).run()
    } else {
      const order = get<{ n: number }>('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM staff')?.n ?? 0
      db.insert(staff).values({ id, ...values, sortOrder: order, createdAt: now }).run()
    }
    if (input.useBusinessHours) writeSchedule(id, [])
    else writeSchedule(id, input.schedule)
    db.delete(staffServices).where(eq(staffServices.staffId, id)).run()
    for (const serviceId of new Set(input.serviceIds)) {
      db.insert(staffServices).values({ staffId: id, serviceId }).run()
    }
  })
  logActivity(input.id ? 'update' : 'create', 'staff', id, { name: input.name })
  return getStaff(id)
}

/** Supprime un membre sans historique, sinon l'archive pour préserver les rendez-vous passés. */
export function deleteStaff(id: string): { archived: boolean } {
  const db = getDb()
  const row = db.select().from(staff).where(eq(staff.id, id)).get()
  if (!row) throw notFound('Ce membre de l’équipe')
  if (row.active && countActiveStaff(id) === 0) {
    throw new AppError('invalid', 'Impossible de supprimer le dernier membre actif de l’équipe.')
  }
  const used = get<{ n: number }>('SELECT COUNT(*) AS n FROM appointments WHERE staff_id = ?', [id])?.n ?? 0
  if (used > 0) {
    db.update(staff).set({ active: false, archivedAt: Date.now(), updatedAt: Date.now() }).where(eq(staff.id, id)).run()
    logActivity('archive', 'staff', id)
    return { archived: true }
  }
  db.delete(staff).where(eq(staff.id, id)).run()
  logActivity('delete', 'staff', id)
  return { archived: false }
}
