// Enregistrement des gestionnaires IPC : validation Zod des entrées, erreurs traduites, journalisation.

import { BrowserWindow, ipcMain } from 'electron'
import { ZodError } from 'zod'
import {
  contract,
  type Channel,
  type ChannelOutput,
  type ChannelParsedInput,
  type DataEntity,
  type EventMap,
  type EventName,
  type IpcResult
} from '@shared/ipc'
import { AppError } from '../errors'
import { createLogger } from '../logger'

const log = createLogger('ipc')

type Handler<C extends Channel> = (input: ChannelParsedInput<C>) => ChannelOutput<C> | Promise<ChannelOutput<C>>

const registered = new Set<Channel>()

export function handle<C extends Channel>(channel: C, handler: Handler<C>): void {
  if (registered.has(channel)) throw new Error(`IPC channel already registered: ${channel}`)
  registered.add(channel)
  const schema = contract[channel].input
  ipcMain.handle(channel, async (event, raw: unknown): Promise<IpcResult<ChannelOutput<C>>> => {
    // Seule la fenêtre de l'application (fichier local ou serveur de dev) peut appeler l'API.
    if (!isTrustedSender(event.senderFrame?.url)) {
      log.warn(`Appel IPC refusé depuis ${event.senderFrame?.url}`)
      return { ok: false, error: { code: 'forbidden', message: 'Action non autorisée.' } }
    }
    try {
      const input = schema.parse(raw) as ChannelParsedInput<C>
      const data = await handler(input)
      return { ok: true, data }
    } catch (err) {
      if (err instanceof AppError) {
        return { ok: false, error: { code: err.code, message: err.message } }
      }
      if (err instanceof ZodError) {
        log.warn(`Entrée invalide sur ${channel}`, err.issues)
        const first = err.issues[0]
        return {
          ok: false,
          error: { code: 'validation', message: first?.message && !first.message.startsWith('Invalid') ? first.message : 'Certaines informations saisies sont invalides.' }
        }
      }
      log.error(`Erreur sur ${channel}`, err)
      return { ok: false, error: { code: 'internal', message: 'Une erreur inattendue est survenue. Elle a été enregistrée dans le journal.' } }
    }
  })
}

export function assertAllChannelsRegistered(): void {
  const missing = (Object.keys(contract) as Channel[]).filter((c) => !registered.has(c))
  if (missing.length) log.error('Canaux IPC sans gestionnaire', missing)
}

function isTrustedSender(url: string | undefined): boolean {
  if (!url) return false
  if (url.startsWith('file://')) return true
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  return Boolean(devUrl && url.startsWith(devUrl))
}

export function emit<E extends EventName>(event: E, payload: EventMap[E]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(event, payload)
  }
}

/** Notifie l'interface que des données ont changé (invalidation ciblée des caches). */
export function changed(...entities: DataEntity[]): void {
  emit('data:changed', { entities: [...entities, 'notifications'] })
}
