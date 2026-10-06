// Vérification locale des codes d'activation DigiPlan Pro.
// Seules les empreintes HMAC-SHA256 des codes sont présentes dans le binaire, jamais les codes eux-mêmes.

import { createHmac, timingSafeEqual } from 'node:crypto'

// Clé de dérivation découpée pour ne pas apparaître d'un seul bloc.
const K = ['33dcee28ae9196fd', '09cccfcf91f301cb', 'b965bf1b151bcd17', 'f3d1c8698b22bab2']

const FINGERPRINTS = [
  '5a34313fe97764997ca63cac8ddffb08d5ee852633ddab2902cd48a124317119',
  '9cfba75026ccacfcadece8903ae842c767328cd968c76ab6781f2f1c55ddf9b3',
  '8618a37701d761f3f8cff00818b1973d756029cae998ef03ec96023711a59790',
  '461ffbfa74cdd9542c3136bc1678bd20be1e6646a2db9ba309634472229fce13',
  'b3284b61b7c788ab75cf427bb15516f57387135ec0ea3ed6a6cee60ac8fcc00e'
].map((h) => Buffer.from(h, 'hex'))

/** « dgp-xmuw b4nq…» → « DGPXMUWB4NQ… » : tolère minuscules, espaces et tirets. */
export function normalizeActivationCode(input: string): string {
  return input.replace(/[^a-z0-9]/gi, '').toUpperCase()
}

export function fingerprintCode(input: string): Buffer {
  return createHmac('sha256', K.join('')).update(normalizeActivationCode(input)).digest()
}

/** Retourne l'empreinte (hex) du code s'il est valide, sinon null. Comparaison à temps constant. */
export function verifyActivationCode(input: string): string | null {
  const normalized = normalizeActivationCode(input)
  if (normalized.length !== 15 || !normalized.startsWith('DGP')) return null
  const candidate = fingerprintCode(normalized)
  let match: Buffer | null = null
  // On parcourt toutes les empreintes pour éviter une fuite d'information par le temps de réponse.
  for (const fp of FINGERPRINTS) {
    if (fp.length === candidate.length && timingSafeEqual(fp, candidate)) match = fp
  }
  return match ? match.toString('hex') : null
}

export function isKnownFingerprint(hex: string): boolean {
  return FINGERPRINTS.some((fp) => fp.toString('hex') === hex)
}
