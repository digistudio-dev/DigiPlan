// Recherche globale (Ctrl + K) : clients, téléphones, rendez-vous, prestations, équipe.

import type { AppointmentStatus, SearchResults } from '@shared/types'
import { formatPhone } from '@shared/domain/phone'
import { all, likePattern, searchable } from '../db/raw'

export function globalSearch(query: string): SearchResults {
  const q = query.trim()
  if (q.length < 1) return { clients: [], appointments: [], services: [], staff: [] }
  const like = likePattern(q)
  const digits = q.replace(/\D/g, '')
  const phoneLike = digits.length >= 3 ? `%${digits.replace(/^0/, '')}%` : null
  const clientWhere = phoneLike ? "(search_text LIKE @like ESCAPE '\\' OR search_text LIKE @phone)" : "search_text LIKE @like ESCAPE '\\'"

  const clients = all<{ id: string; first_name: string; last_name: string; phone: string }>(
    `SELECT id, first_name, last_name, phone FROM clients WHERE archived_at IS NULL AND ${clientWhere}
     ORDER BY first_name COLLATE NOCASE LIMIT 8`,
    { like, phone: phoneLike }
  )
  const appointments = all<{ id: string; name: string; start_at: number; services: string | null; status: AppointmentStatus }>(
    `SELECT a.id, TRIM(c.first_name || ' ' || c.last_name) AS name, a.start_at, a.status,
       (SELECT GROUP_CONCAT(name, ' + ') FROM appointment_services s WHERE s.appointment_id = a.id) AS services
     FROM appointments a JOIN clients c ON c.id = a.client_id
     WHERE a.deleted_at IS NULL AND (${clientWhere.replace(/search_text/g, 'c.search_text')})
     ORDER BY ABS(a.start_at - @now) LIMIT 6`,
    { like, phone: phoneLike, now: Date.now() }
  )
  // Listes courtes : filtrage en JS pour ignorer correctement les accents (« epil » → « Épilation »).
  const needle = searchable(q)
  const services = all<{ id: string; name: string; price: number; duration_min: number }>(
    'SELECT id, name, price, duration_min FROM services WHERE archived_at IS NULL AND active = 1 ORDER BY sort_order'
  )
    .filter((s) => searchable(s.name).includes(needle))
    .slice(0, 5)
  const staff = all<{ id: string; name: string; role: string; color: string }>(
    'SELECT id, name, role, color FROM staff WHERE archived_at IS NULL ORDER BY sort_order'
  )
    .filter((s) => searchable(`${s.name} ${s.role}`).includes(needle))
    .slice(0, 5)
  return {
    clients: clients.map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}`.trim(), phone: formatPhone(c.phone) })),
    appointments: appointments.map((a) => ({
      id: a.id,
      clientName: a.name,
      startAt: a.start_at,
      serviceLabel: a.services ?? '',
      status: a.status
    })),
    services: services.map((s) => ({ id: s.id, name: s.name, price: s.price, durationMin: s.duration_min })),
    staff
  }
}
