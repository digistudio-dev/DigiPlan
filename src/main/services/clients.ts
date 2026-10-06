// Clients / patients : fiches, statistiques, recherche, archivage.

import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { ClientDto, ClientListItem, Gender } from '@shared/types'
import type { ChannelParsedInput } from '@shared/ipc'
import { formatPhone, normalizePhone } from '@shared/domain/phone'
import { getDb, tx } from '../db/client'
import { clientTags, clients } from '../db/schema'
import { all, get, likePattern, run, searchable } from '../db/raw'
import { AppError, notFound } from '../errors'
import { logActivity } from './activity'

/** Statuts pour lesquels la prestation a été (ou est en train d'être) réalisée : le solde est dû. */
export const DUE_STATUSES_SQL = "('completed','in_progress','arrived')"

interface ClientRow {
  id: string
  first_name: string
  last_name: string
  phone: string
  whatsapp_phone: string
  email: string
  birth_date: string | null
  gender: string | null
  address: string
  insurance: string
  notes: string
  created_at: number
  updated_at: number
  archived_at: number | null
  tags: string | null
  appointment_count: number
  last_at: number | null
  next_at: number | null
  total_spent: number
  balance: number
  cancel_count: number
  noshow_count: number
}

const STATS_SELECT = `
  SELECT c.*,
    (SELECT GROUP_CONCAT(tag, '|') FROM client_tags t WHERE t.client_id = c.id) AS tags,
    (SELECT COUNT(*) FROM appointments a WHERE a.client_id = c.id AND a.deleted_at IS NULL) AS appointment_count,
    (SELECT MAX(a.start_at) FROM appointments a WHERE a.client_id = c.id AND a.deleted_at IS NULL
        AND a.start_at <= @now AND a.status NOT IN ('cancelled','no_show')) AS last_at,
    (SELECT MIN(a.start_at) FROM appointments a WHERE a.client_id = c.id AND a.deleted_at IS NULL
        AND a.start_at > @now AND a.status IN ('pending','confirmed')) AS next_at,
    (SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.client_id = c.id AND p.voided_at IS NULL) AS total_spent,
    (SELECT COALESCE(SUM(MAX(a.total - COALESCE((SELECT SUM(p.amount) FROM payments p
        WHERE p.appointment_id = a.id AND p.voided_at IS NULL), 0), 0)), 0)
       FROM appointments a WHERE a.client_id = c.id AND a.deleted_at IS NULL AND a.status IN ${DUE_STATUSES_SQL}) AS balance,
    (SELECT COUNT(*) FROM appointments a WHERE a.client_id = c.id AND a.deleted_at IS NULL AND a.status = 'cancelled') AS cancel_count,
    (SELECT COUNT(*) FROM appointments a WHERE a.client_id = c.id AND a.deleted_at IS NULL AND a.status = 'no_show') AS noshow_count
  FROM clients c`

function toListItem(r: ClientRow): ClientListItem {
  return {
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    phone: r.phone,
    whatsappPhone: r.whatsapp_phone,
    email: r.email,
    birthDate: r.birth_date,
    gender: (r.gender as Gender | null) ?? null,
    address: r.address,
    insurance: r.insurance,
    notes: r.notes,
    tags: r.tags ? r.tags.split('|').sort((a, b) => a.localeCompare(b, 'fr')) : [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    archivedAt: r.archived_at,
    appointmentCount: r.appointment_count,
    lastAppointmentAt: r.last_at,
    nextAppointmentAt: r.next_at,
    totalSpent: r.total_spent,
    balance: r.balance,
    cancellationCount: r.cancel_count,
    noShowCount: r.noshow_count
  }
}

export function clientDisplayName(c: { firstName: string; lastName: string }): string {
  return `${c.firstName} ${c.lastName}`.trim()
}

function buildSearchText(c: { firstName: string; lastName: string; phone: string; whatsappPhone: string; email: string }) {
  const phones = [c.phone, c.whatsappPhone].filter(Boolean)
  const phoneForms = phones.flatMap((p) => [p, p.replace(/\D/g, ''), formatPhone(p).replace(/\s/g, '')])
  return searchable([c.firstName, c.lastName, c.lastName + ' ' + c.firstName, c.email, ...phoneForms].join(' '))
}

export function listClients(input: ChannelParsedInput<'clients.list'>): { items: ClientListItem[]; total: number } {
  const where: string[] = []
  const params: Record<string, unknown> = { now: Date.now(), limit: input.pageSize, offset: input.page * input.pageSize }
  where.push(input.filter === 'archived' ? 'archived_at IS NOT NULL' : 'archived_at IS NULL')
  if (input.search?.trim()) {
    // Recherche par nom, téléphone (avec ou sans indicatif) ou email.
    const q = input.search.trim()
    const digits = q.replace(/\D/g, '')
    params.q = likePattern(q)
    if (digits.length >= 3) {
      params.qd = `%${digits.replace(/^0/, '')}%`
      where.push("(search_text LIKE @q ESCAPE '\\' OR search_text LIKE @qd)")
    } else {
      where.push("search_text LIKE @q ESCAPE '\\'")
    }
  }
  if (input.tag) {
    params.tag = input.tag
    where.push('id IN (SELECT client_id FROM client_tags WHERE tag = @tag)')
  }
  if (input.filter === 'balance') where.push('balance > 0')
  const order = {
    name: 'first_name COLLATE NOCASE, last_name COLLATE NOCASE',
    recent: 'created_at DESC',
    lastVisit: 'last_at IS NULL, last_at DESC',
    spent: 'total_spent DESC'
  }[input.sort]
  const base = `SELECT * FROM (${STATS_SELECT}) WHERE ${where.join(' AND ')}`
  const items = all<ClientRow>(`${base} ORDER BY ${order} LIMIT @limit OFFSET @offset`, params).map(toListItem)
  const total = get<{ n: number }>(`SELECT COUNT(*) AS n FROM (${base})`, params)?.n ?? 0
  return { items, total }
}

export function getClient(id: string): ClientListItem {
  const row = get<ClientRow>(`${STATS_SELECT} WHERE c.id = @id`, { id, now: Date.now() })
  if (!row) throw notFound('Ce client')
  return toListItem(row)
}

export function findDuplicates(phone: string, excludeId?: string): Array<{ id: string; name: string; phone: string }> {
  const normalized = normalizePhone(phone)
  if (normalized.replace(/\D/g, '').length < 8) return []
  return all<{ id: string; first_name: string; last_name: string; phone: string }>(
    `SELECT id, first_name, last_name, phone FROM clients
     WHERE (phone = @p OR whatsapp_phone = @p) AND id != @ex AND archived_at IS NULL LIMIT 5`,
    { p: normalized, ex: excludeId ?? '' }
  ).map((r) => ({ id: r.id, name: `${r.first_name} ${r.last_name}`.trim(), phone: r.phone }))
}

export function saveClient(input: ChannelParsedInput<'clients.save'>): ClientDto {
  const now = Date.now()
  const id = input.id ?? randomUUID()
  const phone = normalizePhone(input.phone)
  const whatsappPhone = normalizePhone(input.whatsappPhone)
  const values = {
    firstName: input.firstName,
    lastName: input.lastName,
    phone,
    whatsappPhone,
    email: input.email,
    birthDate: input.birthDate,
    gender: input.gender,
    address: input.address,
    insurance: input.insurance,
    notes: input.notes,
    searchText: buildSearchText({ ...input, phone, whatsappPhone }),
    updatedAt: now
  }
  tx(() => {
    const db = getDb()
    if (input.id) {
      const existing = db.select({ id: clients.id }).from(clients).where(eq(clients.id, input.id)).get()
      if (!existing) throw notFound('Ce client')
      db.update(clients).set(values).where(eq(clients.id, input.id)).run()
    } else {
      db.insert(clients).values({ id, ...values, createdAt: now }).run()
    }
    db.delete(clientTags).where(eq(clientTags.clientId, id)).run()
    for (const tag of new Set(input.tags.map((t) => t.trim()).filter(Boolean))) {
      db.insert(clientTags).values({ clientId: id, tag }).run()
    }
  })
  logActivity(input.id ? 'update' : 'create', 'client', id)
  return getClient(id)
}

export function archiveClient(id: string, archived: boolean): void {
  const r = run('UPDATE clients SET archived_at = ?, updated_at = ? WHERE id = ?', [archived ? Date.now() : null, Date.now(), id])
  if (!r.changes) throw notFound('Ce client')
  logActivity(archived ? 'archive' : 'unarchive', 'client', id)
}

export function clientDeletionImpact(id: string): { appointments: number; payments: number } {
  return {
    appointments: get<{ n: number }>('SELECT COUNT(*) AS n FROM appointments WHERE client_id = ?', [id])?.n ?? 0,
    payments: get<{ n: number }>('SELECT COUNT(*) AS n FROM payments WHERE client_id = ? AND voided_at IS NULL', [id])?.n ?? 0
  }
}

/**
 * Suppression définitive. Refusée si la fiche possède un historique (rendez-vous ou paiements) :
 * l'archivage est alors proposé pour ne jamais perdre de données comptables.
 */
export function deleteClient(id: string): void {
  const impact = clientDeletionImpact(id)
  if (impact.appointments > 0 || impact.payments > 0) {
    throw new AppError(
      'has_history',
      'Cette fiche possède un historique (rendez-vous ou paiements). Archivez-la plutôt pour conserver vos données.'
    )
  }
  const r = run('DELETE FROM clients WHERE id = ?', [id])
  if (!r.changes) throw notFound('Ce client')
  logActivity('delete', 'client', id)
}

export function allTags(): string[] {
  return all<{ tag: string }>('SELECT DISTINCT tag FROM client_tags ORDER BY tag COLLATE NOCASE').map((r) => r.tag)
}

/** Création rapide depuis le formulaire de rendez-vous. */
export function createClientInline(input: Omit<ChannelParsedInput<'clients.save'>, 'id'>): string {
  return saveClient(input).id
}
