import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Check, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { PRO_FEATURE_LABELS } from '@shared/edition'
import { api, errorMessage } from '@/lib/api'
import { queryClient } from '@/lib/queries'
import { useUi } from '@/stores/ui'
import { t } from '@/i18n'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function useActivateLicense(onDone?: () => void) {
  return useMutation({
    mutationFn: (code: string) => api('license.activate', { code }),
    onSuccess: () => {
      toast.success(t.license.success)
      void queryClient.invalidateQueries()
      onDone?.()
    },
    onError: (e) => toast.error(errorMessage(e))
  })
}

export function UpgradeDialog() {
  const feature = useUi((s) => s.upgradeFeature)
  const close = () => useUi.getState().openUpgrade(null)
  const [code, setCode] = useState('')
  const activate = useActivateLicense(() => {
    setCode('')
    close()
  })

  return (
    <Dialog open={feature !== null} onOpenChange={(o) => !o && close()} size="sm" title={t.license.upgradeTitle} headerless bodyClassName="px-0 pb-0">
      <div className="px-6 pt-7 pb-5 text-center">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0e6be6] to-[#18a5f2] text-white shadow-md">
          <Sparkles className="size-6" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">{t.license.upgradeTitle}</h2>
        <p className="mt-1 text-[0.8125rem] text-muted-foreground">{t.license.upgradeBody}</p>
        {feature ? (
          <span className="mt-2.5 inline-flex h-6 items-center rounded-full bg-primary-soft px-2.5 text-xs font-medium text-primary-soft-foreground">
            {PRO_FEATURE_LABELS[feature]}
          </span>
        ) : null}
        <ul className="mx-auto mt-4 max-w-[300px] space-y-2 text-left text-[0.8125rem]">
          {t.license.benefits.map((b) => (
            <li key={b} className="flex items-center gap-2">
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
                <Check className="size-3" strokeWidth={3} />
              </span>
              {b}
            </li>
          ))}
        </ul>
      </div>
      <form
        className="border-t border-border bg-surface-2/50 px-6 py-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (code.trim()) activate.mutate(code)
        }}
      >
        <label htmlFor="upgrade-code" className="mb-1.5 block text-xs font-medium text-muted-foreground">
          {t.license.code}
        </label>
        <div className="flex gap-2">
          <Input
            id="upgrade-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder={t.license.codePlaceholder}
            className="font-mono tracking-wider"
            autoComplete="off"
            spellCheck={false}
          />
          <Button type="submit" variant="primary" loading={activate.isPending} disabled={!code.trim()}>
            {t.license.activate}
          </Button>
        </div>
        <p className="mt-2 text-xs text-subtle-foreground">{t.license.contact}</p>
      </form>
    </Dialog>
  )
}
