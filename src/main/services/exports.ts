// Exports CSV (compatibles Excel français : séparateur « ; », encodage UTF-8 avec BOM).

import { app, dialog, type BrowserWindow } from 'electron'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { endOfDay } from 'date-fns'
import { fromCents } from '@shared/domain/money'
import { formatPhone } from '@shared/domain/phone'
import { fromIsoDate, formatDateShort, formatTime, toIsoDate } from '@shared/format'
import { PAYMENT_METHOD_LABELS, STATUS_LABELS } from '@shared/status'
import type { AppointmentStatus, PaymentMethod } from '@shared/types'
import { all } from '../db/raw'
import { AppError } from '../errors'
import { isPro } from '../license/service'
import { getReport } from './reports'

type Cell = string | number | null | undefined

export function toCsv(header: string[], rows: Cell[][]): string {
  const cell = (v: Cell) => {
    if (v === null || v === undefined) return ''
    const s = typeof v === 'number' ? String(v).replace('.', ',') : v
    // Neutralise les formules (injection CSV) et échappe les guillemets.
    const formulaLike = /^[=@\t\r]/.test(s) || (/^[+-]/.test(s) && !/^[+-]?[\d\s.,]+$/.test(s))
    const safe = formulaLike ? `'${s}` : s
    return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
  }
  return '\ufeff' + [header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n')
}

const money = (cents: number) => fromCents(cents)

function range(from?: string, to?: string) {
  const f = from ? fromIsoDate(from) : 0
  const t = to ? endOfDay(fromIsoDate(to)).getTime() + 1 : 8_640_000_000_000_000
  return { f, t }
}

function build(kind: 'clients' | 'appointments' | 'payments' | 'expenses' | 'report', from?: string, to?: string) {
  const { f, t } = range(from, to)
  switch (kind) {
    case 'clients': {
      const rows = all<Record<string, string | number | null>>(
        `SELECT c.first_name, c.last_name, c.phone, c.whatsapp_phone, c.email, c.birth_date, c.address, c.insurance, c.notes, c.created_at,
           (SELECT GROUP_CONCAT(tag, ', ') FROM client_tags t WHERE t.client_id = c.id) AS tags,
           (SELECT COUNT(*) FROM appointments a WHERE a.client_id = c.id AND a.deleted_at IS NULL) AS n,
           (SELECT COALESCE(SUM(amount), 0) FROM payments p WHERE p.client_id = c.id AND p.voided_at IS NULL) AS spent
         FROM clients c WHERE c.archived_at IS NULL ORDER BY c.first_name, c.last_name`
      )
      return {
        name: 'clients',
        csv: toCsv(
          ['Prénom', 'Nom', 'Téléphone', 'WhatsApp', 'Email', 'Date de naissance', 'Adresse', 'Assurance', 'Étiquettes', 'Notes', 'Rendez-vous', 'Total payé (MAD)', 'Créé le'],
          rows.map((r) => [
            r.first_name,
            r.last_name,
            formatPhone(String(r.phone ?? '')),
            formatPhone(String(r.whatsapp_phone ?? '')),
            r.email,
            r.birth_date,
            r.address,
            r.insurance,
            r.tags,
            r.notes,
            r.n,
            money(Number(r.spent)),
            formatDateShort(Number(r.created_at))
          ])
        ),
        count: rows.length
      }
    }
    case 'appointments': {
      const rows = all<{
        start_at: number
        end_at: number
        status: AppointmentStatus
        client: string
        phone: string
        staff: string | null
        services: string | null
        total: number
        paid: number
        notes: string
      }>(
        `SELECT a.start_at, a.end_at, a.status, TRIM(c.first_name || ' ' || c.last_name) AS client, c.phone, s.name AS staff,
           (SELECT GROUP_CONCAT(name, ' + ') FROM appointment_services x WHERE x.appointment_id = a.id) AS services, a.total,
           (SELECT COALESCE(SUM(amount), 0) FROM payments p WHERE p.appointment_id = a.id AND p.voided_at IS NULL) AS paid, a.notes
         FROM appointments a JOIN clients c ON c.id = a.client_id LEFT JOIN staff s ON s.id = a.staff_id
         WHERE a.deleted_at IS NULL AND a.start_at >= ? AND a.start_at < ? ORDER BY a.start_at`,
        [f, t]
      )
      return {
        name: 'rendez-vous',
        csv: toCsv(
          ['Date', 'Début', 'Fin', 'Client', 'Téléphone', 'Équipe', 'Prestations', 'Statut', 'Total (MAD)', 'Payé (MAD)', 'Reste (MAD)', 'Notes'],
          rows.map((r) => [
            formatDateShort(r.start_at),
            formatTime(r.start_at),
            formatTime(r.end_at),
            r.client,
            formatPhone(r.phone),
            r.staff,
            r.services,
            STATUS_LABELS[r.status],
            money(r.total),
            money(r.paid),
            money(Math.max(0, r.total - r.paid)),
            r.notes
          ])
        ),
        count: rows.length
      }
    }
    case 'payments': {
      const rows = all<{ paid_at: number; receipt_number: string; client: string | null; amount: number; method: PaymentMethod; note: string; voided_at: number | null }>(
        `SELECT p.paid_at, p.receipt_number, TRIM(c.first_name || ' ' || c.last_name) AS client, p.amount, p.method, p.note, p.voided_at
         FROM payments p LEFT JOIN clients c ON c.id = p.client_id
         WHERE p.paid_at >= ? AND p.paid_at < ? ORDER BY p.paid_at`,
        [f, t]
      )
      return {
        name: 'paiements',
        csv: toCsv(
          ['Date', 'Heure', 'N° reçu', 'Client', 'Montant (MAD)', 'Mode', 'Note', 'Statut'],
          rows.map((r) => [
            formatDateShort(r.paid_at),
            formatTime(r.paid_at),
            r.receipt_number,
            r.client,
            money(r.amount),
            PAYMENT_METHOD_LABELS[r.method],
            r.note,
            r.voided_at ? 'Annulé' : 'Valide'
          ])
        ),
        count: rows.length
      }
    }
    case 'expenses': {
      if (!isPro()) throw new AppError('pro_required', 'Les dépenses sont disponibles avec DigiPlan Pro.')
      const rows = all<{ date: string; category: string; description: string; amount: number; method: PaymentMethod; notes: string }>(
        'SELECT date, category, description, amount, method, notes FROM expenses WHERE deleted_at IS NULL AND date >= ? AND date <= ? ORDER BY date',
        [from ?? '0000-01-01', to ?? '9999-12-31']
      )
      return {
        name: 'depenses',
        csv: toCsv(
          ['Date', 'Catégorie', 'Description', 'Montant (MAD)', 'Mode', 'Notes'],
          rows.map((r) => [formatDateShort(fromIsoDate(r.date)), r.category, r.description, money(r.amount), PAYMENT_METHOD_LABELS[r.method], r.notes])
        ),
        count: rows.length
      }
    }
    case 'report': {
      const fromIso = from ?? toIsoDate(Date.now())
      const toIso = to ?? fromIso
      const r = getReport({ from: fromIso, to: toIso })
      const rows: Cell[][] = [
        ['Période', `${formatDateShort(fromIsoDate(fromIso))} – ${formatDateShort(fromIsoDate(toIso))}`],
        ['Encaissements (MAD)', money(r.revenue)],
        ['Rendez-vous', r.appointmentCount],
        ['Terminés', r.completedCount],
        ['Annulés', r.cancelledCount],
        ['Absences', r.noShowCount],
        ['Panier moyen (MAD)', money(r.averageTicket)],
        ...r.paymentMethods.map((m) => [`Encaissé — ${PAYMENT_METHOD_LABELS[m.method]} (MAD)`, money(m.amount)] as Cell[]),
        ...(isPro()
          ? ([
              ['Dépenses (MAD)', money(r.expensesTotal)],
              ['Résultat net estimé (MAD)', money(r.net)],
              ...r.byStaff.map((s) => [`Équipe — ${s.name} (MAD)`, money(s.value)] as Cell[]),
              ...r.byService.map((s) => [`Prestation — ${s.name} (nombre)`, s.count] as Cell[])
            ] as Cell[][])
          : []),
        [],
        ['Date', 'Encaissements (MAD)'],
        ...r.revenueByDay.map((d) => [formatDateShort(fromIsoDate(d.date)), money(d.amount)] as Cell[])
      ]
      return { name: 'rapport', csv: toCsv(['Indicateur', 'Valeur'], rows), count: rows.length }
    }
  }
}

export async function exportCsv(
  parent: BrowserWindow | null,
  input: { kind: 'clients' | 'appointments' | 'payments' | 'expenses' | 'report'; from?: string; to?: string }
): Promise<{ saved: boolean; path?: string; rows?: number }> {
  const { name, csv, count } = build(input.kind, input.from, input.to)
  const options = {
    title: 'Exporter en CSV',
    defaultPath: join(app.getPath('documents'), `DigiPlan_${name}_${toIsoDate(Date.now())}.csv`),
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  }
  const res = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options)
  if (res.canceled || !res.filePath) return { saved: false }
  await writeFile(res.filePath, csv, 'utf8')
  return { saved: true, path: res.filePath, rows: count }
}
