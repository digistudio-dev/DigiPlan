import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { formatPhone, isPlausiblePhone, normalizePhone, toWhatsAppNumber } from '@shared/domain/phone'
import { renderTemplate, unknownVariables, DEFAULT_TEMPLATES } from '@shared/domain/templates'
import {
  backupFileName,
  defaultBackupDirectory,
  isAutoBackupDue,
  isPathInside,
  parseBackupFileName,
  selectBackupsToPrune
} from '@shared/domain/backup-files'
import { formatDateLong, formatTime } from '@shared/format'
import { hhmmToMinutes, minutesToHHMM } from '@shared/domain/time'

describe('téléphones marocains', () => {
  it.each([
    ['0612345678', '+212612345678'],
    ['06 12 34 56 78', '+212612345678'],
    ['+212612345678', '+212612345678'],
    ['+212 6 12 34 56 78', '+212612345678'],
    ['00212612345678', '+212612345678'],
    ['212612345678', '+212612345678'],
    ['612345678', '+212612345678'],
    ['0522123456', '+212522123456']
  ])('%s → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected)
  })

  it("n'empêche pas les numéros internationaux", () => {
    expect(normalizePhone('+33 6 12 34 56 78')).toBe('+33612345678')
    expect(isPlausiblePhone('+33612345678')).toBe(true)
    expect(toWhatsAppNumber('+33612345678')).toBe('33612345678')
  })

  it('affiche au format local', () => {
    expect(formatPhone('+212612345678')).toBe('06 12 34 56 78')
  })

  it('identifiant WhatsApp', () => {
    expect(toWhatsAppNumber('0612345678')).toBe('212612345678')
    expect(toWhatsAppNumber('')).toBeNull()
    expect(toWhatsAppNumber('123')).toBeNull()
  })
})

describe('modèles de messages', () => {
  it('remplace les variables du modèle de confirmation par défaut', () => {
    const body = DEFAULT_TEMPLATES.find((t) => t.key === 'confirmation')!.body
    const msg = renderTemplate(body, {
      client_name: 'Salma',
      business_name: 'Salon Atlas',
      date: 'mardi 06 octobre 2026',
      time: '14:30',
      service: 'Brushing'
    })
    expect(msg).toContain('Bonjour Salma,')
    expect(msg).toContain('chez Salon Atlas est confirmé')
    expect(msg).toContain('📅 mardi 06 octobre 2026')
    expect(msg).toContain('🕐 14:30')
    expect(msg).not.toContain('{{')
  })

  it('signale les variables inconnues', () => {
    expect(unknownVariables('Bonjour {{client_name}} {{prenom}}')).toEqual(['prenom'])
  })
})

describe('sauvegardes — chemins et rétention', () => {
  it('dossier par défaut dans Documents', () => {
    expect(defaultBackupDirectory('C:\\Users\\Amine\\Documents', join)).toBe(join('C:\\Users\\Amine\\Documents', 'DigiPlan', 'Backups'))
  })

  it('nom de fichier horodaté réversible', () => {
    const at = new Date(2026, 9, 6, 14, 30, 5).getTime()
    const name = backupFileName('auto', at)
    expect(name).toBe('DigiPlan_2026-10-06_14-30-05_auto.db')
    expect(parseBackupFileName(name)).toEqual({ createdAt: at, kind: 'auto' })
    expect(parseBackupFileName('autre-fichier.db')).toBeNull()
  })

  it('rétention : supprime les plus anciennes automatiques, jamais les manuelles', () => {
    const files: Array<{ name: string; createdAt: number; kind: 'auto' | 'manual' }> = Array.from({ length: 5 }, (_, i) => ({ name: `auto${i}`, createdAt: i, kind: 'auto' as const }))
    files.push({ name: 'manuelle', createdAt: -1, kind: 'manual' as const })
    expect(selectBackupsToPrune(files, 3).sort()).toEqual(['auto0', 'auto1'])
    expect(selectBackupsToPrune(files, 0)).toHaveLength(4)
  })

  it('sauvegarde automatique quotidienne', () => {
    const now = Date.now()
    expect(isAutoBackupDue(null, now)).toBe(true)
    expect(isAutoBackupDue(now - 3600_000, now)).toBe(false)
    expect(isAutoBackupDue(now - 25 * 3600_000, now)).toBe(true)
  })

  it('la base de données ne doit pas être dans le dossier d’installation', () => {
    expect(isPathInside('C:\\Program Files\\DigiPlan\\data\\x.db', 'C:\\Program Files\\DigiPlan')).toBe(true)
    expect(isPathInside('C:\\Users\\A\\AppData\\Roaming\\DigiPlan\\data\\digiplan.db', 'C:\\Program Files\\DigiPlan')).toBe(false)
    expect(isPathInside('C:\\Program Files\\DigiPlan2\\x.db', 'C:\\Program Files\\DigiPlan')).toBe(false)
  })
})

describe('dates et heures en français', () => {
  it('formate les dates', () => {
    const d = new Date(2026, 9, 6, 14, 30).getTime()
    expect(formatDateLong(d)).toBe('06 octobre 2026')
    expect(formatTime(d)).toBe('14:30')
  })
  it('convertit les heures', () => {
    expect(minutesToHHMM(870)).toBe('14:30')
    expect(hhmmToMinutes('14:30')).toBe(870)
    expect(hhmmToMinutes('25:00')).toBeNull()
  })
})
