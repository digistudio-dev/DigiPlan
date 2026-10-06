// Montants en centimes (entiers) pour éviter les erreurs d'arrondi.

export function toCents(amount: number): number {
  return Math.round(amount * 100)
}

export function fromCents(cents: number): number {
  return cents / 100
}

const formatters = new Map<string, Intl.NumberFormat>()

function numberFormat(decimals: number): Intl.NumberFormat {
  const key = String(decimals)
  let f = formatters.get(key)
  if (!f) {
    f = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    formatters.set(key, f)
  }
  return f
}

/** 125000 → « 1 250 MAD » ; 12550 → « 125,50 MAD ». */
export function formatMoney(cents: number, currency = 'MAD'): string {
  const decimals = cents % 100 === 0 ? 0 : 2
  // Espace insécable classique (U+00A0) : rendu fiable à l'écran comme à l'impression.
  const n = numberFormat(decimals).format(cents / 100).replace(/\u202f/g, '\u00a0')
  return `${n}\u00a0${currency}`
}

/** Accepte « 1 250,50 », « 1250.5 », « 1.250,50 ». Retourne des centimes ou null. */
export function parseMoneyInput(input: string): number | null {
  const cleaned = input.replace(/[\s\u00a0\u202f]/g, '').replace(/(MAD|DH|DHS)$/i, '')
  if (!cleaned) return null
  let normalized = cleaned
  if (cleaned.includes(',') && cleaned.includes('.')) {
    normalized = cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned.replace(/,/g, '')
  } else {
    normalized = cleaned.replace(',', '.')
  }
  if (!/^-?\d+(\.\d{0,2})?$/.test(normalized)) return null
  return toCents(Number(normalized))
}
