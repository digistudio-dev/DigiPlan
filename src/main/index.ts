// Point d'entrée du processus principal DigiPlan.

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app, dialog, Menu } from 'electron'
import { closeDatabase, openDatabase } from './db/client'
import { createLogger } from './logger'
import { logsDir } from './paths'
import { registerIpcHandlers } from './ipc/handlers'
import { assertAllChannelsRegistered } from './ipc/registry'
import { createMainWindow, getMainWindow, hardenSession } from './window'
import { getSettings } from './services/settings'
import { getBusiness } from './services/business'
import { ensureDefaultTemplates } from './services/templates'
import { onAppointmentsChanged } from './services/appointments'
import { kick, startReminderScheduler, stopReminderScheduler, syncReminderFor } from './services/reminders'
import { startAutoBackup, stopAutoBackup } from './services/backup'
import { autoStartWhatsApp, onWhatsAppReady, stopWhatsApp } from './integrations/whatsapp'
import { markGooglePending, startGoogleSyncWorker, stopGoogleSyncWorker } from './integrations/google-calendar'
import { seedDevData } from './services/dev-seed'

const log = createLogger('main')

// Développement / tests automatisés uniquement : dossier de données isolé.
const isolatedData = process.env['DIGIPLAN_USER_DATA']
if (isolatedData && !app.isPackaged) {
  mkdirSync(join(isolatedData, 'Documents'), { recursive: true })
  app.setPath('userData', isolatedData)
  app.setPath('documents', join(isolatedData, 'Documents'))
}

// Interface et sélecteurs natifs (dates, heures) en français.
app.commandLine.appendSwitch('lang', 'fr')
app.setAppUserModelId('dev.digistudio.digiplan')

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = getMainWindow()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  process.on('uncaughtException', (err) => log.error('Exception non interceptée', err))
  process.on('unhandledRejection', (reason) => log.error('Promesse rejetée non gérée', reason))

  void app.whenReady().then(() => {
    Menu.setApplicationMenu(null)
    hardenSession()
    try {
      openDatabase()
    } catch (err) {
      log.error("Impossible d'ouvrir la base de données", err)
      dialog.showErrorBox(
        'DigiPlan',
        `Impossible d'ouvrir la base de données.\n\nVos sauvegardes se trouvent dans Documents\\DigiPlan\\Backups.\nJournal technique : ${logsDir()}`
      )
      app.exit(1)
      return
    }

    if (getBusiness()?.onboardedAt) ensureDefaultTemplates()
    if (process.argv.includes('--seed-dev')) seedDevData()

    registerIpcHandlers()
    assertAllChannelsRegistered()

    // Réactions aux modifications de rendez-vous : rappels WhatsApp et file Google Calendar.
    onAppointmentsChanged((ids) => {
      for (const id of ids) syncReminderFor(id)
      kick()
      markGooglePending(ids)
    })
    onWhatsAppReady(() => kick())

    createMainWindow(getSettings().theme)

    startReminderScheduler()
    startAutoBackup()
    startGoogleSyncWorker()
    autoStartWhatsApp()
    log.info(`DigiPlan ${app.getVersion()} démarré`)
  })

  let quitting = false
  app.on('before-quit', (event) => {
    if (quitting) return
    quitting = true
    event.preventDefault()
    stopReminderScheduler()
    stopAutoBackup()
    stopGoogleSyncWorker()
    const timeout = new Promise((r) => setTimeout(r, 3000))
    void Promise.race([stopWhatsApp(), timeout]).finally(() => {
      closeDatabase()
      app.exit(0)
    })
  })

  app.on('window-all-closed', () => app.quit())
}
