// Reçus imprimables : génération HTML, impression et export PDF.

import { app, BrowserWindow, dialog } from 'electron'
import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { formatMoney } from '@shared/domain/money'
import { formatPhone } from '@shared/domain/phone'
import { formatDateLong, formatTime } from '@shared/format'
import { PAYMENT_METHOD_LABELS } from '@shared/status'
import { all, get } from '../db/raw'
import { notFound } from '../errors'
import { isPro } from '../license/service'
import { requireBusiness } from './business'
import { getPayment } from './payments'
import { getSettings } from './settings'
import { createLogger } from '../logger'

const log = createLogger('receipts')

const esc = (v: string | null | undefined) =>
  (v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export function receiptHtml(paymentId: string): string {
  const payment = getPayment(paymentId)
  const business = requireBusiness()
  const settings = getSettings()
  const pro = isPro()
  const accent = pro ? settings.receiptAccentColor : '#0e6be6'
  const footer = pro ? settings.receiptFooter : 'Merci pour votre confiance.'
  const showLogo = (pro ? settings.receiptShowLogo : true) && Boolean(business.logoDataUrl)
  const currency = business.currency

  let lines: Array<{ name: string; price: number }> = []
  let total = payment.amount
  let discount = 0
  let paidToDate = payment.amount
  let apptInfo = ''
  if (payment.appointmentId) {
    const appt = get<{ total: number; discount: number; start_at: number; staff: string | null }>(
      `SELECT a.total, a.discount, a.start_at, s.name AS staff FROM appointments a
       LEFT JOIN staff s ON s.id = a.staff_id WHERE a.id = ?`,
      [payment.appointmentId]
    )
    if (appt) {
      lines = all<{ name: string; price: number }>(
        'SELECT name, price FROM appointment_services WHERE appointment_id = ? ORDER BY sort_order',
        [payment.appointmentId]
      )
      total = appt.total
      discount = appt.discount
      // Total encaissé jusqu'à ce paiement inclus (reçus antérieurs cohérents dans le temps).
      paidToDate =
        get<{ s: number }>(
          `SELECT COALESCE(SUM(amount), 0) AS s FROM payments WHERE appointment_id = ? AND voided_at IS NULL
           AND (paid_at < ? OR (paid_at = ? AND created_at <= ?))`,
          [payment.appointmentId, payment.paidAt, payment.paidAt, payment.createdAt]
        )?.s ?? payment.amount
      apptInfo = `Rendez-vous du ${formatDateLong(appt.start_at)} à ${formatTime(appt.start_at)}${appt.staff ? ` · ${esc(appt.staff)}` : ''}`
    }
  }
  if (!lines.length) lines = [{ name: payment.note || 'Règlement', price: payment.amount }]
  const remaining = Math.max(0, total - paidToDate)
  const client = payment.clientId
    ? get<{ first_name: string; last_name: string; phone: string }>('SELECT first_name, last_name, phone FROM clients WHERE id = ?', [
        payment.clientId
      ])
    : undefined

  const rows = lines
    .map((l) => `<tr><td>${esc(l.name)}</td><td class="num">${formatMoney(l.price, currency)}</td></tr>`)
    .join('')

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Reçu ${esc(payment.receiptNumber)}</title>
<style>
  @page { size: A5; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: #0f172a; margin: 0; font-size: 12px; line-height: 1.45; background: #fff; }
  .wrap { max-width: 520px; margin: 0 auto; padding: 8px 4px; }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding-bottom: 14px; border-bottom: 2px solid ${accent}; }
  .brand { display: flex; gap: 12px; align-items: center; }
  .brand img { width: 52px; height: 52px; object-fit: contain; border-radius: 8px; }
  .brand h1 { font-size: 17px; margin: 0 0 2px; letter-spacing: -0.01em; }
  .muted { color: #64748b; }
  .doc { text-align: right; }
  .doc .title { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: ${accent}; font-weight: 700; }
  .doc .no { font-size: 14px; font-weight: 600; margin-top: 2px; font-variant-numeric: tabular-nums; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 16px 0; }
  .meta .label { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: #64748b; margin-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: #64748b; border-bottom: 1px solid #e2e8f0; padding: 6px 0; font-weight: 600; }
  td { padding: 7px 0; border-bottom: 1px solid #f1f5f9; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .totals { margin-top: 12px; margin-left: auto; width: 60%; }
  .totals div { display: flex; justify-content: space-between; padding: 3px 0; font-variant-numeric: tabular-nums; }
  .totals .grand { font-weight: 700; font-size: 14px; border-top: 1px solid #e2e8f0; margin-top: 4px; padding-top: 8px; }
  .totals .paid { color: ${accent}; font-weight: 600; }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 99px; background: #f1f5f9; font-size: 11px; }
  footer { margin-top: 26px; padding-top: 12px; border-top: 1px dashed #cbd5e1; text-align: center; color: #64748b; font-size: 11px; }
  .void { color: #dc2626; font-weight: 700; text-align: center; border: 2px solid #dc2626; padding: 6px; margin-bottom: 12px; letter-spacing: .1em; }
</style></head>
<body><div class="wrap">
  ${payment.voidedAt ? '<div class="void">PAIEMENT ANNULÉ</div>' : ''}
  <header>
    <div class="brand">
      ${showLogo ? `<img src="${business.logoDataUrl}" alt="">` : ''}
      <div>
        <h1>${esc(business.name)}</h1>
        <div class="muted">${esc([business.address, business.city].filter(Boolean).join(', '))}</div>
        <div class="muted">${esc([formatPhone(business.phone), business.email].filter(Boolean).join(' · '))}</div>
      </div>
    </div>
    <div class="doc">
      <div class="title">Reçu</div>
      <div class="no">N° ${esc(payment.receiptNumber)}</div>
      <div class="muted">${formatDateLong(payment.paidAt)} · ${formatTime(payment.paidAt)}</div>
    </div>
  </header>
  <div class="meta">
    <div><div class="label">Client</div><div>${esc(client ? `${client.first_name} ${client.last_name}`.trim() : '—')}</div>
      ${client?.phone ? `<div class="muted">${esc(formatPhone(client.phone))}</div>` : ''}</div>
    <div><div class="label">Mode de paiement</div><div><span class="pill">${PAYMENT_METHOD_LABELS[payment.method]}</span></div></div>
  </div>
  ${apptInfo ? `<div class="muted" style="margin-bottom:6px">${apptInfo}</div>` : ''}
  <table><thead><tr><th>Désignation</th><th class="num">Montant</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="totals">
    ${discount ? `<div><span>Remise</span><span>− ${formatMoney(discount, currency)}</span></div>` : ''}
    <div class="grand"><span>Total</span><span>${formatMoney(total, currency)}</span></div>
    <div class="paid"><span>Montant de ce reçu</span><span>${formatMoney(payment.amount, currency)}</span></div>
    <div><span>Payé</span><span>${formatMoney(Math.min(paidToDate, Math.max(total, paidToDate)), currency)}</span></div>
    <div><span>Reste à payer</span><span>${formatMoney(remaining, currency)}</span></div>
  </div>
  <footer>${esc(footer)}<br><span style="font-size:10px">Reçu généré par DigiPlan</span></footer>
</div></body></html>`
}

async function withReceiptWindow<T>(paymentId: string, fn: (win: BrowserWindow) => Promise<T>): Promise<T> {
  const html = receiptHtml(paymentId)
  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false }
  })
  // Fichier temporaire : plus fiable qu'une URL data: pour les logos volumineux.
  const tmp = join(app.getPath('temp'), `digiplan-receipt-${Date.now()}.html`)
  try {
    await writeFile(tmp, html, 'utf8')
    await win.loadFile(tmp)
    return await fn(win)
  } finally {
    if (!win.isDestroyed()) win.destroy()
    await rm(tmp, { force: true }).catch(() => undefined)
  }
}

export async function printReceipt(paymentId: string): Promise<boolean> {
  getPayment(paymentId)
  return withReceiptWindow(
    paymentId,
    (win) =>
      new Promise<boolean>((resolve) => {
        win.webContents.print({ silent: false, printBackground: true }, (success, reason) => {
          if (!success && reason !== 'cancelled') log.warn('Impression du reçu impossible', reason)
          resolve(success)
        })
      })
  )
}

export async function exportReceiptPdf(paymentId: string, parent?: BrowserWindow | null): Promise<{ saved: boolean; path?: string }> {
  const payment = getPayment(paymentId)
  if (!payment) throw notFound('Ce paiement')
  const options = {
    title: 'Enregistrer le reçu',
    defaultPath: join(app.getPath('documents'), `Recu-${payment.receiptNumber}.pdf`),
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  }
  const target = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options)
  if (target.canceled || !target.filePath) return { saved: false }
  const pdf = await withReceiptWindow(paymentId, (win) =>
    win.webContents.printToPDF({ pageSize: 'A5', printBackground: true, margins: { marginType: 'default' } })
  )
  await writeFile(target.filePath, pdf)
  return { saved: true, path: target.filePath }
}
