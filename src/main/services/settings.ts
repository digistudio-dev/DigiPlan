// Paramètres applicatifs (stockés en JSON dans la table settings).

import { eq } from 'drizzle-orm'
import type { AppSettings } from '@shared/types'
import { DEFAULT_BACKUP_RETENTION } from '@shared/constants'
import { getDb } from '../db/client'
import { settings } from '../db/schema'
import { defaultBackupDir } from '../paths'

const APP_SETTINGS_KEY = 'app.settings'

export function defaultSettings(): AppSettings {
  return {
    theme: 'system',
    calendarColorMode: 'status',
    calendarSlotMin: 15,
    calendarStartHour: 8,
    calendarEndHour: 21,
    defaultCalendarView: 'timeGridWeek',
    allowOverlap: false,
    resourcesEnabled: false,
    defaultAppointmentStatus: 'confirmed',
    receiptFooter: 'Merci pour votre confiance.',
    receiptShowLogo: true,
    receiptAccentColor: '#0e6be6',
    remindersEnabledByDefault: true,
    defaultReminderOffsetMin: 24 * 60,
    lateReminderMinLeadMin: 60,
    sendConfirmationOnCreate: false,
    backupAutoEnabled: true,
    backupRetention: DEFAULT_BACKUP_RETENTION,
    backupDirectory: defaultBackupDir(),
    googleSyncEnabled: false,
    notifyUpcomingMinutes: 30,
    sidebarCollapsed: false
  }
}

let cache: AppSettings | null = null

export function getValue<T>(key: string): T | null {
  const row = getDb().select().from(settings).where(eq(settings.key, key)).get()
  return row ? (row.value as T) : null
}

export function setValue(key: string, value: unknown): void {
  const now = Date.now()
  getDb()
    .insert(settings)
    .values({ key, value, updatedAt: now })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: now } })
    .run()
}

export function deleteValue(key: string): void {
  getDb().delete(settings).where(eq(settings.key, key)).run()
}

export function getSettings(): AppSettings {
  if (cache) return cache
  const stored = getValue<Partial<AppSettings>>(APP_SETTINGS_KEY) ?? {}
  cache = { ...defaultSettings(), ...stored }
  return cache
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...getSettings(), ...patch }
  if (next.calendarEndHour <= next.calendarStartHour) next.calendarEndHour = Math.min(24, next.calendarStartHour + 1)
  setValue(APP_SETTINGS_KEY, next)
  cache = next
  return next
}

/** À appeler après une restauration de sauvegarde. */
export function resetSettingsCache(): void {
  cache = null
}
