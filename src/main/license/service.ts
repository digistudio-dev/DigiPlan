// État de licence persistant (Free / Pro) avec signature liée au poste.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { hostname, userInfo } from 'node:os'
import { eq } from 'drizzle-orm'
import type { LicenseState } from '@shared/types'
import { getDb } from '../db/client'
import { licenses } from '../db/schema'
import { AppError } from '../errors'
import { createLogger } from '../logger'
import { isKnownFingerprint, verifyActivationCode } from './verify'

const log = createLogger('license')

function machineKey(): Buffer {
  let user = ''
  try {
    user = userInfo().username
  } catch {
    user = 'user'
  }
  return createHash('sha256').update(`digiplan-license|${hostname()}|${user}|${process.platform}`).digest()
}

function sign(fingerprint: string, activatedAt: number): string {
  return createHmac('sha256', machineKey()).update(`pro|${fingerprint}|${activatedAt}`).digest('hex')
}

function signatureValid(fingerprint: string, activatedAt: number, signature: string): boolean {
  const expected = Buffer.from(sign(fingerprint, activatedAt), 'hex')
  const actual = Buffer.from(signature, 'hex')
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

let cache: LicenseState | null = null

export function getLicense(): LicenseState {
  if (cache) return cache
  const row = getDb().select().from(licenses).where(eq(licenses.id, 1)).get()
  if (
    row &&
    row.edition === 'pro' &&
    isKnownFingerprint(row.codeFingerprint) &&
    signatureValid(row.codeFingerprint, row.activatedAt, row.signature)
  ) {
    cache = { edition: 'pro', activatedAt: row.activatedAt }
  } else {
    if (row) log.warn('Licence enregistrée invalide pour ce poste : retour en édition Free')
    cache = { edition: 'free', activatedAt: null }
  }
  return cache
}

export function isPro(): boolean {
  return getLicense().edition === 'pro'
}

const failedAttempts: number[] = []

export function activateLicense(code: string): LicenseState {
  // Protection contre l'essai systématique : 5 codes invalides maximum par minute.
  const now = Date.now()
  while (failedAttempts.length && now - failedAttempts[0] > 60_000) failedAttempts.shift()
  if (failedAttempts.length >= 5) {
    throw new AppError('rate_limited', 'Trop de tentatives. Patientez une minute avant de réessayer.')
  }

  const fingerprint = verifyActivationCode(code)
  if (!fingerprint) {
    failedAttempts.push(now)
    log.warn("Tentative d'activation avec un code invalide")
    throw new AppError('invalid_code', "Ce code d'activation n'est pas valide. Vérifiez la saisie.")
  }
  const values = { edition: 'pro', codeFingerprint: fingerprint, activatedAt: now, signature: sign(fingerprint, now) }
  getDb()
    .insert(licenses)
    .values({ id: 1, ...values })
    .onConflictDoUpdate({ target: licenses.id, set: values })
    .run()
  cache = null
  log.info('DigiPlan Pro activé')
  return getLicense()
}

export function resetLicenseCache(): void {
  cache = null
}

export function requirePro(): void {
  if (!isPro()) throw new AppError('pro_required', 'Cette fonctionnalité est disponible avec DigiPlan Pro.')
}
