import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { AppointmentDto, AppointmentStatus } from '@shared/types'
import { api, errorMessage } from '@/lib/api'
import { t } from '@/i18n'
import { confirm } from '@/components/confirm'
import { openSeriesScope } from './SeriesScopeDialog'

export type SeriesScope = 'single' | 'following' | 'series'

/** Demande la portée d'une action sur un rendez-vous récurrent. */
export async function askSeriesScope(appointment: Pick<AppointmentDto, 'id' | 'seriesId'>, verb: 'modifier' | 'supprimer'): Promise<SeriesScope | null> {
  if (!appointment.seriesId) return 'single'
  return new Promise((resolve) => openSeriesScope(verb, resolve))
}

export function useAppointmentActions() {
  const status = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AppointmentStatus }) => api('appointments.setStatus', { id, status }),
    onSuccess: (a) => toast.success(`${a.clientName} — ${t.status[a.status]}`),
    onError: (e) => toast.error(errorMessage(e))
  })

  const remove = useMutation({
    mutationFn: ({ id, scope }: { id: string; scope: SeriesScope }) => api('appointments.delete', { id, scope }),
    onSuccess: (n) => toast.success(n > 1 ? `${n} rendez-vous supprimés` : t.appointment.deleted),
    onError: (e) => toast.error(errorMessage(e))
  })

  const cancel = async (a: AppointmentDto) => {
    const ok = await confirm({ title: t.appointment.cancelTitle, body: t.appointment.cancelBody, confirmLabel: t.appointment.actions.cancel })
    if (ok) await status.mutateAsync({ id: a.id, status: 'cancelled' })
    return ok
  }

  const destroy = async (a: AppointmentDto): Promise<boolean> => {
    const scope = await askSeriesScope(a, 'supprimer')
    if (!scope) return false
    const ok = await confirm({ title: t.appointment.deleteTitle, body: t.appointment.deleteBody, confirmLabel: t.common.delete })
    if (!ok) return false
    await remove.mutateAsync({ id: a.id, scope })
    return true
  }

  return { setStatus: (id: string, s: AppointmentStatus) => status.mutate({ id, status: s }), cancel, destroy, pending: status.isPending || remove.isPending }
}
