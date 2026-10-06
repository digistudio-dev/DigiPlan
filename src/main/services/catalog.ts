// Prestations, catégories de prestations et ressources.

import { randomUUID } from 'node:crypto'
import { and, asc, eq, isNull } from 'drizzle-orm'
import type { ResourceDto, ServiceCategoryDto, ServiceDto } from '@shared/types'
import type { ChannelParsedInput } from '@shared/ipc'
import { getDb, tx } from '../db/client'
import { resources, serviceCategories, services, staffServices } from '../db/schema'
import { get } from '../db/raw'
import { notFound } from '../errors'
import { logActivity } from './activity'

type ServiceRow = typeof services.$inferSelect

function toServiceDto(row: ServiceRow, staffIds: string[]): ServiceDto {
  return {
    id: row.id,
    categoryId: row.categoryId,
    name: row.name,
    description: row.description,
    durationMin: row.durationMin,
    price: row.price,
    color: row.color,
    active: row.active,
    bufferBeforeMin: row.bufferBeforeMin,
    bufferAfterMin: row.bufferAfterMin,
    staffIds,
    sortOrder: row.sortOrder
  }
}

export function listCatalog(includeInactive = false): { categories: ServiceCategoryDto[]; services: ServiceDto[] } {
  const db = getDb()
  const cats = db.select().from(serviceCategories).orderBy(asc(serviceCategories.sortOrder), asc(serviceCategories.name)).all()
  const rows = db
    .select()
    .from(services)
    .where(includeInactive ? isNull(services.archivedAt) : and(isNull(services.archivedAt), eq(services.active, true)))
    .orderBy(asc(services.sortOrder), asc(services.name))
    .all()
  const links = db.select().from(staffServices).all()
  return {
    categories: cats.map((c) => ({ id: c.id, name: c.name, sortOrder: c.sortOrder })),
    services: rows.map((r) =>
      toServiceDto(
        r,
        links.filter((l) => l.serviceId === r.id).map((l) => l.staffId)
      )
    )
  }
}

export function getServicesByIds(ids: string[]): ServiceRow[] {
  if (!ids.length) return []
  const db = getDb()
  return ids
    .map((id) => db.select().from(services).where(eq(services.id, id)).get())
    .filter((r): r is ServiceRow => Boolean(r))
}

export function saveService(input: ChannelParsedInput<'services.save'>): ServiceDto {
  const now = Date.now()
  const id = input.id ?? randomUUID()
  tx(() => {
    const db = getDb()
    const values = {
      categoryId: input.categoryId ?? null,
      name: input.name,
      description: input.description,
      durationMin: input.durationMin,
      price: input.price,
      color: input.color,
      active: input.active,
      bufferBeforeMin: input.bufferBeforeMin,
      bufferAfterMin: input.bufferAfterMin,
      updatedAt: now
    }
    if (input.id) {
      const existing = db.select({ id: services.id }).from(services).where(eq(services.id, input.id)).get()
      if (!existing) throw notFound('Cette prestation')
      db.update(services).set(values).where(eq(services.id, input.id)).run()
    } else {
      const order = get<{ n: number }>('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM services')?.n ?? 0
      db.insert(services).values({ id, ...values, sortOrder: order, createdAt: now }).run()
    }
    db.delete(staffServices).where(eq(staffServices.serviceId, id)).run()
    for (const staffId of new Set(input.staffIds)) {
      db.insert(staffServices).values({ staffId, serviceId: id }).run()
    }
  })
  logActivity(input.id ? 'update' : 'create', 'service', id, { name: input.name })
  const row = getDb().select().from(services).where(eq(services.id, id)).get()!
  const links = getDb().select().from(staffServices).where(eq(staffServices.serviceId, id)).all()
  return toServiceDto(
    row,
    links.map((l) => l.staffId)
  )
}

/** Une prestation déjà utilisée est archivée (l'historique conserve son nom), sinon supprimée. */
export function deleteService(id: string): { archived: boolean } {
  const db = getDb()
  const used = get<{ n: number }>('SELECT COUNT(*) AS n FROM appointment_services WHERE service_id = ?', [id])?.n ?? 0
  if (used > 0) {
    db.update(services)
      .set({ active: false, archivedAt: Date.now(), updatedAt: Date.now() })
      .where(eq(services.id, id))
      .run()
    logActivity('archive', 'service', id)
    return { archived: true }
  }
  db.delete(services).where(eq(services.id, id)).run()
  logActivity('delete', 'service', id)
  return { archived: false }
}

export function saveServiceCategory(input: { id?: string; name: string }): ServiceCategoryDto {
  const db = getDb()
  const now = Date.now()
  if (input.id) {
    db.update(serviceCategories).set({ name: input.name, updatedAt: now }).where(eq(serviceCategories.id, input.id)).run()
    const row = db.select().from(serviceCategories).where(eq(serviceCategories.id, input.id)).get()
    if (!row) throw notFound('Cette catégorie')
    return { id: row.id, name: row.name, sortOrder: row.sortOrder }
  }
  const id = randomUUID()
  const order = get<{ n: number }>('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM service_categories')?.n ?? 0
  db.insert(serviceCategories).values({ id, name: input.name, sortOrder: order, createdAt: now, updatedAt: now }).run()
  return { id, name: input.name, sortOrder: order }
}

/** Les prestations de la catégorie supprimée deviennent « Sans catégorie ». */
export function deleteServiceCategory(id: string): void {
  getDb().delete(serviceCategories).where(eq(serviceCategories.id, id)).run()
}

export function listResources(): ResourceDto[] {
  return getDb()
    .select()
    .from(resources)
    .where(isNull(resources.archivedAt))
    .orderBy(asc(resources.sortOrder), asc(resources.name))
    .all()
    .map((r) => ({ id: r.id, name: r.name, active: r.active, sortOrder: r.sortOrder }))
}

export function saveResource(input: { id?: string; name: string; active: boolean }): ResourceDto {
  const db = getDb()
  const now = Date.now()
  const id = input.id ?? randomUUID()
  if (input.id) {
    db.update(resources).set({ name: input.name, active: input.active, updatedAt: now }).where(eq(resources.id, input.id)).run()
  } else {
    const order = get<{ n: number }>('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM resources')?.n ?? 0
    db.insert(resources)
      .values({ id, name: input.name, active: input.active, sortOrder: order, createdAt: now, updatedAt: now })
      .run()
  }
  const row = listResources().find((r) => r.id === id)
  if (!row) throw notFound('Cette ressource')
  return row
}

export function deleteResource(id: string): { archived: boolean } {
  const db = getDb()
  const used = get<{ n: number }>('SELECT COUNT(*) AS n FROM appointments WHERE resource_id = ?', [id])?.n ?? 0
  if (used > 0) {
    db.update(resources).set({ active: false, archivedAt: Date.now(), updatedAt: Date.now() }).where(eq(resources.id, id)).run()
    return { archived: true }
  }
  db.delete(resources).where(eq(resources.id, id)).run()
  return { archived: false }
}
