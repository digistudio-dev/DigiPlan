// Sauvegardes : manuelles, automatiques quotidiennes, vérification et restauration sécurisée.

import { app, dialog, type BrowserWindow } from 'electron'
import Database from 'better-sqlite3'
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import type { BackupInfo, BackupVerification } from '@shared/types'
import {
  backupFileName,
  isAutoBackupDue,
  parseBackupFileName,
  selectBackupsToPrune,
  type BackupKind
} from '@shared/domain/backup-files'
import { closeDatabase, getSqlite } from '../db/client'
import { clearStatementCache } from '../db/raw'
import { databasePath } from '../paths'
import { AppError } from '../errors'
import { createLogger } from '../logger'
import { getSettings, getValue, setValue } from './settings'
import { logActivity } from './activity'

const log = createLogger('backup')
const STATE_KEY = 'backup.state'

export function backupDirectory(): string {
  const dir = resolve(getSettings().backupDirectory)
  mkdirSync(dir, { recursive: true })
  return dir
}

export function listBackups(): BackupInfo[] {
  const dir = backupDirectory()
  return readdirSync(dir)
    .map((name) => {
      const parsed = parseBackupFileName(name)
      if (!parsed) return null
      const filePath = join(dir, name)
      return { fileName: name, filePath, createdAt: parsed.createdAt, kind: parsed.kind, sizeBytes: statSync(filePath).size }
    })
    .filter((b): b is BackupInfo => b !== null)
    .sort((a, b) => b.createdAt - a.createdAt)
}

function prune(): void {
  const retention = getSettings().backupRetention
  const all = listBackups().map((b) => ({ name: b.fileName, createdAt: b.createdAt, kind: b.kind }))
  for (const name of selectBackupsToPrune(all, retention)) {
    try {
      rmSync(join(backupDirectory(), name))
    } catch (err) {
      log.warn(`Suppression de l'ancienne sauvegarde ${name}`, err)
    }
  }
}

export function backupState(): { lastBackupAt: number | null; lastError: string | null; directory: string } {
  const s = getValue<{ lastBackupAt: number | null; lastError: string | null }>(STATE_KEY)
  let directory = getSettings().backupDirectory
  try {
    directory = backupDirectory()
  } catch {
    // dossier inaccessible : on affiche le chemin configuré
  }
  return { lastBackupAt: s?.lastBackupAt ?? null, lastError: s?.lastError ?? null, directory }
}

export async function createBackup(kind: BackupKind): Promise<BackupInfo> {
  const at = Date.now()
  try {
    const dir = backupDirectory()
    const target = join(dir, backupFileName(kind, at))
    const tmp = `${target}.partial`
    // API de sauvegarde en ligne de SQLite : copie cohérente même pendant l'utilisation.
    await getSqlite().backup(tmp)
    // Fichier autonome (sans -wal/-shm) : facile à copier sur une clé USB ou un cloud.
    const standalone = new Database(tmp)
    standalone.pragma('journal_mode = DELETE')
    standalone.close()
    renameSync(tmp, target)
    const check = verifyBackup(target)
    if (!check.ok) throw new Error(`Vérification échouée : ${check.message}`)
    setValue(STATE_KEY, { lastBackupAt: at, lastError: null })
    if (kind !== 'manual') prune()
    logActivity('backup', 'database', null, { kind })
    log.info(`Sauvegarde ${kind} créée : ${target}`)
    return { fileName: basename(target), filePath: target, createdAt: at, kind, sizeBytes: statSync(target).size }
  } catch (err) {
    log.error('Sauvegarde', err)
    setValue(STATE_KEY, { ...(getValue<object>(STATE_KEY) ?? {}), lastError: 'Une erreur est survenue lors de la sauvegarde.', lastErrorAt: at })
    throw new AppError('backup_failed', 'Une erreur est survenue lors de la sauvegarde. Vérifiez le dossier de sauvegarde.')
  }
}

export function verifyBackup(filePath: string): BackupVerification {
  const fail = (message: string): BackupVerification => ({ ok: false, message, createdAt: null, businessName: null, counts: null })
  if (!existsSync(filePath) || extname(filePath).toLowerCase() !== '.db') return fail('Fichier introuvable ou format non reconnu.')
  let db: Database.Database | null = null
  try {
    db = new Database(filePath, { readonly: true, fileMustExist: true })
    const integrity = db.pragma('integrity_check', { simple: true })
    if (integrity !== 'ok') return fail('Le fichier est endommagé (contrôle d’intégrité échoué).')
    const tables = new Set(
      (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((t) => t.name)
    )
    for (const t of ['business_settings', 'clients', 'appointments', 'payments']) {
      if (!tables.has(t)) return fail("Ce fichier n'est pas une sauvegarde DigiPlan valide.")
    }
    const business = db.prepare('SELECT name FROM business_settings WHERE id = 1').get() as { name: string } | undefined
    const count = (t: string) => (db!.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n
    const parsed = parseBackupFileName(basename(filePath))
    return {
      ok: true,
      message: 'Sauvegarde valide.',
      createdAt: parsed?.createdAt ?? statSync(filePath).mtimeMs,
      businessName: business?.name ?? null,
      counts: { clients: count('clients'), appointments: count('appointments'), payments: count('payments') }
    }
  } catch (err) {
    log.warn(`Vérification de ${filePath}`, err)
    return fail("Ce fichier n'est pas une sauvegarde DigiPlan valide.")
  } finally {
    db?.close()
  }
}

export async function pickBackupFile(parent: BrowserWindow | null): Promise<{ filePath: string; verification: BackupVerification } | null> {
  const options = {
    title: 'Choisir une sauvegarde DigiPlan',
    defaultPath: backupDirectory(),
    properties: ['openFile' as const],
    filters: [{ name: 'Sauvegarde DigiPlan', extensions: ['db'] }]
  }
  const res = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
  if (res.canceled || !res.filePaths[0]) return null
  return { filePath: res.filePaths[0], verification: verifyBackup(res.filePaths[0]) }
}

export async function chooseBackupDirectory(parent: BrowserWindow | null): Promise<string | null> {
  const options = { title: 'Dossier des sauvegardes', defaultPath: backupDirectory(), properties: ['openDirectory' as const, 'createDirectory' as const] }
  const res = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
  return res.canceled || !res.filePaths[0] ? null : res.filePaths[0]
}

/**
 * Restauration : vérification → sauvegarde de sécurité → fermeture de la base → remplacement atomique → redémarrage.
 * `beforeClose` arrête les tâches de fond (rappels, WhatsApp, synchro) pour éviter toute écriture concurrente.
 */
export async function restoreBackup(filePath: string, beforeClose: () => Promise<void>): Promise<void> {
  const check = verifyBackup(filePath)
  if (!check.ok) throw new AppError('invalid_backup', check.message)
  const dbPath = databasePath()
  if (resolve(filePath) === resolve(dbPath)) throw new AppError('invalid', 'Ce fichier est la base actuellement utilisée.')

  await createBackup('pre-restore')
  const staging = `${dbPath}.restoring`
  copyFileSync(filePath, staging)

  await beforeClose()
  clearStatementCache()
  closeDatabase()
  for (const suffix of ['-wal', '-shm']) {
    if (existsSync(dbPath + suffix)) rmSync(dbPath + suffix)
  }
  renameSync(staging, dbPath)
  log.info(`Base restaurée depuis ${filePath}`)
  app.relaunch()
  app.exit(0)
}

// ---------- Sauvegarde automatique ----------

let timer: NodeJS.Timeout | null = null

async function autoBackupIfDue(): Promise<void> {
  if (!getSettings().backupAutoEnabled) return
  const lastAuto = listBackupsSafe().find((b) => b.kind === 'auto')
  if (!isAutoBackupDue(lastAuto?.createdAt ?? null, Date.now())) return
  try {
    await createBackup('auto')
  } catch {
    // Erreur déjà journalisée et signalée dans le centre de notifications.
  }
}

function listBackupsSafe(): BackupInfo[] {
  try {
    return listBackups()
  } catch {
    return []
  }
}

export function startAutoBackup(): void {
  if (timer) clearInterval(timer)
  setTimeout(() => void autoBackupIfDue(), 60_000)
  timer = setInterval(() => void autoBackupIfDue(), 3600_000)
}

export function stopAutoBackup(): void {
  if (timer) clearInterval(timer)
  timer = null
}
