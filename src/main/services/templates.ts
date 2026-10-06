// Modèles de messages WhatsApp (modifiables par l'établissement).

import { randomUUID } from 'node:crypto'
import type { AppointmentDto, MessageTemplateDto } from '@shared/types'
import { DEFAULT_TEMPLATES, renderTemplate, type TemplateVariables } from '@shared/domain/templates'
import { formatPhone } from '@shared/domain/phone'
import { formatDateFull, formatTime } from '@shared/format'
import { all, get, run } from '../db/raw'
import { AppError, notFound } from '../errors'
import { getBusiness } from './business'

interface Row {
  id: string
  key: string
  name: string
  body: string
  is_system: number
  updated_at: number
}

const toDto = (r: Row): MessageTemplateDto => ({
  id: r.id,
  key: r.key,
  name: r.name,
  body: r.body,
  isSystem: Boolean(r.is_system),
  updatedAt: r.updated_at
})

/** Crée les modèles par défaut manquants (idempotent). */
export function ensureDefaultTemplates(): void {
  const now = Date.now()
  for (const t of DEFAULT_TEMPLATES) {
    const exists = get<{ id: string }>('SELECT id FROM message_templates WHERE key = ? AND is_system = 1', [t.key])
    if (!exists) {
      run(
        'INSERT INTO message_templates (id, key, name, body, is_system, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)',
        [randomUUID(), t.key, t.name, t.body, now, now]
      )
    }
  }
}

export function listTemplates(): MessageTemplateDto[] {
  return all<Row>('SELECT * FROM message_templates ORDER BY is_system DESC, created_at').map(toDto)
}

export function getTemplateByKey(key: string): MessageTemplateDto | null {
  const r = get<Row>('SELECT * FROM message_templates WHERE key = ? ORDER BY is_system DESC LIMIT 1', [key])
  return r ? toDto(r) : null
}

export function getTemplate(id: string): MessageTemplateDto {
  const r = get<Row>('SELECT * FROM message_templates WHERE id = ?', [id])
  if (!r) throw notFound('Ce modèle')
  return toDto(r)
}

export function saveTemplate(input: { id?: string; name: string; body: string }): MessageTemplateDto {
  const now = Date.now()
  if (input.id) {
    const r = run('UPDATE message_templates SET name = ?, body = ?, updated_at = ? WHERE id = ?', [input.name, input.body, now, input.id])
    if (!r.changes) throw notFound('Ce modèle')
    return getTemplate(input.id)
  }
  const id = randomUUID()
  run('INSERT INTO message_templates (id, key, name, body, is_system, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)', [
    id,
    `custom_${id.slice(0, 8)}`,
    input.name,
    input.body,
    now,
    now
  ])
  return getTemplate(id)
}

export function deleteTemplate(id: string): void {
  const t = getTemplate(id)
  if (t.isSystem) throw new AppError('invalid', 'Les modèles par défaut ne peuvent pas être supprimés. Vous pouvez les réinitialiser.')
  run('DELETE FROM message_templates WHERE id = ?', [id])
}

export function resetTemplate(id: string): MessageTemplateDto {
  const t = getTemplate(id)
  const def = DEFAULT_TEMPLATES.find((d) => d.key === t.key)
  if (!t.isSystem || !def) throw new AppError('invalid', 'Seuls les modèles par défaut peuvent être réinitialisés.')
  run('UPDATE message_templates SET name = ?, body = ?, updated_at = ? WHERE id = ?', [def.name, def.body, Date.now(), id])
  return getTemplate(id)
}

export function variablesFor(appointment: AppointmentDto | null, clientName: string): TemplateVariables {
  const business = getBusiness()
  return {
    client_name: clientName,
    business_name: business?.name ?? '',
    address: [business?.address, business?.city].filter(Boolean).join(', '),
    phone: formatPhone(business?.phone ?? ''),
    date: appointment ? formatDateFull(appointment.startAt) : '',
    time: appointment ? formatTime(appointment.startAt) : '',
    service: appointment ? appointment.services.map((s) => s.name).join(' + ') : '',
    staff_name: appointment?.staffName ?? ''
  }
}

export function renderForAppointment(templateKey: string, appointment: AppointmentDto): string {
  const t = getTemplateByKey(templateKey)
  const def = DEFAULT_TEMPLATES.find((d) => d.key === templateKey)
  const body = t?.body ?? def?.body ?? ''
  return renderTemplate(body, variablesFor(appointment, appointment.clientName))
}
