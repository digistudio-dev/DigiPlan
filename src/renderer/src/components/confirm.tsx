// Dialogue de confirmation asynchrone : `if (await confirm({...})) { ... }`

import { useState } from 'react'
import { create } from 'zustand'
import { AlertTriangle } from 'lucide-react'
import { t } from '@/i18n'
import { Dialog } from './ui/dialog'
import { Button } from './ui/button'
import { Checkbox } from './ui/primitives'

interface ConfirmOptions {
  title: string
  body?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'primary'
  /** Case à cocher obligatoire avant de confirmer (actions sensibles). */
  acknowledge?: string
}

interface ConfirmState {
  request: (ConfirmOptions & { resolve: (ok: boolean) => void }) | null
  open: (o: ConfirmOptions) => Promise<boolean>
}

const useConfirmStore = create<ConfirmState>((set) => ({
  request: null,
  open: (o) => new Promise<boolean>((resolve) => set({ request: { ...o, resolve } }))
}))

export const confirm = (o: ConfirmOptions) => useConfirmStore.getState().open(o)

export function ConfirmHost() {
  const request = useConfirmStore((s) => s.request)
  const [checked, setChecked] = useState(false)
  const close = (ok: boolean) => {
    request?.resolve(ok)
    useConfirmStore.setState({ request: null })
    setChecked(false)
  }
  if (!request) return null
  const danger = (request.tone ?? 'danger') === 'danger'
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && close(false)}
      size="sm"
      title={
        <span className="flex items-center gap-2">
          {danger ? (
            <span className="flex size-7 items-center justify-center rounded-full bg-danger-soft text-danger">
              <AlertTriangle className="size-4" />
            </span>
          ) : null}
          {request.title}
        </span>
      }
      footer={
        <>
          <Button variant="ghost" onClick={() => close(false)}>
            {request.cancelLabel ?? t.common.cancel}
          </Button>
          <Button
            data-autofocus
            variant={danger ? 'danger' : 'primary'}
            disabled={Boolean(request.acknowledge) && !checked}
            onClick={() => close(true)}
          >
            {request.confirmLabel ?? t.common.confirm}
          </Button>
        </>
      }
    >
      {request.body ? <div className="text-[0.8125rem] leading-relaxed text-muted-foreground">{request.body}</div> : null}
      {request.acknowledge ? (
        <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-surface-2 p-3 text-[0.8125rem]">
          <Checkbox checked={checked} onCheckedChange={(v) => setChecked(v === true)} className="mt-0.5" />
          <span>{request.acknowledge}</span>
        </label>
      ) : null}
    </Dialog>
  )
}
