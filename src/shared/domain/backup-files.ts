// Règles de nommage et de rétention des fichiers de sauvegarde (logique pure, testable).

import { format } from 'date-fns'
import type { BackupInfo } from '../types'

export type BackupKind = BackupInfo['kind']

const FILE_PATTERN = /^DigiPlan_(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})_(auto|manual|pre-restore)\.db$/

/** Nom de fichier horodaté, ex. DigiPlan_2026-10-06_14-30-00_auto.db */
export function backupFileName(kind: BackupKind, at: number): string {
  return `DigiPlan_${format(at, 'yyyy-MM-dd_HH-mm-ss')}_${kind}.db`
}

export function parseBackupFileName(name: string): { createdAt: number; kind: BackupKind } | null {
  const m = FILE_PATTERN.exec(name)
  if (!m) return null
  const [date, time] = m[1].split('_')
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi, s] = time.split('-').map(Number)
  return { createdAt: new Date(y, mo - 1, d, h, mi, s).getTime(), kind: m[2] as BackupKind }
}

/**
 * Fichiers à supprimer pour respecter la rétention.
 * Les sauvegardes manuelles ne sont jamais supprimées automatiquement ; au moins une sauvegarde est conservée.
 */
export function selectBackupsToPrune(files: Array<{ name: string; createdAt: number; kind: BackupKind }>, retention: number): string[] {
  const prunable = files.filter((f) => f.kind !== 'manual').sort((a, b) => b.createdAt - a.createdAt)
  return prunable.slice(Math.max(1, retention)).map((f) => f.name)
}

/** Documents\DigiPlan\Backups */
export function defaultBackupDirectory(documentsDir: string, join: (...parts: string[]) => string): string {
  return join(documentsDir, 'DigiPlan', 'Backups')
}

/** Vrai si `child` est situé dans `parent` (comparaison insensible à la casse sous Windows). */
export function isPathInside(child: string, parent: string): boolean {
  const norm = (p: string) => p.replace(/[\\/]+/g, '/').replace(/\/$/, '').toLowerCase()
  const c = norm(child)
  const p = norm(parent)
  return c === p || c.startsWith(`${p}/`)
}

/** Une sauvegarde automatique est due si la dernière date de plus de 24 h (ou n'existe pas). */
export function isAutoBackupDue(lastAutoAt: number | null, now: number): boolean {
  return lastAutoAt === null || now - lastAutoAt >= 24 * 3600_000
}
