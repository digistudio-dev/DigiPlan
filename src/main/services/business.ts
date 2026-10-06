// Profil de l'établissement.

import { eq } from 'drizzle-orm'
import type { BusinessProfile, CategoryId, TerminologyOverrides } from '@shared/types'
import { getCategoryConfig } from '@shared/categories'
import { getDb } from '../db/client'
import { businessSettings } from '../db/schema'

let cache: BusinessProfile | null | undefined

export function getBusiness(): BusinessProfile | null {
  if (cache !== undefined) return cache
  const row = getDb().select().from(businessSettings).where(eq(businessSettings.id, 1)).get()
  cache = row
    ? {
        name: row.name,
        ownerName: row.ownerName,
        phone: row.phone,
        whatsapp: row.whatsapp,
        email: row.email,
        address: row.address,
        city: row.city,
        logoDataUrl: row.logoDataUrl,
        currency: row.currency,
        timezone: row.timezone,
        categoryId: getCategoryConfig(row.categoryId).id,
        terminology: (row.terminology ?? {}) as TerminologyOverrides,
        onboardedAt: row.onboardedAt
      }
    : null
  return cache
}

export function requireBusiness(): BusinessProfile {
  const b = getBusiness()
  if (!b) throw new Error('Business not configured')
  return b
}

export function updateBusiness(
  patch: Partial<Omit<BusinessProfile, 'onboardedAt' | 'categoryId'>> & { categoryId?: CategoryId }
): BusinessProfile {
  const now = Date.now()
  const values = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))
  getDb()
    .update(businessSettings)
    .set({ ...values, updatedAt: now })
    .where(eq(businessSettings.id, 1))
    .run()
  cache = undefined
  return requireBusiness()
}

export function resetBusinessCache(): void {
  cache = undefined
}
