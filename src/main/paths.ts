// Emplacements des données sur le disque.
// Les données utilisateur ne sont jamais stockées dans le dossier d'installation.

import { app } from 'electron'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { defaultBackupDirectory } from '@shared/domain/backup-files'

function ensureDir(dir: string): string {
  mkdirSync(dir, { recursive: true })
  return dir
}

/** %APPDATA%\DigiPlan */
export const userDataDir = () => app.getPath('userData')

/** %APPDATA%\DigiPlan\data */
export const dataDir = () => ensureDir(join(userDataDir(), 'data'))

/** %APPDATA%\DigiPlan\data\digiplan.db */
export const databasePath = () => join(dataDir(), 'digiplan.db')

/** %APPDATA%\DigiPlan\logs */
export const logsDir = () => ensureDir(join(userDataDir(), 'logs'))

/** Session WhatsApp persistée (évite de rescanner le QR à chaque lancement). */
export const whatsappSessionDir = () => ensureDir(join(userDataDir(), 'whatsapp-session'))

/** Documents\DigiPlan\Backups */
export const defaultBackupDir = () => defaultBackupDirectory(app.getPath('documents'), join)

/** Dossier des migrations SQL (embarqué dans les ressources en production). */
export const migrationsDir = () =>
  app.isPackaged ? join(process.resourcesPath, 'drizzle') : join(app.getAppPath(), 'drizzle')
