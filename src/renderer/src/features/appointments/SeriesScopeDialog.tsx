// Choix de la portée d'une action sur une série récurrente.

import { useState } from 'react'
import { create } from 'zustand'
import { Repeat } from 'lucide-react'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { SeriesScope } from './useAppointmentActions'

interface State {
  request: { verb: string; resolve: (s: SeriesScope | null) => void } | null
}
const useStore = create<State>(() => ({ request: null }))

export function openSeriesScope(verb: string, resolve: (s: SeriesScope | null) => void) {
  useStore.setState({ request: { verb, resolve } })
}

export function SeriesScopeHost() {
  const request = useStore((s) => s.request)
  const [scope, setScope] = useState<SeriesScope>('single')
  const close = (value: SeriesScope | null) => {
    request?.resolve(value)
    useStore.setState({ request: null })
    setScope('single')
  }
  const options: Array<{ value: SeriesScope; label: string }> = [
    { value: 'single', label: t.appointment.scopeSingle },
    { value: 'following', label: t.appointment.scopeFollowing },
    { value: 'series', label: t.appointment.scopeSeries }
  ]
  return (
    <Dialog
      open={request !== null}
      onOpenChange={(o) => !o && close(null)}
      size="sm"
      title={
        <span className="flex items-center gap-2">
          <Repeat className="size-4 text-primary" /> {t.appointment.scopeTitle}
        </span>
      }
      description={`${t.appointment.scopeQuestion.replace(':', '')} (${request?.verb ?? ''})`}
      footer={
        <>
          <Button variant="ghost" onClick={() => close(null)}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" onClick={() => close(scope)} data-autofocus>
            {t.common.continue}
          </Button>
        </>
      }
    >
      <div role="radiogroup" className="space-y-1.5">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-[0.8125rem] transition-colors',
              scope === o.value ? 'border-primary bg-primary-soft/50' : 'border-border hover:bg-surface-2'
            )}
          >
            <input type="radio" name="scope" className="accent-[var(--primary)]" checked={scope === o.value} onChange={() => setScope(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
    </Dialog>
  )
}
