// Intégration WhatsApp (DigiPlan Pro) via whatsapp-web.js.
// Le client tourne dans le processus principal, de façon asynchrone : l'interface n'est jamais bloquée.
// Le navigateur utilisé est Microsoft Edge (présent sur tout Windows 10/11) ou Google Chrome.

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import QRCode from 'qrcode'
import type { Client as WAClient } from 'whatsapp-web.js'
import type * as WWebJS from 'whatsapp-web.js'
import type { WhatsAppState } from '@shared/types'
import { toWhatsAppNumber } from '@shared/domain/phone'
import { AppError } from '../errors'
import { createLogger } from '../logger'
import { emit } from '../ipc/registry'
import { whatsappSessionDir } from '../paths'
import { isPro } from '../license/service'
import { getValue, setValue } from '../services/settings'

const log = createLogger('whatsapp')

const ENABLED_KEY = 'whatsapp.enabled'
const QR_MAX_RETRIES = 6
const RECONNECT_DELAYS = [60_000, 120_000, 300_000, 600_000]

let client: WAClient | null = null
let reconnectTimer: NodeJS.Timeout | null = null
let reconnectAttempt = 0
let starting = false
const readyListeners: Array<() => void> = []

let state: WhatsAppState = {
  status: 'idle',
  qrDataUrl: null,
  accountName: null,
  accountNumber: null,
  error: null,
  browserFound: true,
  updatedAt: Date.now()
}

function setState(patch: Partial<WhatsAppState>) {
  state = { ...state, ...patch, updatedAt: Date.now() }
  emit('whatsapp:state', state)
}

export function onWhatsAppReady(listener: () => void): void {
  readyListeners.push(listener)
}

export function findBrowserExecutable(): string | null {
  const pf = process.env['PROGRAMFILES'] ?? 'C:\\Program Files'
  const pf86 = process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)'
  const local = process.env['LOCALAPPDATA'] ?? ''
  const candidates = [
    join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    local && join(local, 'Google', 'Chrome', 'Application', 'chrome.exe')
  ].filter(Boolean) as string[]
  return candidates.find((p) => existsSync(p)) ?? null
}

export function getWhatsAppState(): WhatsAppState {
  if (!isPro()) return { ...state, status: 'disabled' }
  return state
}

export function isWhatsAppReady(): boolean {
  return state.status === 'ready' && client !== null
}

function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (/ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ENOTFOUND|net::/i.test(msg)) {
    return 'Impossible de joindre WhatsApp. Vérifiez la connexion internet de cet ordinateur.'
  }
  if (/Failed to launch|spawn|ENOENT/i.test(msg)) {
    return 'Impossible de démarrer le navigateur nécessaire à WhatsApp (Edge ou Chrome).'
  }
  if (/timeout/i.test(msg)) return 'WhatsApp met trop de temps à répondre. Réessayez dans un instant.'
  return 'Impossible de connecter WhatsApp.'
}

function scheduleReconnect() {
  if (reconnectTimer || !getValue<boolean>(ENABLED_KEY) || !isPro()) return
  const delay = RECONNECT_DELAYS[Math.min(reconnectAttempt, RECONNECT_DELAYS.length - 1)]
  reconnectAttempt++
  log.info(`Nouvelle tentative de connexion dans ${delay / 1000}s`)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    void startWhatsApp()
  }, delay)
}

async function destroyClient() {
  const c = client
  client = null
  if (c) {
    try {
      await c.destroy()
    } catch (err) {
      log.warn('Fermeture du client WhatsApp', err)
    }
  }
}

/** Démarre (ou redémarre) la session. Affiche un QR si aucune session n'est enregistrée. */
export async function startWhatsApp(): Promise<WhatsAppState> {
  if (!isPro()) throw new AppError('pro_required', 'WhatsApp est disponible avec DigiPlan Pro.')
  if (starting || state.status === 'ready') return state
  const executablePath = findBrowserExecutable()
  if (!executablePath) {
    setState({ status: 'error', browserFound: false, error: 'Microsoft Edge ou Google Chrome est requis pour WhatsApp.' })
    return state
  }
  starting = true
  setValue(ENABLED_KEY, true)
  setState({ status: 'initializing', qrDataUrl: null, error: null, browserFound: true })
  try {
    await destroyClient()
    // Chargement différé (démarrage plus rapide). `require` car le bytecode V8 ne gère pas `import()` dynamique.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Client, LocalAuth } = require('whatsapp-web.js') as typeof WWebJS
    const c = new Client({
      authStrategy: new LocalAuth({ clientId: 'digiplan', dataPath: whatsappSessionDir() }),
      webVersionCache: { type: 'local', path: join(app.getPath('userData'), 'whatsapp-cache') },
      qrMaxRetries: QR_MAX_RETRIES,
      takeoverOnConflict: true,
      puppeteer: {
        executablePath,
        headless: true,
        args: ['--no-first-run', '--no-default-browser-check', '--disable-gpu', '--disable-extensions', '--mute-audio']
      }
    })
    client = c

    c.on('qr', async (qr: string) => {
      try {
        const dataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320, errorCorrectionLevel: 'M' })
        setState({ status: 'qr', qrDataUrl: dataUrl, error: null })
      } catch (err) {
        log.error('Génération du QR', err)
      }
    })
    c.on('authenticated', () => setState({ status: 'authenticated', qrDataUrl: null }))
    c.on('auth_failure', (msg: string) => {
      log.warn('Échec d’authentification WhatsApp', msg)
      setState({ status: 'error', qrDataUrl: null, error: 'La session WhatsApp a expiré. Reconnectez-vous en scannant le QR code.' })
    })
    c.on('ready', () => {
      reconnectAttempt = 0
      const info = c.info
      setState({
        status: 'ready',
        qrDataUrl: null,
        error: null,
        accountName: info?.pushname ?? null,
        accountNumber: info?.wid?.user ? `+${info.wid.user}` : null
      })
      log.info('WhatsApp connecté')
      for (const l of readyListeners) {
        try {
          l()
        } catch {
          // ignore
        }
      }
    })
    c.on('disconnected', (reason: string) => {
      log.warn('WhatsApp déconnecté', reason)
      void destroyClient()
      const loggedOut = /LOGOUT|UNPAIRED/i.test(String(reason))
      setState({
        status: 'disconnected',
        qrDataUrl: null,
        error: loggedOut
          ? 'L’appareil a été dissocié depuis le téléphone. Reconnectez WhatsApp pour continuer.'
          : 'WhatsApp a été déconnecté. Reconnexion automatique en cours…'
      })
      if (!loggedOut) scheduleReconnect()
    })

    // initialize() résout après le chargement de WhatsApp Web ; les événements ci-dessus pilotent l'état.
    c.initialize().catch((err: unknown) => {
      if (client !== c) return
      log.error('Initialisation WhatsApp', err)
      const qrExpired = /qr|max/i.test(err instanceof Error ? err.message : '')
      setState({
        status: 'error',
        qrDataUrl: null,
        error: qrExpired ? 'Le QR code a expiré. Cliquez sur « Connecter WhatsApp » pour en générer un nouveau.' : friendlyError(err)
      })
      void destroyClient()
      if (!qrExpired) scheduleReconnect()
    })
  } catch (err) {
    log.error('Démarrage WhatsApp', err)
    setState({ status: 'error', error: friendlyError(err) })
    scheduleReconnect()
  } finally {
    starting = false
  }
  return state
}

/** Déconnexion volontaire : la session est supprimée, un nouveau QR sera nécessaire. */
export async function disconnectWhatsApp(): Promise<WhatsAppState> {
  setValue(ENABLED_KEY, false)
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = null
  const c = client
  if (c) {
    try {
      if (state.status === 'ready') await c.logout()
    } catch (err) {
      log.warn('Logout WhatsApp', err)
    }
  }
  await destroyClient()
  setState({ status: 'idle', qrDataUrl: null, accountName: null, accountNumber: null, error: null })
  return state
}

/** Démarrage automatique au lancement si l'utilisateur avait connecté WhatsApp. */
export function autoStartWhatsApp(): void {
  if (isPro() && getValue<boolean>(ENABLED_KEY)) {
    setTimeout(() => void startWhatsApp(), 2500)
  }
}

export async function stopWhatsApp(): Promise<void> {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = null
  await destroyClient()
}

export async function sendWhatsAppMessage(phone: string, message: string): Promise<void> {
  if (!isPro()) throw new AppError('pro_required', 'WhatsApp est disponible avec DigiPlan Pro.')
  const c = client
  if (!c || state.status !== 'ready') {
    throw new AppError('whatsapp_not_ready', "WhatsApp n'est pas connecté. Connectez-le dans Paramètres → WhatsApp.")
  }
  const number = toWhatsAppNumber(phone)
  if (!number) throw new AppError('invalid_phone', "Le numéro de téléphone n'est pas valide pour WhatsApp.")
  try {
    const id = await c.getNumberId(number)
    if (!id) throw new AppError('not_on_whatsapp', "Ce numéro n'est pas enregistré sur WhatsApp.")
    await c.sendMessage(id._serialized, message)
  } catch (err) {
    if (err instanceof AppError) throw err
    log.error('Envoi WhatsApp', err)
    throw new AppError('send_failed', "L'envoi du message WhatsApp a échoué. Réessayez dans un instant.")
  }
}
