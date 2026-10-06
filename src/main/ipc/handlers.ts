// Branchement des canaux IPC sur les services métier.

import { app, BrowserWindow, dialog, shell } from 'electron'
import { readFile, stat } from 'node:fs/promises'
import { extname } from 'node:path'
import type { AppSettings, CategoryId } from '@shared/types'
import { APP_NAME } from '@shared/constants'
import { changed, emit, handle } from './registry'
import { AppError } from '../errors'
import { databasePath, logsDir, userDataDir } from '../paths'
import { activateLicense, getLicense, isPro, requirePro } from '../license/service'
import { getBusiness, updateBusiness } from '../services/business'
import { getSettings, updateSettings } from '../services/settings'
import { readSchedule, writeSchedule } from '../services/schedules'
import { tx } from '../db/client'
import { completeOnboarding } from '../services/onboarding'
import { deleteStaff, listStaff, saveStaff } from '../services/staff'
import {
  deleteResource,
  deleteService,
  deleteServiceCategory,
  listCatalog,
  listResources,
  saveResource,
  saveService,
  saveServiceCategory
} from '../services/catalog'
import {
  allTags,
  archiveClient,
  clientDeletionImpact,
  deleteClient,
  findDuplicates,
  getClient,
  listClients,
  saveClient
} from '../services/clients'
import {
  availableSlots,
  checkAppointment,
  deleteAppointment,
  getAppointment,
  listRange,
  loadAppointments,
  moveAppointment,
  saveAppointment,
  seriesInfo,
  setAppointmentStatus
} from '../services/appointments'
import { createPayment, listPayments, paymentsForAppointment, paymentsForClient, voidPayment } from '../services/payments'
import { exportReceiptPdf, printReceipt, receiptHtml } from '../services/receipts'
import { deleteExpense, listExpenses, saveExpense } from '../services/expenses'
import { getDashboard, getReport } from '../services/reports'
import { deleteTemplate, getTemplate, getTemplateByKey, listTemplates, resetTemplate, saveTemplate, variablesFor } from '../services/templates'
import { listReminders, queueConfirmation, retryReminder } from '../services/reminders'
import { disconnectWhatsApp, getWhatsAppState, sendWhatsAppMessage, startWhatsApp, stopWhatsApp } from '../integrations/whatsapp'
import {
  cancelGoogleConnect,
  connectGoogle,
  disconnectGoogle,
  getGoogleState,
  listGoogleCalendars,
  selectGoogleCalendar,
  setGoogleCredentials,
  setGoogleSync,
  stopGoogleSyncWorker,
  syncGoogleNow
} from '../integrations/google-calendar'
import {
  backupDirectory,
  backupState,
  chooseBackupDirectory,
  createBackup,
  listBackups,
  pickBackupFile,
  restoreBackup,
  stopAutoBackup,
  verifyBackup
} from '../services/backup'
import { stopReminderScheduler } from '../services/reminders'
import { exportCsv } from '../services/exports'
import { globalSearch } from '../services/search'
import { dismissNotification, listNotifications } from '../services/notifications'
import { renderTemplate } from '@shared/domain/templates'
import { logActivity } from '../services/activity'
import { applyTitleBarTheme } from '../window'

const focused = () => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null

const EXTERNAL_HOSTS = ['digistudio.dev', 'www.digistudio.dev', 'console.cloud.google.com', 'support.google.com', 'faq.whatsapp.com', 'www.whatsapp.com']

export function registerIpcHandlers(): void {
  // ----- Application -----
  handle('app.info', () => ({
    name: APP_NAME,
    version: app.getVersion(),
    electron: process.versions.electron,
    dataPath: userDataDir(),
    databasePath: databasePath(),
    logsPath: logsDir(),
    isDev: !app.isPackaged
  }))
  handle('app.openExternal', async ({ url }) => {
    const u = new URL(url)
    if (u.protocol !== 'https:' || !EXTERNAL_HOSTS.includes(u.hostname)) throw new AppError('forbidden', 'Lien non autorisé.')
    await shell.openExternal(u.toString())
  })
  handle('app.openFolder', async ({ target }) => {
    const path = target === 'data' ? userDataDir() : target === 'logs' ? logsDir() : backupDirectory()
    await shell.openPath(path)
  })
  handle('app.relaunch', () => {
    app.relaunch()
    app.exit(0)
  })

  handle('bootstrap.get', () => ({
    business: getBusiness(),
    settings: getSettings(),
    license: getLicense(),
    hours: readSchedule(null)
  }))

  handle('onboarding.complete', (input) => {
    completeOnboarding(input)
    changed('business', 'staff', 'services', 'settings')
  })

  // ----- Établissement & paramètres -----
  handle('business.update', (input) => {
    const { categoryId, terminology, ...rest } = input
    const b = updateBusiness({ ...rest, ...(categoryId ? { categoryId: categoryId as CategoryId } : {}), ...(terminology ? { terminology } : {}) })
    changed('business')
    return b
  })
  handle('business.setHours', (week) => {
    tx(() => writeSchedule(null, week))
    changed('business', 'staff')
    return readSchedule(null)
  })
  handle('settings.update', (patch) => {
    // Ressources et personnalisation des reçus : DigiPlan Pro.
    if (patch.resourcesEnabled === true || patch.receiptAccentColor !== undefined || patch.receiptFooter !== undefined) {
      requirePro()
    }
    const s = updateSettings(patch as Partial<AppSettings>)
    if (patch.theme) applyTitleBarTheme(s.theme)
    changed('settings')
    return s
  })

  // ----- Équipe -----
  handle('staff.list', (input) => listStaff(input?.includeInactive))
  handle('staff.save', (input) => {
    // Commissions : DigiPlan Pro (la valeur existante est conservée telle quelle en Free).
    const s = saveStaff(input)
    changed('staff')
    return s
  })
  handle('staff.delete', ({ id }) => {
    const r = deleteStaff(id)
    changed('staff')
    return r
  })

  // ----- Prestations & ressources -----
  handle('services.list', (input) => listCatalog(input?.includeInactive))
  handle('services.save', (input) => {
    const s = saveService(input)
    changed('services')
    return s
  })
  handle('services.delete', ({ id }) => {
    const r = deleteService(id)
    changed('services')
    return r
  })
  handle('serviceCategories.save', (input) => {
    const c = saveServiceCategory(input)
    changed('services')
    return c
  })
  handle('serviceCategories.delete', ({ id }) => {
    deleteServiceCategory(id)
    changed('services')
  })
  handle('resources.list', () => listResources())
  handle('resources.save', (input) => {
    requirePro()
    const r = saveResource(input)
    changed('resources')
    return r
  })
  handle('resources.delete', ({ id }) => {
    const r = deleteResource(id)
    changed('resources')
    return r
  })

  // ----- Clients -----
  handle('clients.list', (input) => listClients(input))
  handle('clients.get', ({ id }) => getClient(id))
  handle('clients.save', (input) => {
    const c = saveClient(input)
    changed('clients')
    return c
  })
  handle('clients.findDuplicates', ({ phone, excludeId }) => findDuplicates(phone, excludeId))
  handle('clients.archive', ({ id, archived }) => {
    archiveClient(id, archived)
    changed('clients')
  })
  handle('clients.deletionImpact', ({ id }) => clientDeletionImpact(id))
  handle('clients.delete', ({ id }) => {
    deleteClient(id)
    changed('clients')
  })
  handle('clients.history', ({ id }) => ({
    appointments: loadAppointments('a.client_id = @id', { id }, 'ORDER BY a.start_at DESC'),
    payments: paymentsForClient(id)
  }))
  handle('clients.tags', () => allTags())

  // ----- Rendez-vous -----
  handle('appointments.range', ({ from, to }) => listRange(from, to))
  handle('appointments.get', ({ id }) => getAppointment(id))
  handle('appointments.check', (input) => checkAppointment(input))
  handle('appointments.slots', (input) => availableSlots(input))
  handle('appointments.save', (input) => {
    const res = saveAppointment(input)
    if (res.ok) {
      if (input.sendConfirmation && isPro()) queueConfirmation(res.appointment.id)
      changed('appointments', 'clients', 'payments', 'reminders')
    }
    return res
  })
  handle('appointments.move', (input) => {
    const res = moveAppointment(input)
    if (res.ok) changed('appointments', 'reminders')
    return res
  })
  handle('appointments.setStatus', ({ id, status }) => {
    const a = setAppointmentStatus(id, status as Parameters<typeof setAppointmentStatus>[1])
    changed('appointments', 'clients', 'reminders')
    return a
  })
  handle('appointments.delete', ({ id, scope }) => {
    const n = deleteAppointment(id, scope)
    changed('appointments', 'clients', 'reminders')
    return n
  })
  handle('appointments.seriesInfo', ({ id }) => seriesInfo(id))

  // ----- Paiements & reçus -----
  handle('payments.list', (input) => listPayments(input))
  handle('payments.create', (input) => {
    const p = createPayment(input)
    changed('payments', 'appointments', 'clients')
    return p
  })
  handle('payments.forAppointment', ({ appointmentId }) => paymentsForAppointment(appointmentId))
  handle('payments.void', ({ id, reason }) => {
    voidPayment(id, reason)
    changed('payments', 'appointments', 'clients')
  })
  handle('receipts.html', ({ paymentId }) => receiptHtml(paymentId))
  handle('receipts.print', ({ paymentId }) => printReceipt(paymentId))
  handle('receipts.pdf', ({ paymentId }) => exportReceiptPdf(paymentId, focused()))

  // ----- Dépenses (Pro) -----
  handle('expenses.list', ({ from, to }) => {
    requirePro()
    return listExpenses(from, to)
  })
  handle('expenses.save', (input) => {
    requirePro()
    const e = saveExpense(input)
    changed('expenses')
    return e
  })
  handle('expenses.delete', ({ id }) => {
    requirePro()
    deleteExpense(id)
    changed('expenses')
  })

  // ----- Tableau de bord & rapports -----
  handle('dashboard.get', () => getDashboard())
  handle('reports.get', (input) => getReport(input))

  // ----- Modèles & WhatsApp (Pro) -----
  handle('templates.list', () => listTemplates())
  handle('templates.save', (input) => {
    requirePro()
    const t = saveTemplate(input)
    changed('templates')
    return t
  })
  handle('templates.delete', ({ id }) => {
    requirePro()
    deleteTemplate(id)
    changed('templates')
  })
  handle('templates.reset', ({ id }) => {
    requirePro()
    const t = resetTemplate(id)
    changed('templates')
    return t
  })
  handle('whatsapp.state', () => getWhatsAppState())
  handle('whatsapp.connect', () => startWhatsApp())
  handle('whatsapp.disconnect', () => disconnectWhatsApp())
  handle('whatsapp.compose', ({ appointmentId, clientId, templateId }) => {
    requirePro()
    const appointment = appointmentId ? getAppointment(appointmentId) : null
    const client = !appointment && clientId ? getClient(clientId) : null
    const clientName = appointment?.clientName ?? (client ? `${client.firstName} ${client.lastName}`.trim() : '')
    const phone = appointment?.clientWhatsapp ?? client?.whatsappPhone ?? client?.phone ?? ''
    const template = templateId ? getTemplate(templateId) : getTemplateByKey(appointment ? 'reminder' : 'thanks')
    const message = template ? renderTemplate(template.body, variablesFor(appointment, clientName)) : ''
    return { phone, message, clientName }
  })
  handle('whatsapp.send', async ({ phone, message, appointmentId, clientId }) => {
    requirePro()
    await sendWhatsAppMessage(phone, message)
    logActivity('whatsapp_send', appointmentId ? 'appointment' : 'client', appointmentId ?? clientId ?? null)
  })
  handle('reminders.list', ({ status, limit }) => listReminders(status, limit))
  handle('reminders.retry', ({ id }) => {
    requirePro()
    retryReminder(id)
    changed('reminders')
  })

  // ----- Google Calendar (Pro) -----
  handle('google.state', () => getGoogleState())
  handle('google.setCredentials', ({ clientId, clientSecret }) => setGoogleCredentials(clientId, clientSecret))
  handle('google.connect', async () => {
    const s = await connectGoogle()
    emit('google:state', s)
    return s
  })
  handle('google.cancelConnect', () => cancelGoogleConnect())
  handle('google.disconnect', async () => {
    const s = await disconnectGoogle()
    changed('appointments')
    return s
  })
  handle('google.calendars', () => {
    requirePro()
    return listGoogleCalendars()
  })
  handle('google.selectCalendar', ({ id, name }) => {
    requirePro()
    return selectGoogleCalendar(id, name)
  })
  handle('google.setSync', ({ enabled }) => setGoogleSync(enabled))
  handle('google.syncNow', async () => {
    const s = await syncGoogleNow()
    changed('appointments')
    return s
  })

  // ----- Sauvegardes -----
  handle('backup.list', () => listBackups())
  handle('backup.status', () => backupState())
  handle('backup.create', async () => {
    const b = await createBackup('manual')
    changed('backups')
    return b
  })
  handle('backup.verify', ({ filePath }) => verifyBackup(filePath))
  handle('backup.pickFile', () => pickBackupFile(focused()))
  handle('backup.restore', async ({ filePath }) => {
    await restoreBackup(filePath, async () => {
      stopReminderScheduler()
      stopAutoBackup()
      stopGoogleSyncWorker()
      await stopWhatsApp()
    })
  })
  handle('backup.chooseDirectory', async () => {
    const dir = await chooseBackupDirectory(focused())
    if (dir) {
      updateSettings({ backupDirectory: dir })
      changed('settings', 'backups')
    }
    return dir
  })

  // ----- Licence -----
  handle('license.get', () => getLicense())
  handle('license.activate', ({ code }) => {
    const l = activateLicense(code)
    emit('license:changed', l)
    changed('settings', 'staff')
    return l
  })

  // ----- Exports, recherche, notifications -----
  handle('export.csv', (input) => exportCsv(focused(), input))
  handle('search.global', ({ query }) => globalSearch(query))
  handle('notifications.list', () => listNotifications())
  handle('notifications.dismiss', ({ id }) => {
    dismissNotification(id)
    emit('data:changed', { entities: ['notifications'] })
  })

  handle('logo.pick', async () => {
    const win = focused()
    const options = {
      title: 'Choisir un logo',
      properties: ['openFile' as const],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'] }]
    }
    const res = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (res.canceled || !res.filePaths[0]) return null
    const file = res.filePaths[0]
    const info = await stat(file)
    if (info.size > 2 * 1024 * 1024) throw new AppError('too_large', 'Le logo ne doit pas dépasser 2 Mo.')
    const ext = extname(file).slice(1).toLowerCase()
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'svg' ? 'image/svg+xml' : `image/${ext}`
    return `data:${mime};base64,${(await readFile(file)).toString('base64')}`
  })
}
