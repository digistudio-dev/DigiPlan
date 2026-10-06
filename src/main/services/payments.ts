// Paiements : grand livre, encaissements partiels/multiples, numérotation fiable des reçus.

import { randomUUID } from 'node:crypto'
import type { PaymentDto, PaymentMethod } from '@shared/types'
import type { ChannelParsedInput } from '@shared/ipc'
import { formatDateShort, formatTime } from '@shared/format'
import { getDb, tx } from '../db/client'
import { payments } from '../db/schema'
import { all, get, likePattern, run } from '../db/raw'
import { AppError, notFound } from '../errors'
import { getValue, setValue } from './settings'
import { logActivity } from './activity'

interface PaymentRow {
  id: string
  appointment_id: string | null
  client_id: string | null
  amount: number
  method: PaymentMethod
  paid_at: number
  note: string
  receipt_number: string
  voided_at: number | null
  created_at: number
  client_name: string | null
  appt_start: number | null
  appt_services: string | null
}

const SELECT = `
  SELECT p.*, TRIM(c.first_name || ' ' || c.last_name) AS client_name, a.start_at AS appt_start,
    (SELECT GROUP_CONCAT(name, ' + ') FROM appointment_services s WHERE s.appointment_id = p.appointment_id) AS appt_services
  FROM payments p
  LEFT JOIN clients c ON c.id = p.client_id
  LEFT JOIN appointments a ON a.id = p.appointment_id`

function toDto(r: PaymentRow): PaymentDto {
  return {
    id: r.id,
    appointmentId: r.appointment_id,
    clientId: r.client_id,
    clientName: r.client_name,
    amount: r.amount,
    method: r.method,
    paidAt: r.paid_at,
    note: r.note,
    receiptNumber: r.receipt_number,
    voidedAt: r.voided_at,
    appointmentStartAt: r.appt_start,
    appointmentLabel: r.appt_start
      ? `${r.appt_services ?? 'Rendez-vous'} · ${formatDateShort(r.appt_start)} ${formatTime(r.appt_start)}`
      : null,
    createdAt: r.created_at
  }
}

/**
 * Numéro de reçu séquentiel par année : R2026-00001.
 * Doit être appelé dans une transaction : le compteur et le paiement sont écrits ensemble.
 */
function nextReceiptNumber(at: number): string {
  const year = new Date(at).getFullYear()
  const state = getValue<{ year: number; seq: number }>('receipt.sequence')
  let seq = state && state.year === year ? state.seq + 1 : 1
  // Sécurité : ne jamais réutiliser un numéro existant (ex. après restauration partielle).
  const prefix = `R${year}-`
  const maxExisting = get<{ n: number | null }>(
    "SELECT MAX(CAST(SUBSTR(receipt_number, 7) AS INTEGER)) AS n FROM payments WHERE receipt_number LIKE ? ",
    [`${prefix}%`]
  )?.n
  if (maxExisting && maxExisting >= seq) seq = maxExisting + 1
  setValue('receipt.sequence', { year, seq })
  return `${prefix}${String(seq).padStart(5, '0')}`
}

export function createPaymentInTx(input: {
  appointmentId: string | null
  clientId: string | null
  amount: number
  method: PaymentMethod
  paidAt: number
  note: string
}): string {
  const now = Date.now()
  const id = randomUUID()
  let clientId = input.clientId
  if (input.appointmentId) {
    const appt = get<{ client_id: string; deleted_at: number | null }>('SELECT client_id, deleted_at FROM appointments WHERE id = ?', [
      input.appointmentId
    ])
    if (!appt || appt.deleted_at) throw notFound('Ce rendez-vous')
    clientId = appt.client_id
  }
  getDb()
    .insert(payments)
    .values({
      id,
      appointmentId: input.appointmentId,
      clientId,
      amount: input.amount,
      method: input.method,
      paidAt: input.paidAt,
      note: input.note,
      receiptNumber: nextReceiptNumber(input.paidAt),
      createdAt: now,
      updatedAt: now
    })
    .run()
  return id
}

export function createPayment(input: ChannelParsedInput<'payments.create'>): PaymentDto {
  if (!input.appointmentId && !input.clientId) {
    throw new AppError('invalid', 'Associez le paiement à un rendez-vous ou à un client.')
  }
  const id = tx(() =>
    createPaymentInTx({
      appointmentId: input.appointmentId ?? null,
      clientId: input.clientId ?? null,
      amount: input.amount,
      method: input.method,
      paidAt: input.paidAt ?? Date.now(),
      note: input.note
    })
  )
  logActivity('create', 'payment', id, { amount: input.amount, method: input.method })
  return getPayment(id)
}

export function getPayment(id: string): PaymentDto {
  const row = get<PaymentRow>(`${SELECT} WHERE p.id = ?`, [id])
  if (!row) throw notFound('Ce paiement')
  return toDto(row)
}

/** Un paiement n'est jamais supprimé : il est annulé (avec motif) et reste visible dans l'historique. */
export function voidPayment(id: string, reason: string): void {
  const r = run('UPDATE payments SET voided_at = ?, void_reason = ?, updated_at = ? WHERE id = ? AND voided_at IS NULL', [
    Date.now(),
    reason || null,
    Date.now(),
    id
  ])
  if (!r.changes) throw notFound('Ce paiement')
  logActivity('void', 'payment', id, { reason })
}

export function listPayments(input: ChannelParsedInput<'payments.list'>): { items: PaymentDto[]; total: number; sum: number } {
  const where: string[] = []
  const params: Record<string, unknown> = { limit: input.pageSize, offset: input.page * input.pageSize }
  if (!input.includeVoided) where.push('p.voided_at IS NULL')
  if (input.from !== undefined) {
    where.push('p.paid_at >= @from')
    params.from = input.from
  }
  if (input.to !== undefined) {
    where.push('p.paid_at < @to')
    params.to = input.to
  }
  if (input.method) {
    where.push('p.method = @method')
    params.method = input.method
  }
  if (input.search?.trim()) {
    params.q = likePattern(input.search)
    where.push("(c.search_text LIKE @q ESCAPE '\\' OR LOWER(p.receipt_number) LIKE @q ESCAPE '\\')")
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const items = all<PaymentRow>(`${SELECT} ${clause} ORDER BY p.paid_at DESC, p.created_at DESC LIMIT @limit OFFSET @offset`, params).map(toDto)
  const agg = get<{ n: number; s: number }>(
    `SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN p.voided_at IS NULL THEN p.amount ELSE 0 END), 0) AS s
     FROM payments p LEFT JOIN clients c ON c.id = p.client_id ${clause}`,
    params
  )
  return { items, total: agg?.n ?? 0, sum: agg?.s ?? 0 }
}

export function paymentsForClient(clientId: string): PaymentDto[] {
  return all<PaymentRow>(`${SELECT} WHERE p.client_id = ? ORDER BY p.paid_at DESC`, [clientId]).map(toDto)
}

export function paymentsForAppointment(appointmentId: string): PaymentDto[] {
  return all<PaymentRow>(`${SELECT} WHERE p.appointment_id = ? AND p.voided_at IS NULL ORDER BY p.paid_at`, [appointmentId]).map(
    toDto
  )
}
