// Dépenses (DigiPlan Pro).

import { randomUUID } from 'node:crypto'
import type { ExpenseDto, PaymentMethod } from '@shared/types'
import type { ChannelParsedInput } from '@shared/ipc'
import { all, get, run } from '../db/raw'
import { notFound } from '../errors'
import { logActivity } from './activity'

interface Row {
  id: string
  category: string
  amount: number
  description: string
  date: string
  method: PaymentMethod
  notes: string
  created_at: number
}

const toDto = (r: Row): ExpenseDto => ({
  id: r.id,
  category: r.category,
  amount: r.amount,
  description: r.description,
  date: r.date,
  method: r.method,
  notes: r.notes,
  createdAt: r.created_at
})

export function listExpenses(from: string, to: string): ExpenseDto[] {
  return all<Row>(
    'SELECT * FROM expenses WHERE deleted_at IS NULL AND date >= ? AND date <= ? ORDER BY date DESC, created_at DESC',
    [from, to]
  ).map(toDto)
}

export function saveExpense(input: ChannelParsedInput<'expenses.save'>): ExpenseDto {
  const now = Date.now()
  const id = input.id ?? randomUUID()
  if (input.id) {
    const r = run(
      `UPDATE expenses SET category = @category, amount = @amount, description = @description, date = @date,
         method = @method, notes = @notes, updated_at = @now WHERE id = @id AND deleted_at IS NULL`,
      { ...input, id, now }
    )
    if (!r.changes) throw notFound('Cette dépense')
  } else {
    run(
      `INSERT INTO expenses (id, category, amount, description, date, method, notes, created_at, updated_at)
       VALUES (@id, @category, @amount, @description, @date, @method, @notes, @now, @now)`,
      { ...input, id, now }
    )
  }
  logActivity(input.id ? 'update' : 'create', 'expense', id, { amount: input.amount })
  return toDto(get<Row>('SELECT * FROM expenses WHERE id = ?', [id])!)
}

/** Suppression logique : la dépense reste dans la base pour audit. */
export function deleteExpense(id: string): void {
  const r = run('UPDATE expenses SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL', [Date.now(), Date.now(), id])
  if (!r.changes) throw notFound('Cette dépense')
  logActivity('delete', 'expense', id)
}
