// Pont sécurisé entre l'interface et le processus principal.
// Seuls les canaux déclarés dans le contrat IPC sont accessibles ; aucun accès Node n'est exposé.

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { CHANNELS, EVENTS, type Channel, type EventName } from '@shared/ipc'

const allowedChannels = new Set<string>(CHANNELS)
const allowedEvents = new Set<string>(EVENTS)

const api = {
  invoke(channel: Channel, input?: unknown): Promise<unknown> {
    if (!allowedChannels.has(channel)) return Promise.reject(new Error(`Canal non autorisé : ${channel}`))
    return ipcRenderer.invoke(channel, input)
  },
  on(event: EventName, listener: (payload: unknown) => void): () => void {
    if (!allowedEvents.has(event)) throw new Error(`Événement non autorisé : ${event}`)
    const wrapped = (_e: IpcRendererEvent, payload: unknown) => listener(payload)
    ipcRenderer.on(event, wrapped)
    return () => ipcRenderer.removeListener(event, wrapped)
  },
  platform: process.platform
}

contextBridge.exposeInMainWorld('digiplan', api)

export type DigiPlanBridge = typeof api
