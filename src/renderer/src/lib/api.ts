// Client IPC typé : appelle le processus principal et transforme les erreurs en exceptions lisibles.

import type { Channel, ChannelInput, ChannelOutput, EventMap, EventName, IpcResult } from '@shared/ipc'

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

type Args<C extends Channel> = undefined extends ChannelInput<C> ? [input?: ChannelInput<C>] : [input: ChannelInput<C>]

export async function api<C extends Channel>(channel: C, ...args: Args<C>): Promise<ChannelOutput<C>> {
  let result: IpcResult<ChannelOutput<C>>
  try {
    result = (await window.digiplan.invoke(channel, args[0])) as IpcResult<ChannelOutput<C>>
  } catch {
    throw new ApiError('bridge', 'La communication avec DigiPlan a échoué. Redémarrez l’application.')
  }
  if (!result.ok) throw new ApiError(result.error.code, result.error.message)
  return result.data
}

export function onEvent<E extends EventName>(event: E, listener: (payload: EventMap[E]) => void): () => void {
  return window.digiplan.on(event, (p) => listener(p as EventMap[E]))
}

export function errorMessage(err: unknown, fallback = 'Une erreur est survenue.'): string {
  if (err instanceof ApiError) return err.message
  return fallback
}
