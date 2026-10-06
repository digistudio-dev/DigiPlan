// Journal d'activité métier (traçabilité des actions importantes).

import { getDb } from '../db/client'
import { activityLogs } from '../db/schema'

export function logActivity(action: string, entity: string, entityId?: string | null, details?: unknown): void {
  try {
    getDb()
      .insert(activityLogs)
      .values({
        at: Date.now(),
        action,
        entity,
        entityId: entityId ?? null,
        details: details === undefined ? null : JSON.stringify(details)
      })
      .run()
  } catch {
    // La journalisation ne doit jamais bloquer une action métier.
  }
}
