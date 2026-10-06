// Centre de notifications : éléments calculés à la demande (pas de spam), masquables individuellement.

import { endOfDay, startOfDay } from 'date-fns'
import type { NotificationItem } from '@shared/types'
import { formatMoney } from '@shared/domain/money'
import { formatTime } from '@shared/format'
import { all, get } from '../db/raw'
import { isPro } from '../license/service'
import { getSettings, getValue, setValue } from './settings'
import { backupState } from './backup'
import { getGoogleState } from '../integrations/google-calendar'
import { getWhatsAppState } from '../integrations/whatsapp'
import { getBusiness } from './business'
import { DUE_STATUSES_SQL } from './clients'

const DISMISSED_KEY = 'notifications.dismissed'

function dismissed(): Set<string> {
  return new Set(getValue<string[]>(DISMISSED_KEY) ?? [])
}

export function dismissNotification(id: string): void {
  const list = [...dismissed(), id].slice(-300)
  setValue(DISMISSED_KEY, list)
}

export function listNotifications(): NotificationItem[] {
  const now = Date.now()
  const items: NotificationItem[] = []
  const currency = getBusiness()?.currency ?? 'MAD'

  // Rendez-vous imminents.
  const horizon = now + getSettings().notifyUpcomingMinutes * 60_000
  for (const a of all<{ id: string; start_at: number; name: string; client_id: string }>(
    `SELECT a.id, a.start_at, a.client_id, TRIM(c.first_name || ' ' || c.last_name) AS name
     FROM appointments a JOIN clients c ON c.id = a.client_id
     WHERE a.deleted_at IS NULL AND a.status IN ('pending','confirmed') AND a.start_at >= ? AND a.start_at <= ?
     ORDER BY a.start_at LIMIT 5`,
    [now - 5 * 60_000, horizon]
  )) {
    items.push({
      id: `upcoming:${a.id}:${a.start_at}`,
      kind: 'upcoming',
      title: `${a.name} à ${formatTime(a.start_at)}`,
      description: 'Rendez-vous imminent',
      at: a.start_at,
      severity: 'info',
      appointmentId: a.id,
      clientId: a.client_id
    })
  }

  // Soldes restants des rendez-vous du jour.
  const today = get<{ n: number; total: number }>(
    `SELECT COUNT(*) AS n, COALESCE(SUM(bal), 0) AS total FROM (
       SELECT a.total - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.appointment_id = a.id AND p.voided_at IS NULL), 0) AS bal
       FROM appointments a WHERE a.deleted_at IS NULL AND a.status IN ${DUE_STATUSES_SQL} AND a.start_at >= ? AND a.start_at < ?
     ) WHERE bal > 0`,
    [startOfDay(now).getTime(), endOfDay(now).getTime()]
  )
  if (today && today.n > 0) {
    items.push({
      id: `unpaid:${startOfDay(now).getTime()}:${today.n}`,
      kind: 'unpaid',
      title: `${today.n} rendez-vous avec un solde restant`,
      description: `${formatMoney(today.total, currency)} à encaisser aujourd'hui`,
      at: now,
      severity: 'warning'
    })
  }

  if (isPro()) {
    for (const r of all<{ id: string; error: string | null; updated_at: number; name: string; appointment_id: string }>(
      `SELECT r.id, r.error, r.updated_at, r.appointment_id, TRIM(c.first_name || ' ' || c.last_name) AS name
       FROM reminders r JOIN appointments a ON a.id = r.appointment_id JOIN clients c ON c.id = a.client_id
       WHERE r.status = 'failed' AND r.updated_at >= ? ORDER BY r.updated_at DESC LIMIT 5`,
      [now - 7 * 24 * 3600_000]
    )) {
      items.push({
        id: `reminder:${r.id}`,
        kind: 'reminder_failed',
        title: `Rappel WhatsApp non envoyé — ${r.name}`,
        description: r.error ?? "L'envoi a échoué.",
        at: r.updated_at,
        severity: 'error',
        appointmentId: r.appointment_id
      })
    }

    const wa = getWhatsAppState()
    if ((wa.status === 'disconnected' || wa.status === 'error') && getValue<boolean>('whatsapp.enabled')) {
      items.push({
        id: `wa:${wa.status}:${Math.floor(wa.updatedAt / 3600_000)}`,
        kind: 'whatsapp_disconnected',
        title: 'WhatsApp déconnecté',
        description: wa.error ?? 'Les rappels automatiques sont en pause.',
        at: wa.updatedAt,
        severity: 'warning'
      })
    }

    const g = getGoogleState()
    if (g.syncEnabled && g.lastError) {
      items.push({
        id: `google:${g.lastSyncAt ?? 0}`,
        kind: 'google_error',
        title: 'Synchronisation Google Calendar',
        description: g.lastError,
        at: g.lastSyncAt ?? now,
        severity: 'warning'
      })
    }
  }

  const b = backupState()
  const lastErrorAt = getValue<{ lastErrorAt?: number }>('backup.state')?.lastErrorAt
  if (b.lastError && lastErrorAt) {
    items.push({
      id: `backup:${lastErrorAt}`,
      kind: 'backup_error',
      title: 'Échec de la sauvegarde',
      description: b.lastError,
      at: lastErrorAt,
      severity: 'error'
    })
  }

  const hidden = dismissed()
  return items.filter((i) => !hidden.has(i.id))
}
