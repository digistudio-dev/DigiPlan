// Calculs de prix, durées et soldes.

export interface PricedLine {
  durationMin: number
  price: number
}

export interface AppointmentTotals {
  subtotal: number
  discount: number
  total: number
  durationMin: number
}

/** Somme des prestations, remise plafonnée au sous-total, jamais négative. */
export function computeAppointmentTotals(lines: PricedLine[], discount = 0): AppointmentTotals {
  const subtotal = lines.reduce((sum, l) => sum + Math.max(0, Math.round(l.price)), 0)
  const durationMin = lines.reduce((sum, l) => sum + Math.max(0, Math.round(l.durationMin)), 0)
  const safeDiscount = Math.min(Math.max(0, Math.round(discount)), subtotal)
  return { subtotal, discount: safeDiscount, total: subtotal - safeDiscount, durationMin }
}

/** Remise exprimée en pourcentage → centimes. */
export function percentDiscount(subtotal: number, percent: number): number {
  const p = Math.min(Math.max(percent, 0), 100)
  return Math.round((subtotal * p) / 100)
}

export type PaymentState = 'unpaid' | 'partial' | 'paid' | 'overpaid'

export interface Balance {
  total: number
  paid: number
  balance: number
  state: PaymentState
}

/** Les paiements annulés doivent être exclus en amont. */
export function computeBalance(total: number, payments: Array<{ amount: number }>): Balance {
  const paid = payments.reduce((sum, p) => sum + p.amount, 0)
  const balance = total - paid
  let state: PaymentState
  if (total === 0 && paid === 0) state = 'paid'
  else if (paid <= 0) state = 'unpaid'
  else if (balance > 0) state = 'partial'
  else if (balance === 0) state = 'paid'
  else state = 'overpaid'
  return { total, paid, balance: Math.max(0, balance), state }
}

export function commissionAmount(value: number, ratePercent: number | null | undefined): number {
  if (!ratePercent || ratePercent <= 0) return 0
  return Math.round((value * Math.min(ratePercent, 100)) / 100)
}
