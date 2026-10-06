import { describe, expect, it } from 'vitest'
import { commissionAmount, computeAppointmentTotals, computeBalance, percentDiscount } from '@shared/domain/pricing'
import { formatMoney, parseMoneyInput, toCents } from '@shared/domain/money'

describe('computeAppointmentTotals — prix et durée', () => {
  it('additionne prix et durées de plusieurs prestations', () => {
    const t = computeAppointmentTotals([
      { durationMin: 30, price: toCents(50) },
      { durationMin: 20, price: toCents(30) }
    ])
    expect(t).toEqual({ subtotal: 8000, discount: 0, total: 8000, durationMin: 50 })
  })

  it('applique une remise sans jamais rendre le total négatif', () => {
    expect(computeAppointmentTotals([{ durationMin: 30, price: 5000 }], 1000).total).toBe(4000)
    expect(computeAppointmentTotals([{ durationMin: 30, price: 5000 }], 9000)).toMatchObject({ discount: 5000, total: 0 })
  })

  it('calcule une remise en pourcentage', () => {
    expect(percentDiscount(35000, 10)).toBe(3500)
    expect(percentDiscount(35000, 150)).toBe(35000)
  })
})

describe('computeBalance — soldes', () => {
  it('non payé', () => {
    expect(computeBalance(35000, [])).toEqual({ total: 35000, paid: 0, balance: 35000, state: 'unpaid' })
  })
  it('paiement partiel puis multiple', () => {
    expect(computeBalance(35000, [{ amount: 10000 }])).toMatchObject({ paid: 10000, balance: 25000, state: 'partial' })
    expect(computeBalance(35000, [{ amount: 10000 }, { amount: 25000 }])).toMatchObject({ balance: 0, state: 'paid' })
  })
  it('trop-perçu signalé sans solde négatif', () => {
    expect(computeBalance(35000, [{ amount: 40000 }])).toMatchObject({ balance: 0, state: 'overpaid' })
  })
  it('prestation gratuite considérée comme réglée', () => {
    expect(computeBalance(0, []).state).toBe('paid')
  })
})

describe('commissions', () => {
  it('calcule la commission au pourcentage', () => {
    expect(commissionAmount(100000, 30)).toBe(30000)
    expect(commissionAmount(100000, null)).toBe(0)
  })
})

describe('format monétaire MAD', () => {
  it('formate sans décimales inutiles', () => {
    expect(formatMoney(35000)).toBe('350\u00a0MAD')
    expect(formatMoney(125000)).toBe('1\u00a0250\u00a0MAD')
    expect(formatMoney(12550)).toBe('125,50\u00a0MAD')
  })
  it('analyse les saisies françaises', () => {
    expect(parseMoneyInput('1 250,50')).toBe(125050)
    expect(parseMoneyInput('350')).toBe(35000)
    expect(parseMoneyInput('1.250,5')).toBe(125050)
    expect(parseMoneyInput('350 MAD')).toBe(35000)
    expect(parseMoneyInput('abc')).toBeNull()
    expect(parseMoneyInput('')).toBeNull()
  })
})
