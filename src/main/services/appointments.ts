// Rendez-vous : lecture, création (avec récurrence), modification de séries, déplacement, statuts.

import { randomUUID } from 'node:crypto'
import type { AppointmentDto, AppointmentServiceLine, AppointmentStatus, ReminderStatus } from '@shared/types'
import type { ChannelParsedInput } from '@shared/ipc'
import { checkSlot, findAvailableSlots, hasBlockingConflict, type Conflict, type SlotContext } from '@shared/domain/availability'
import { computeAppointmentTotals } from '@shared/domain/pricing'
import { generateOccurrences, type RecurrenceRule } from '@shared/domain/recurrence'
import { MINUTE, isoWeekday } from '@shared/domain/time'
import { fromIsoDate } from '@shared/format'
import { getDb, tx } from '../db/client'
import { appointmentSeries, appointmentServices, appointments } from '../db/schema'
import { all, get, placeholders, run } from '../db/raw'
import { AppError, notFound } from '../errors'
import { isPro } from '../license/service'
import { getCategoryConfig } from '@shared/categories'
import { readSchedule } from './schedules'
import { staffDaySchedule } from './staff'
import { getServicesByIds } from './catalog'
import { createClientInline } from './clients'
import { getSettings } from './settings'
import { getBusiness } from './business'
import { createPaymentInTx } from './payments'
import { logActivity } from './activity'

// ---------- Écouteurs (rappels, Google Calendar) ----------

type ChangeKind = 'upsert' | 'delete'
type Listener = (ids: string[], kind: ChangeKind) => void
const listeners: Listener[] = []

export function onAppointmentsChanged(listener: Listener): void {
  listeners.push(listener)
}

function notify(ids: string[], kind: ChangeKind) {
  for (const l of listeners) {
    try {
      l(ids, kind)
    } catch {
      // Un écouteur défaillant ne doit pas annuler l'opération principale.
    }
  }
}

// ---------- Lecture ----------

interface ApptRow {
  id: string
  client_id: string
  staff_id: string | null
  resource_id: string | null
  start_at: number
  end_at: number
  buffer_before_min: number
  buffer_after_min: number
  status: AppointmentStatus
  subtotal: number
  discount: number
  total: number
  notes: string
  reminder_enabled: number
  reminder_offset_min: number
  series_id: string | null
  series_index: number | null
  google_sync_status: 'pending' | 'synced' | 'error' | null
  google_sync_error: string | null
  created_at: number
  updated_at: number
  client_first: string
  client_last: string
  client_phone: string
  client_wa: string
  staff_name: string | null
  staff_color: string | null
  resource_name: string | null
  paid: number
  reminder_status: ReminderStatus | null
}

interface LineRow {
  appointment_id: string
  service_id: string | null
  name: string
  duration_min: number
  price: number
  color: string | null
}

const SELECT = `
  SELECT a.*, c.first_name AS client_first, c.last_name AS client_last, c.phone AS client_phone,
    c.whatsapp_phone AS client_wa, s.name AS staff_name, s.color AS staff_color, r.name AS resource_name,
    (SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.appointment_id = a.id AND p.voided_at IS NULL) AS paid,
    (SELECT rm.status FROM reminders rm WHERE rm.appointment_id = a.id AND rm.kind = 'reminder'
       ORDER BY rm.created_at DESC LIMIT 1) AS reminder_status
  FROM appointments a
  JOIN clients c ON c.id = a.client_id
  LEFT JOIN staff s ON s.id = a.staff_id
  LEFT JOIN resources r ON r.id = a.resource_id`

function mapRows(rows: ApptRow[], lines: LineRow[]): AppointmentDto[] {
  const byAppt = new Map<string, AppointmentServiceLine[]>()
  for (const l of lines) {
    const list = byAppt.get(l.appointment_id) ?? []
    list.push({ serviceId: l.service_id, name: l.name, durationMin: l.duration_min, price: l.price, color: l.color })
    byAppt.set(l.appointment_id, list)
  }
  return rows.map((r) => ({
    id: r.id,
    clientId: r.client_id,
    clientName: `${r.client_first} ${r.client_last}`.trim(),
    clientPhone: r.client_phone,
    clientWhatsapp: r.client_wa || r.client_phone,
    staffId: r.staff_id,
    staffName: r.staff_name,
    staffColor: r.staff_color,
    resourceId: r.resource_id,
    resourceName: r.resource_name,
    startAt: r.start_at,
    endAt: r.end_at,
    status: r.status,
    services: byAppt.get(r.id) ?? [],
    subtotal: r.subtotal,
    discount: r.discount,
    total: r.total,
    paid: r.paid,
    balance: Math.max(0, r.total - r.paid),
    notes: r.notes,
    reminderEnabled: Boolean(r.reminder_enabled),
    reminderOffsetMin: r.reminder_offset_min,
    reminderStatus: r.reminder_status,
    seriesId: r.series_id,
    googleSyncStatus: r.google_sync_status,
    googleSyncError: r.google_sync_error,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }))
}

/** Charge des rendez-vous selon une clause WHERE portant sur l'alias « a ». */
export function loadAppointments(where: string, params: Record<string, unknown> = {}, orderLimit = 'ORDER BY a.start_at'): AppointmentDto[] {
  const rows = all<ApptRow>(`${SELECT} WHERE a.deleted_at IS NULL AND (${where}) ${orderLimit}`, params)
  if (!rows.length) return []
  const ids = rows.map((r) => r.id)
  const lines = all<LineRow>(
    `SELECT ap.appointment_id, ap.service_id, ap.name, ap.duration_min, ap.price, sv.color
     FROM appointment_services ap LEFT JOIN services sv ON sv.id = ap.service_id
     WHERE ap.appointment_id IN (${placeholders(ids.length)}) ORDER BY ap.sort_order`,
    ids
  )
  return mapRows(rows, lines)
}

export function listRange(from: number, to: number): AppointmentDto[] {
  return loadAppointments('a.start_at < @to AND a.end_at > @from', { from, to })
}

export function getAppointment(id: string): AppointmentDto {
  const [a] = loadAppointments('a.id = @id', { id })
  if (!a) throw notFound('Ce rendez-vous')
  return a
}

interface RawAppt {
  id: string
  client_id: string
  staff_id: string | null
  resource_id: string | null
  start_at: number
  end_at: number
  status: AppointmentStatus
  series_id: string | null
  series_index: number | null
}

function rawAppointment(id: string): RawAppt {
  const row = get<RawAppt>('SELECT * FROM appointments WHERE id = ? AND deleted_at IS NULL', [id])
  if (!row) throw notFound('Ce rendez-vous')
  return row
}

// ---------- Disponibilités ----------

interface ContextOptions {
  staffId: string
  resourceId: string | null
  dayMs: number
  excludeIds: string[]
  bufferBeforeMin: number
  bufferAfterMin: number
}

function busyFor(column: 'staff_id' | 'resource_id', value: string, dayMs: number, excludeIds: string[]) {
  const from = dayMs - 36 * 60 * MINUTE
  const to = dayMs + 36 * 60 * MINUTE
  const rows = all<{ id: string; start_at: number; end_at: number; buffer_before_min: number; buffer_after_min: number; name: string }>(
    `SELECT a.id, a.start_at, a.end_at, a.buffer_before_min, a.buffer_after_min,
            TRIM(c.first_name || ' ' || c.last_name) AS name
     FROM appointments a JOIN clients c ON c.id = a.client_id
     WHERE a.${column} = @value AND a.deleted_at IS NULL
       AND a.status IN ('pending','confirmed','arrived','in_progress','completed')
       AND a.start_at < @to AND a.end_at > @from`,
    { value, from, to }
  )
  return rows
    .filter((r) => !excludeIds.includes(r.id))
    .map((r) => ({
      appointmentId: r.id,
      start: r.start_at - r.buffer_before_min * MINUTE,
      end: r.end_at + r.buffer_after_min * MINUTE,
      label: r.name
    }))
}

function resourcesActive(): boolean {
  return isPro() && getSettings().resourcesEnabled
}

export function buildSlotContext(o: ContextOptions): SlotContext {
  const weekday = isoWeekday(o.dayMs)
  const businessDay = readSchedule(null).find((d) => d.weekday === weekday) ?? null
  return {
    businessDay,
    staffDay: staffDaySchedule(o.staffId, weekday),
    staffBusy: busyFor('staff_id', o.staffId, o.dayMs, o.excludeIds),
    resourceBusy: o.resourceId && resourcesActive() ? busyFor('resource_id', o.resourceId, o.dayMs, o.excludeIds) : [],
    bufferBeforeMin: o.bufferBeforeMin,
    bufferAfterMin: o.bufferAfterMin,
    allowOverlap: getSettings().allowOverlap,
    now: Date.now()
  }
}

function buffersFor(serviceIds: Array<string | null>): { before: number; after: number } {
  const ids = serviceIds.filter((s): s is string => Boolean(s))
  const rows = getServicesByIds(ids)
  if (!rows.length) return { before: 0, after: 0 }
  const first = rows.find((r) => r.id === ids[0])
  const last = rows.find((r) => r.id === ids[ids.length - 1])
  return { before: first?.bufferBeforeMin ?? 0, after: last?.bufferAfterMin ?? 0 }
}

export function checkAppointment(input: ChannelParsedInput<'appointments.check'>): Conflict[] {
  const buffers = buffersFor(input.serviceIds)
  const ctx = buildSlotContext({
    staffId: input.staffId,
    resourceId: input.resourceId ?? null,
    dayMs: input.startAt,
    excludeIds: input.excludeId ? [input.excludeId] : [],
    bufferBeforeMin: buffers.before,
    bufferAfterMin: buffers.after
  })
  return checkSlot(input.startAt, input.startAt + input.durationMin * MINUTE, ctx)
}

export function availableSlots(input: ChannelParsedInput<'appointments.slots'>): number[] {
  const dayMs = fromIsoDate(input.date)
  const buffers = buffersFor(input.serviceIds)
  const ctx = buildSlotContext({
    staffId: input.staffId,
    resourceId: input.resourceId ?? null,
    dayMs,
    excludeIds: input.excludeId ? [input.excludeId] : [],
    bufferBeforeMin: buffers.before,
    bufferAfterMin: buffers.after
  })
  const business = getBusiness()
  const step = business ? getCategoryConfig(business.categoryId).slotStepMin : 15
  return findAvailableSlots(dayMs, input.durationMin, step, ctx)
}

// ---------- Écriture ----------

type SaveInput = ChannelParsedInput<'appointments.save'>
type SaveResult = { ok: true; appointment: AppointmentDto; createdCount: number } | { ok: false; conflicts: Conflict[]; occurrence?: number }

function assertStaff(staffId: string) {
  const s = get<{ active: number; archived_at: number | null }>('SELECT active, archived_at FROM staff WHERE id = ?', [staffId])
  if (!s || s.archived_at) throw new AppError('invalid', "Le membre de l'équipe sélectionné n'existe plus.")
}

/** Retourne les conflits à présenter, ou null si l'enregistrement peut continuer. */
function evaluate(conflicts: Conflict[], acknowledge: boolean | undefined): Conflict[] | null {
  if (hasBlockingConflict(conflicts)) return conflicts
  if (conflicts.length && !acknowledge) return conflicts
  return null
}

function insertLines(appointmentId: string, lines: SaveInput['services']) {
  const db = getDb()
  lines.forEach((l, i) =>
    db
      .insert(appointmentServices)
      .values({
        id: randomUUID(),
        appointmentId,
        serviceId: l.serviceId,
        name: l.name,
        durationMin: l.durationMin,
        price: l.price,
        sortOrder: i
      })
      .run()
  )
}

export function saveAppointment(input: SaveInput): SaveResult {
  assertStaff(input.staffId)
  const resourceId = resourcesActive() ? (input.resourceId ?? null) : null
  if (input.recurrence && !input.id && !isPro()) {
    throw new AppError('pro_required', 'Les rendez-vous récurrents sont disponibles avec DigiPlan Pro.')
  }
  if (!input.clientId && !input.newClient) throw new AppError('invalid', 'Sélectionnez ou créez un client.')

  const totals = computeAppointmentTotals(input.services, input.discount)
  const durationMs = totals.durationMin * MINUTE
  const buffers = buffersFor(input.services.map((s) => s.serviceId))
  const now = Date.now()
  const common = {
    staffId: input.staffId,
    resourceId,
    bufferBeforeMin: buffers.before,
    bufferAfterMin: buffers.after,
    subtotal: totals.subtotal,
    discount: totals.discount,
    total: totals.total,
    notes: input.notes,
    reminderEnabled: input.reminderEnabled,
    reminderOffsetMin: input.reminderOffsetMin,
    updatedAt: now
  }
  const contextFor = (start: number, excludeIds: string[]) =>
    buildSlotContext({
      staffId: input.staffId,
      resourceId,
      dayMs: start,
      excludeIds,
      bufferBeforeMin: buffers.before,
      bufferAfterMin: buffers.after
    })

  // ----- Création -----
  if (!input.id) {
    const rule = input.recurrence as RecurrenceRule | null | undefined
    const starts = rule ? generateOccurrences(input.startAt, rule) : [input.startAt]
    for (let i = 0; i < starts.length; i++) {
      const s = starts[i]
      const conflicts = checkSlot(s, s + durationMs, contextFor(s, []))
      // Le créneau passé n'est signalé que pour la première occurrence.
      const relevant = i === 0 ? conflicts : conflicts.filter((c) => c.code !== 'past')
      const problem = evaluate(relevant, input.acknowledgeWarnings)
      if (problem) return { ok: false, conflicts: problem, occurrence: rule ? i : undefined }
    }

    const ids: string[] = []
    tx(() => {
      const db = getDb()
      const clientId = input.clientId ?? createClientInline(input.newClient!)
      let seriesId: string | null = null
      if (rule && starts.length > 1) {
        seriesId = randomUUID()
        db.insert(appointmentSeries)
          .values({ id: seriesId, frequency: rule.frequency, count: rule.count ?? null, until: rule.until ?? null, createdAt: now })
          .run()
      }
      starts.forEach((s, i) => {
        const id = randomUUID()
        ids.push(id)
        db.insert(appointments)
          .values({
            id,
            clientId,
            ...common,
            startAt: s,
            endAt: s + durationMs,
            status: i === 0 ? input.status : input.status === 'confirmed' ? 'confirmed' : 'pending',
            seriesId,
            seriesIndex: seriesId ? i : null,
            statusChangedAt: now,
            createdAt: now
          })
          .run()
        insertLines(id, input.services)
      })
      if (input.initialPayment && input.initialPayment.amount > 0) {
        createPaymentInTx({
          appointmentId: ids[0],
          clientId,
          amount: input.initialPayment.amount,
          method: input.initialPayment.method,
          paidAt: now,
          note: ''
        })
      }
    })
    logActivity('create', 'appointment', ids[0], { count: ids.length })
    notify(ids, 'upsert')
    return { ok: true, appointment: getAppointment(ids[0]), createdCount: ids.length }
  }

  // ----- Modification -----
  const existing = rawAppointment(input.id)
  const clientId = input.clientId ?? existing.client_id
  const scope = existing.series_id ? (input.scope ?? 'single') : 'single'

  let targets: RawAppt[] = [existing]
  if (scope !== 'single' && existing.series_id) {
    targets = all<RawAppt>(
      `SELECT * FROM appointments WHERE series_id = @series AND deleted_at IS NULL
         AND (id = @id OR status NOT IN ('completed','cancelled','no_show'))
         ${scope === 'following' ? 'AND series_index >= @index' : ''}
       ORDER BY start_at`,
      { series: existing.series_id, id: existing.id, index: existing.series_index ?? 0 }
    )
  }
  const delta = input.startAt - existing.start_at
  const targetIds = targets.map((t) => t.id)
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i]
    const s = t.id === existing.id ? input.startAt : t.start_at + delta
    const conflicts = checkSlot(s, s + durationMs, contextFor(s, targetIds)).filter(
      (c) => c.code !== 'past' || t.id === existing.id
    )
    // Modifier un rendez-vous passé (ex. ajouter une note) ne doit pas déclencher d'avertissement « passé ».
    const relevant = conflicts.filter((c) => !(c.code === 'past' && s === existing.start_at))
    const problem = evaluate(relevant, input.acknowledgeWarnings)
    if (problem) return { ok: false, conflicts: problem, occurrence: targets.length > 1 ? i : undefined }
  }

  tx(() => {
    for (const t of targets) {
      const s = t.id === existing.id ? input.startAt : t.start_at + delta
      const isEdited = t.id === existing.id
      const status = isEdited ? input.status : t.status
      run(
        `UPDATE appointments SET client_id = @clientId, staff_id = @staffId, resource_id = @resourceId,
           start_at = @start, end_at = @end, buffer_before_min = @bb, buffer_after_min = @ba,
           subtotal = @subtotal, discount = @discount, total = @total, notes = @notes,
           reminder_enabled = @re, reminder_offset_min = @ro, status = @status,
           status_changed_at = CASE WHEN status != @status THEN @now ELSE status_changed_at END,
           updated_at = @now WHERE id = @id`,
        {
          id: t.id,
          clientId,
          staffId: common.staffId,
          resourceId: common.resourceId,
          start: s,
          end: s + durationMs,
          bb: common.bufferBeforeMin,
          ba: common.bufferAfterMin,
          subtotal: common.subtotal,
          discount: common.discount,
          total: common.total,
          notes: common.notes,
          re: common.reminderEnabled ? 1 : 0,
          ro: common.reminderOffsetMin,
          status,
          now
        }
      )
      run('DELETE FROM appointment_services WHERE appointment_id = ?', [t.id])
      insertLines(t.id, input.services)
    }
  })
  logActivity('update', 'appointment', existing.id, { scope, count: targets.length })
  notify(targetIds, 'upsert')
  return { ok: true, appointment: getAppointment(existing.id), createdCount: 0 }
}

export function moveAppointment(
  input: ChannelParsedInput<'appointments.move'>
): { ok: true; appointment: AppointmentDto } | { ok: false; conflicts: Conflict[] } {
  const existing = getAppointment(input.id)
  const staffId = input.staffId ?? existing.staffId
  if (!staffId) throw new AppError('invalid', "Ce rendez-vous n'a pas de membre de l'équipe assigné.")
  if (input.endAt <= input.startAt) throw new AppError('invalid', 'La durée du rendez-vous est invalide.')
  const row = get<{ buffer_before_min: number; buffer_after_min: number }>(
    'SELECT buffer_before_min, buffer_after_min FROM appointments WHERE id = ?',
    [input.id]
  )!
  const ctx = buildSlotContext({
    staffId,
    resourceId: existing.resourceId,
    dayMs: input.startAt,
    excludeIds: [input.id],
    bufferBeforeMin: row.buffer_before_min,
    bufferAfterMin: row.buffer_after_min
  })
  // Corriger un rendez-vous déjà passé (ex. décalage de 15 min) ne déclenche pas l'avertissement « créneau passé ».
  const conflicts = checkSlot(input.startAt, input.endAt, ctx).filter((c) => !(c.code === 'past' && existing.startAt < Date.now()))
  const problem = evaluate(conflicts, input.acknowledgeWarnings)
  if (problem) return { ok: false, conflicts: problem }
  run('UPDATE appointments SET start_at = ?, end_at = ?, staff_id = ?, updated_at = ? WHERE id = ?', [
    input.startAt,
    input.endAt,
    staffId,
    Date.now(),
    input.id
  ])
  logActivity('move', 'appointment', input.id)
  notify([input.id], 'upsert')
  return { ok: true, appointment: getAppointment(input.id) }
}

export function setAppointmentStatus(id: string, status: AppointmentStatus): AppointmentDto {
  const now = Date.now()
  const r = run(
    'UPDATE appointments SET status = ?, status_changed_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
    [status, now, now, id]
  )
  if (!r.changes) throw notFound('Ce rendez-vous')
  logActivity('status', 'appointment', id, { status })
  notify([id], 'upsert')
  return getAppointment(id)
}

export function seriesInfo(id: string): { total: number; following: number; index: number } | null {
  const a = rawAppointment(id)
  if (!a.series_id) return null
  const total = get<{ n: number }>('SELECT COUNT(*) AS n FROM appointments WHERE series_id = ? AND deleted_at IS NULL', [a.series_id])?.n ?? 0
  const following =
    get<{ n: number }>(
      'SELECT COUNT(*) AS n FROM appointments WHERE series_id = ? AND deleted_at IS NULL AND series_index >= ?',
      [a.series_id, a.series_index ?? 0]
    )?.n ?? 0
  return { total, following, index: (a.series_index ?? 0) + 1 }
}

/**
 * Suppression (logique) d'un rendez-vous ou d'une partie de sa série.
 * Les rendez-vous ayant des paiements ou déjà terminés ne sont jamais supprimés en masse.
 */
export function deleteAppointment(id: string, scope: 'single' | 'following' | 'series'): number {
  const a = rawAppointment(id)
  const paid = get<{ n: number }>('SELECT COUNT(*) AS n FROM payments WHERE appointment_id = ? AND voided_at IS NULL', [id])?.n ?? 0
  if (paid > 0) {
    throw new AppError(
      'has_payments',
      'Ce rendez-vous a des paiements enregistrés. Annulez-le plutôt, ou annulez d’abord les paiements.'
    )
  }
  let ids = [id]
  if (scope !== 'single' && a.series_id) {
    ids = all<{ id: string }>(
      `SELECT a.id FROM appointments a WHERE a.series_id = @series AND a.deleted_at IS NULL
         AND a.status != 'completed'
         AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.appointment_id = a.id AND p.voided_at IS NULL)
         ${scope === 'following' ? 'AND a.series_index >= @index' : ''}`,
      { series: a.series_id, index: a.series_index ?? 0 }
    ).map((r) => r.id)
    if (!ids.includes(id)) ids.push(id)
  }
  const now = Date.now()
  tx(() => {
    for (const x of ids) run('UPDATE appointments SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, x])
  })
  logActivity('delete', 'appointment', id, { scope, count: ids.length })
  notify(ids, 'delete')
  return ids.length
}
