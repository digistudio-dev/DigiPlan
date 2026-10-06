// Logique des rappels automatiques : décision d'envoi, reprise après redémarrage, anti-doublon.

import type { AppointmentStatus } from '../types'
import { MINUTE } from './time'

export const REMINDER_OFFSETS: Array<{ minutes: number; label: string }> = [
  { minutes: 24 * 60, label: '24 heures avant' },
  { minutes: 12 * 60, label: '12 heures avant' },
  { minutes: 2 * 60, label: '2 heures avant' },
  { minutes: 60, label: '1 heure avant' }
]

/** Tolérance pendant laquelle un rappel est considéré « à l'heure ». */
export const ON_TIME_GRACE_MS = 5 * MINUTE

/** Nombre maximum de tentatives avant échec définitif. */
export const MAX_REMINDER_ATTEMPTS = 3

/** Délai avant nouvelle tentative après un échec d'envoi. */
export const RETRY_DELAY_MS = 5 * MINUTE

/** Au-delà de cette durée en « envoi en cours », l'envoi est considéré interrompu. */
export const STALE_SENDING_MS = 10 * MINUTE

export interface ReminderPolicy {
  /** Un rappel en retard n'est envoyé que s'il reste au moins ce délai avant le rendez-vous. */
  lateMinLeadMin: number
}

export type ReminderDecision = { action: 'wait' } | { action: 'send'; late: boolean } | { action: 'skip'; reason: string }

export function reminderDueAt(startAt: number, offsetMin: number): number {
  return startAt - offsetMin * MINUTE
}

const SKIP_STATUS_REASON: Partial<Record<AppointmentStatus, string>> = {
  cancelled: 'Rendez-vous annulé',
  no_show: 'Client marqué absent',
  completed: 'Rendez-vous déjà terminé',
  in_progress: 'Rendez-vous déjà commencé',
  arrived: 'Client déjà arrivé'
}

export function decideReminder(input: {
  scheduledAt: number
  appointmentStartAt: number
  appointmentStatus: AppointmentStatus
  appointmentDeleted?: boolean
  now: number
  policy: ReminderPolicy
}): ReminderDecision {
  const { scheduledAt, appointmentStartAt, appointmentStatus, now, policy } = input
  if (input.appointmentDeleted) return { action: 'skip', reason: 'Rendez-vous supprimé' }
  const statusReason = SKIP_STATUS_REASON[appointmentStatus]
  if (statusReason) return { action: 'skip', reason: statusReason }
  if (now >= appointmentStartAt) return { action: 'skip', reason: 'Le rendez-vous a déjà commencé' }
  if (now < scheduledAt) return { action: 'wait' }
  if (now - scheduledAt <= ON_TIME_GRACE_MS) return { action: 'send', late: false }
  // En retard (ex. application fermée à l'heure prévue) : envoyer seulement si c'est encore utile.
  if (appointmentStartAt - now >= policy.lateMinLeadMin * MINUTE) return { action: 'send', late: true }
  return { action: 'skip', reason: 'Trop proche du rendez-vous pour un rappel tardif' }
}

// --- Exécution d'un cycle de l'ordonnanceur (indépendant du stockage pour être testable) ---

export interface DueReminder {
  id: string
  appointmentId: string
  scheduledAt: number
  attempts: number
  appointmentStartAt: number
  appointmentStatus: AppointmentStatus
  appointmentDeleted: boolean
}

export interface ReminderStore {
  /** Rappels au statut « scheduled » dont l'heure (ou la prochaine tentative) est atteinte. */
  listDue(now: number): DueReminder[]
  /** Passage atomique scheduled → sending. Retourne false si un autre traitement l'a déjà pris. */
  claim(id: string, now: number): boolean
  markSent(id: string, now: number, message: string): void
  markFailed(id: string, now: number, error: string, retryAt: number | null): void
  markSkipped(id: string, now: number, reason: string): void
}

export interface ReminderSender {
  isReady(): boolean
  /** Retourne le texte envoyé. Doit lever une erreur en cas d'échec. */
  send(reminder: DueReminder): Promise<string>
}

export interface TickResult {
  sent: number
  failed: number
  skipped: number
  waiting: number
}

export async function runReminderTick(
  store: ReminderStore,
  sender: ReminderSender,
  now: number,
  policy: ReminderPolicy
): Promise<TickResult> {
  const result: TickResult = { sent: 0, failed: 0, skipped: 0, waiting: 0 }
  for (const r of store.listDue(now)) {
    const decision = decideReminder({
      scheduledAt: r.scheduledAt,
      appointmentStartAt: r.appointmentStartAt,
      appointmentStatus: r.appointmentStatus,
      appointmentDeleted: r.appointmentDeleted,
      now,
      policy
    })
    if (decision.action === 'wait') {
      result.waiting++
      continue
    }
    if (decision.action === 'skip') {
      store.markSkipped(r.id, now, decision.reason)
      result.skipped++
      continue
    }
    // WhatsApp non connecté : le rappel reste planifié et sera réévalué au prochain cycle.
    if (!sender.isReady()) {
      result.waiting++
      continue
    }
    // Instantané avant la prise : le stockage peut modifier l'objet en place.
    const attemptsBefore = r.attempts
    if (!store.claim(r.id, now)) continue
    try {
      const message = await sender.send(r)
      store.markSent(r.id, Date.now(), message)
      result.sent++
    } catch (err) {
      const attempts = attemptsBefore + 1
      const retryAt = attempts < MAX_REMINDER_ATTEMPTS ? now + RETRY_DELAY_MS : null
      store.markFailed(r.id, now, err instanceof Error ? err.message : String(err), retryAt)
      result.failed++
    }
  }
  return result
}
