// Assistant de premier lancement : création atomique de la configuration initiale.

import { randomUUID } from 'node:crypto'
import type { ChannelParsedInput } from '@shared/ipc'
import { getCategoryConfig } from '@shared/categories'
import type { CategoryId } from '@shared/types'
import { getDb, tx } from '../db/client'
import { businessSettings, resources, serviceCategories, services, staff } from '../db/schema'
import { get } from '../db/raw'
import { AppError } from '../errors'
import { normalizePhone } from '@shared/domain/phone'
import { SERVICE_COLORS } from '@shared/constants'
import { writeSchedule } from './schedules'
import { ensureDefaultTemplates } from './templates'
import { resetBusinessCache } from './business'
import { updateSettings } from './settings'
import { logActivity } from './activity'

export function completeOnboarding(input: ChannelParsedInput<'onboarding.complete'>): void {
  const existing = get<{ onboarded_at: number | null }>('SELECT onboarded_at FROM business_settings WHERE id = 1')
  if (existing?.onboarded_at) throw new AppError('already_done', 'DigiPlan est déjà configuré.')
  const now = Date.now()
  const categoryId = input.categoryId as CategoryId
  const config = getCategoryConfig(categoryId)

  tx(() => {
    const db = getDb()
    const b = input.business
    db.delete(businessSettings).run()
    db.insert(businessSettings)
      .values({
        id: 1,
        name: b.name,
        ownerName: b.ownerName,
        phone: normalizePhone(b.phone),
        whatsapp: normalizePhone(b.whatsapp),
        email: b.email,
        address: b.address,
        city: b.city,
        logoDataUrl: b.logoDataUrl,
        currency: b.currency || 'MAD',
        timezone: b.timezone || 'Africa/Casablanca',
        categoryId,
        terminology: {},
        onboardedAt: now,
        createdAt: now,
        updatedAt: now
      })
      .run()
    writeSchedule(null, input.hours)

    db.insert(staff)
      .values({
        id: randomUUID(),
        name: input.staff.name,
        role: input.staff.role || config.defaultStaffRole,
        phone: normalizePhone(input.staff.phone),
        email: input.staff.email,
        color: /^#[0-9a-f]{6}$/i.test(input.staff.color) ? input.staff.color : '#2563eb',
        active: true,
        useBusinessHours: true,
        sortOrder: 1,
        createdAt: now,
        updatedAt: now
      })
      .run()

    const categoryIds = new Map<string, string>()
    let order = 0
    for (const s of input.services) {
      const catName = s.category.trim()
      let catId: string | null = null
      if (catName) {
        catId = categoryIds.get(catName) ?? null
        if (!catId) {
          catId = randomUUID()
          categoryIds.set(catName, catId)
          db.insert(serviceCategories)
            .values({ id: catId, name: catName, sortOrder: categoryIds.size, createdAt: now, updatedAt: now })
            .run()
        }
      }
      db.insert(services)
        .values({
          id: randomUUID(),
          categoryId: catId,
          name: s.name,
          durationMin: s.durationMin,
          price: s.price,
          color: SERVICE_COLORS[order % SERVICE_COLORS.length],
          active: true,
          sortOrder: ++order,
          createdAt: now,
          updatedAt: now
        })
        .run()
    }

    input.resources.forEach((name, i) =>
      db.insert(resources).values({ id: randomUUID(), name, active: true, sortOrder: i + 1, createdAt: now, updatedAt: now }).run()
    )
  })

  ensureDefaultTemplates()
  updateSettings({ resourcesEnabled: false, calendarSlotMin: config.slotStepMin === 10 ? 10 : 15 })
  resetBusinessCache()
  logActivity('onboarding', 'business', null, { categoryId })
}
