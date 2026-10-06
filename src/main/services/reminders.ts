// Rappels WhatsApp automatiques : planification persistée, anti-doublon, reprise après redémarrage.

import { randomUUID } from 'node:crypto'
import type { ReminderDto, ReminderStatus } from '@shared/types'
import {
  ON_TIME_GRACE_MS,
  STALE_SENDING_MS,
  reminderDueAt,
  runReminderTick,
  type DueReminder,
  type ReminderSender,
  type ReminderStore
} from '@shared/domain/reminders'
import { isClosedStatus } from '@shared/status'
import { toWhatsAppNumber } from '@shared/domain/phone'
import { all, get, run } from '../db/raw'
import { notFound } from '../errors'
import { createLogger } from '../logger'
import { changed } from '../ipc/registry'
import { isPro } from '../license/service'
import { getAppointment } from './appointments'
import { getSettings } from './settings'
import { renderForAppointment } from './templates'
import { isWhatsAppReady, sendWhatsAppMessage } from '../integrations/whatsapp'

const log = createLogger('reminders')
const TICK_MS = 30_000

// ---------- Stockage SQLite ----------

export const sqliteReminderStore: ReminderStore = {
  listDue(now) {
    return all<{
      id: string
      appointment_id: string
      scheduled_at: number
      attempts: number
      start_at: number
      status: DueReminder['appointmentStatus']
      deleted_at: number | null
    }>(
      `SELECT r.id, r.appointment_id, r.scheduled_at, r.attempts, a.start_at, a.status, a.deleted_at
       FROM reminders r JOIN appointments a ON a.id = r.appointment_id
       WHERE r.status = 'scheduled' AND r.scheduled_at <= @now AND (r.next_attempt_at IS NULL OR r.next_attempt_at <= @now)
       ORDER BY r.scheduled_at LIMIT 50`,
      { now }
    ).map((r) => ({
      id: r.id,
      appointmentId: r.appointment_id,
      scheduledAt: r.scheduled_at,
      attempts: r.attempts,
      appointmentStartAt: r.start_at,
      appointmentStatus: r.status,
      appointmentDeleted: r.deleted_at !== null
    }))
  },
  claim(id, now) {
    return (
      run("UPDATE reminders SET status = 'sending', attempts = attempts + 1, updated_at = ? WHERE id = ? AND status = 'scheduled'", [
        now,
        id
      ]).changes === 1
    )
  },
  markSent(id, now, message) {
    run("UPDATE reminders SET status = 'sent', sent_at = ?, message = ?, error = NULL, updated_at = ? WHERE id = ?", [now, message, now, id])
  },
  markFailed(id, now, error, retryAt) {
    if (retryAt) {
      run("UPDATE reminders SET status = 'scheduled', next_attempt_at = ?, error = ?, updated_at = ? WHERE id = ?", [retryAt, error, now, id])
    } else {
      run("UPDATE reminders SET status = 'failed', error = ?, updated_at = ? WHERE id = ?", [error, now, id])
    }
  },
  markSkipped(id, now, reason) {
    run("UPDATE reminders SET status = 'skipped', error = ?, updated_at = ? WHERE id = ?", [reason, now, id])
  }
}

// ---------- Envoi ----------

const KIND_TEMPLATE: Record<string, string> = { reminder: 'reminder', confirmation: 'confirmation' }

const whatsappSender: ReminderSender = {
  isReady: () => isPro() && isWhatsAppReady(),
  async send(r) {
    const kind = get<{ kind: string }>('SELECT kind FROM reminders WHERE id = ?', [r.id])?.kind ?? 'reminder'
    const appointment = getAppointment(r.appointmentId)
    const message = renderForAppointment(KIND_TEMPLATE[kind] ?? 'reminder', appointment)
    await sendWhatsAppMessage(appointment.clientWhatsapp, message)
    return message
  }
}

// ---------- Synchronisation avec les rendez-vous ----------

function upsertScheduled(appointmentId: string, kind: 'reminder' | 'confirmation', dedupeKey: string, scheduledAt: number) {
  const now = Date.now()
  const existing = get<{ id: string; status: ReminderStatus }>('SELECT id, status FROM reminders WHERE dedupe_key = ?', [dedupeKey])
  if (!existing) {
    run(
      `INSERT OR IGNORE INTO reminders (id, appointment_id, channel, kind, dedupe_key, scheduled_at, status, attempts, created_at, updated_at)
       VALUES (?, ?, 'whatsapp', ?, ?, ?, 'scheduled', 0, ?, ?)`,
      [randomUUID(), appointmentId, kind, dedupeKey, scheduledAt, now, now]
    )
  } else if (existing.status === 'cancelled') {
    // Rendez-vous replacé sur un horaire déjà planifié auparavant : on réactive le rappel annulé.
    run(
      "UPDATE reminders SET status = 'scheduled', attempts = 0, next_attempt_at = NULL, error = NULL, updated_at = ? WHERE id = ?",
      [now, existing.id]
    )
  }
  // Statut « sent » : le rappel a déjà été envoyé pour cet horaire, on n'envoie jamais de doublon.
}

/** Recalcule le rappel d'un rendez-vous après création, modification ou changement de statut. */
export function syncReminderFor(appointmentId: string): void {
  const now = Date.now()
  const a = (() => {
    try {
      return getAppointment(appointmentId)
    } catch {
      return null
    }
  })()
  const hasPhone = Boolean(a && toWhatsAppNumber(a.clientWhatsapp))
  const wanted = Boolean(a && isPro() && a.reminderEnabled && !isClosedStatus(a.status) && a.startAt > now && hasPhone)
  const key = a ? `${a.id}:reminder:${a.startAt}:${a.reminderOffsetMin}` : ''

  run(
    `UPDATE reminders SET status = 'cancelled', error = ?, updated_at = ?
     WHERE appointment_id = ? AND kind IN ('reminder','confirmation') AND status = 'scheduled' AND dedupe_key != ?
       AND (kind = 'reminder' OR ? = 1)`,
    [a ? 'Rendez-vous modifié' : 'Rendez-vous supprimé', now, appointmentId, wanted ? key : '', a && !isClosedStatus(a.status) ? 0 : 1]
  )
  if (!a || !wanted) return
  const dueAt = reminderDueAt(a.startAt, a.reminderOffsetMin)
  // Rendez-vous pris trop tard pour ce délai de rappel : on ne crée pas de rappel « en retard ».
  const existing = get<{ id: string }>('SELECT id FROM reminders WHERE dedupe_key = ?', [key])
  if (!existing && dueAt < now - ON_TIME_GRACE_MS) return
  upsertScheduled(a.id, 'reminder', key, Math.max(dueAt, now))
}

/** Confirmation explicite demandée par l'utilisateur lors de l'enregistrement. */
export function queueConfirmation(appointmentId: string): void {
  if (!isPro()) return
  const a = getAppointment(appointmentId)
  if (!toWhatsAppNumber(a.clientWhatsapp)) return
  upsertScheduled(a.id, 'confirmation', `${a.id}:confirmation:${a.startAt}`, Date.now())
  kick()
}

// ---------- Ordonnanceur ----------

let timer: NodeJS.Timeout | null = null
let running = false
let kickTimer: NodeJS.Timeout | null = null

async function tick() {
  if (running) return
  running = true
  try {
    recoverInterrupted(Date.now() - STALE_SENDING_MS)
    const policy = { lateMinLeadMin: getSettings().lateReminderMinLeadMin }
    const result = await runReminderTick(sqliteReminderStore, whatsappSender, Date.now(), policy)
    if (result.sent || result.failed || result.skipped) {
      log.info('Cycle de rappels', result)
      changed('reminders', 'appointments')
    }
  } catch (err) {
    log.error('Cycle de rappels', err)
  } finally {
    running = false
  }
}

/** Déclenche un cycle rapidement (regroupe les appels rapprochés). */
export function kick(): void {
  if (kickTimer) return
  kickTimer = setTimeout(() => {
    kickTimer = null
    void tick()
  }, 1500)
}

/**
 * Un envoi resté « en cours » (arrêt brutal, envoi bloqué) n'est jamais renvoyé automatiquement :
 * le message a pu partir, un renvoi créerait un doublon. Il passe en échec pour vérification manuelle.
 */
function recoverInterrupted(olderThan: number): void {
  const r = run("UPDATE reminders SET status = 'failed', error = ?, updated_at = ? WHERE status = 'sending' AND updated_at <= ?", [
    'Envoi interrompu. Vérifiez sur WhatsApp avant de renvoyer.',
    Date.now(),
    olderThan
  ])
  if (r.changes) log.warn(`${r.changes} rappel(s) interrompu(s) marqué(s) en échec`)
}

export function startReminderScheduler(): void {
  // Au démarrage, aucun envoi ne peut être réellement en cours.
  recoverInterrupted(Date.now())
  if (timer) clearInterval(timer)
  timer = setInterval(() => void tick(), TICK_MS)
  setTimeout(() => void tick(), 5000)
}

export function stopReminderScheduler(): void {
  if (timer) clearInterval(timer)
  timer = null
}

// ---------- Historique ----------

export function listReminders(status: 'scheduled' | 'sent' | 'failed' | 'skipped' | 'all', limit: number): ReminderDto[] {
  return all<{
    id: string
    appointment_id: string
    kind: ReminderDto['kind']
    scheduled_at: number
    status: ReminderStatus
    sent_at: number | null
    error: string | null
    attempts: number
    updated_at: number
    name: string
    start_at: number
  }>(
    `SELECT r.*, TRIM(c.first_name || ' ' || c.last_name) AS name, a.start_at
     FROM reminders r JOIN appointments a ON a.id = r.appointment_id JOIN clients c ON c.id = a.client_id
     ${status === 'all' ? "WHERE r.status != 'cancelled'" : 'WHERE r.status = @status'}
     ORDER BY CASE WHEN r.status = 'scheduled' THEN r.scheduled_at ELSE -r.updated_at END LIMIT @limit`,
    { status, limit }
  ).map((r) => ({
    id: r.id,
    appointmentId: r.appointment_id,
    clientName: r.name,
    appointmentStartAt: r.start_at,
    kind: r.kind,
    scheduledAt: r.scheduled_at,
    status: r.status,
    sentAt: r.sent_at,
    error: r.error,
    attempts: r.attempts,
    updatedAt: r.updated_at
  }))
}

/** Relance manuelle d'un rappel en échec (action explicite de l'utilisateur). */
export function retryReminder(id: string): void {
  const r = run(
    "UPDATE reminders SET status = 'scheduled', attempts = 0, next_attempt_at = NULL, error = NULL, scheduled_at = ?, updated_at = ? WHERE id = ? AND status IN ('failed','skipped')",
    [Date.now(), Date.now(), id]
  )
  if (!r.changes) throw notFound('Ce rappel')
  kick()
}
