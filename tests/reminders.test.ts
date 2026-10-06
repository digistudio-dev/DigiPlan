import { describe, expect, it } from 'vitest'
import {
  MAX_REMINDER_ATTEMPTS,
  decideReminder,
  reminderDueAt,
  runReminderTick,
  type DueReminder,
  type ReminderSender,
  type ReminderStore
} from '@shared/domain/reminders'
import type { AppointmentStatus } from '@shared/types'

const H = 3600_000
const M = 60_000
const policy = { lateMinLeadMin: 60 }
const start = new Date(2026, 9, 7, 15, 0).getTime()

describe('decideReminder — planification', () => {
  it("calcule l'heure d'envoi à partir du délai", () => {
    expect(reminderDueAt(start, 24 * 60)).toBe(start - 24 * H)
    expect(reminderDueAt(start, 120)).toBe(start - 2 * H)
  })

  it("attend tant que l'heure n'est pas atteinte", () => {
    const d = decideReminder({ scheduledAt: start - 2 * H, appointmentStartAt: start, appointmentStatus: 'confirmed', now: start - 3 * H, policy })
    expect(d.action).toBe('wait')
  })

  it("envoie à l'heure prévue", () => {
    const d = decideReminder({ scheduledAt: start - 2 * H, appointmentStartAt: start, appointmentStatus: 'confirmed', now: start - 2 * H + M, policy })
    expect(d).toEqual({ action: 'send', late: false })
  })

  it("envoie en retard si l'application était fermée mais que le rappel reste utile", () => {
    // Prévu 24 h avant, application rouverte 5 h avant le rendez-vous.
    const d = decideReminder({ scheduledAt: start - 24 * H, appointmentStartAt: start, appointmentStatus: 'pending', now: start - 5 * H, policy })
    expect(d).toEqual({ action: 'send', late: true })
  })

  it('ignore un rappel tardif trop proche du rendez-vous', () => {
    const d = decideReminder({ scheduledAt: start - 24 * H, appointmentStartAt: start, appointmentStatus: 'confirmed', now: start - 30 * M, policy })
    expect(d.action).toBe('skip')
  })

  it('ne envoie jamais après le début du rendez-vous', () => {
    const d = decideReminder({ scheduledAt: start - H, appointmentStartAt: start, appointmentStatus: 'confirmed', now: start + M, policy })
    expect(d).toMatchObject({ action: 'skip', reason: 'Le rendez-vous a déjà commencé' })
  })

  it.each<[AppointmentStatus, string]>([
    ['cancelled', 'Rendez-vous annulé'],
    ['no_show', 'Client marqué absent'],
    ['completed', 'Rendez-vous déjà terminé']
  ])('ignore un rendez-vous au statut %s', (status, reason) => {
    const d = decideReminder({ scheduledAt: start - 2 * H, appointmentStartAt: start, appointmentStatus: status, now: start - 2 * H, policy })
    expect(d).toEqual({ action: 'skip', reason })
  })

  it('ignore un rendez-vous supprimé', () => {
    const d = decideReminder({ scheduledAt: start - 2 * H, appointmentStartAt: start, appointmentStatus: 'confirmed', appointmentDeleted: true, now: start - 2 * H, policy })
    expect(d.action).toBe('skip')
  })
})

// ---------- Ordonnanceur avec un stockage en mémoire ----------

interface Row extends DueReminder {
  status: 'scheduled' | 'sending' | 'sent' | 'failed' | 'skipped'
  nextAttemptAt: number | null
  error: string | null
}

function memoryStore(rows: Row[]): ReminderStore & { rows: Row[] } {
  return {
    rows,
    listDue: (now) => rows.filter((r) => r.status === 'scheduled' && r.scheduledAt <= now && (r.nextAttemptAt === null || r.nextAttemptAt <= now)),
    claim: (id) => {
      const r = rows.find((x) => x.id === id)!
      if (r.status !== 'scheduled') return false
      r.status = 'sending'
      r.attempts++
      return true
    },
    markSent: (id) => {
      rows.find((x) => x.id === id)!.status = 'sent'
    },
    markFailed: (id, _now, error, retryAt) => {
      const r = rows.find((x) => x.id === id)!
      r.error = error
      if (retryAt) {
        r.status = 'scheduled'
        r.nextAttemptAt = retryAt
      } else r.status = 'failed'
    },
    markSkipped: (id, _now, reason) => {
      const r = rows.find((x) => x.id === id)!
      r.status = 'skipped'
      r.error = reason
    }
  }
}

const row = (p: Partial<Row> = {}): Row => ({
  id: 'r1',
  appointmentId: 'a1',
  scheduledAt: start - 2 * H,
  attempts: 0,
  appointmentStartAt: start,
  appointmentStatus: 'confirmed',
  appointmentDeleted: false,
  status: 'scheduled',
  nextAttemptAt: null,
  error: null,
  ...p
})

function sender(ready = true, fail = false) {
  const sent: string[] = []
  const s: ReminderSender & { sent: string[] } = {
    sent,
    isReady: () => ready,
    send: async (r) => {
      if (fail) throw new Error('réseau')
      sent.push(r.id)
      return 'message'
    }
  }
  return s
}

describe('runReminderTick — envoi et anti-doublon', () => {
  it('envoie une seule fois même si plusieurs cycles se chevauchent', async () => {
    const store = memoryStore([row()])
    const s = sender()
    const now = start - 2 * H + M
    await Promise.all([runReminderTick(store, s, now, policy), runReminderTick(store, s, now, policy)])
    await runReminderTick(store, s, now + 5 * M, policy)
    expect(s.sent).toEqual(['r1'])
    expect(store.rows[0].status).toBe('sent')
  })

  it("laisse le rappel planifié si WhatsApp n'est pas connecté", async () => {
    const store = memoryStore([row()])
    const result = await runReminderTick(store, sender(false), start - 2 * H, policy)
    expect(result.waiting).toBe(1)
    expect(store.rows[0].status).toBe('scheduled')
  })

  it("reprend après redémarrage : envoi tardif s'il est encore pertinent", async () => {
    const store = memoryStore([row({ scheduledAt: start - 24 * H })])
    const s = sender()
    await runReminderTick(store, s, start - 3 * H, policy)
    expect(s.sent).toEqual(['r1'])
  })

  it('réessaie après un échec puis abandonne au-delà du maximum', async () => {
    const store = memoryStore([row()])
    const failing = sender(true, true)
    let now = start - 2 * H
    for (let i = 0; i < MAX_REMINDER_ATTEMPTS + 2; i++) {
      await runReminderTick(store, failing, now, policy)
      now += 6 * M
    }
    expect(store.rows[0].status).toBe('failed')
    expect(store.rows[0].attempts).toBe(MAX_REMINDER_ATTEMPTS)
  })

  it('marque comme ignoré un rappel dont le rendez-vous a été annulé', async () => {
    const store = memoryStore([row({ appointmentStatus: 'cancelled' })])
    const s = sender()
    await runReminderTick(store, s, start - 2 * H, policy)
    expect(s.sent).toEqual([])
    expect(store.rows[0].status).toBe('skipped')
  })
})
