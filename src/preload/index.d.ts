import type { Channel, EventName } from '../shared/ipc'

declare global {
  interface Window {
    digiplan: {
      invoke(channel: Channel, input?: unknown): Promise<unknown>
      on(event: EventName, listener: (payload: unknown) => void): () => void
      platform: string
    }
  }
}

export {}
