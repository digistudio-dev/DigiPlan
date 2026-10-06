// Normalisation des numéros de téléphone, optimisée pour le Maroc sans bloquer l'international.

import { DEFAULT_COUNTRY_CODE } from '../constants'

/**
 * Normalise un numéro au format international « +212612345678 ».
 * - 0612345678       → +212612345678
 * - 612345678        → +212612345678
 * - 00212612345678   → +212612345678
 * - +33 6 12 34 56 78 → +33612345678
 * Retourne une chaîne vide si l'entrée est vide.
 */
export function normalizePhone(input: string | null | undefined, countryCode = DEFAULT_COUNTRY_CODE): string {
  if (!input) return ''
  const trimmed = input.trim()
  if (!trimmed) return ''
  const hasPlus = trimmed.startsWith('+')
  let digits = trimmed.replace(/\D/g, '')
  if (!digits) return ''

  if (hasPlus) return `+${digits}`
  if (digits.startsWith('00')) return `+${digits.slice(2)}`
  if (digits.startsWith(countryCode) && digits.length === countryCode.length + 9) return `+${digits}`
  if (digits.startsWith('0') && digits.length === 10) {
    digits = digits.slice(1)
    return `+${countryCode}${digits}`
  }
  if (digits.length === 9 && /^[5-8]/.test(digits)) return `+${countryCode}${digits}`
  // Numéro non reconnu : conservé tel quel (chiffres uniquement), sans présumer du pays.
  return digits
}

/** Vérifie qu'un numéro est plausible (8 à 15 chiffres). */
export function isPlausiblePhone(input: string): boolean {
  const n = normalizePhone(input)
  const digits = n.replace(/\D/g, '')
  return digits.length >= 8 && digits.length <= 15
}

/** Affichage lisible : « 06 12 34 56 78 » pour le Maroc, groupes pour l'international. */
export function formatPhone(input: string | null | undefined): string {
  if (!input) return ''
  const n = normalizePhone(input)
  if (n.startsWith(`+${DEFAULT_COUNTRY_CODE}`) && n.length === 13) {
    const local = `0${n.slice(4)}`
    return local.replace(/(\d{2})(?=\d)/g, '$1 ').trim()
  }
  // International : l'indicatif pays n'est pas déductible de façon fiable, format E.164 conservé.
  return n
}

/** Identifiant WhatsApp (chiffres sans « + »), ou null si le numéro n'est pas exploitable. */
export function toWhatsAppNumber(input: string | null | undefined): string | null {
  const n = normalizePhone(input)
  if (!n.startsWith('+')) return null
  const digits = n.slice(1)
  return digits.length >= 8 && digits.length <= 15 ? digits : null
}
