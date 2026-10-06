import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { AppSettings } from '@shared/types'
import { api, errorMessage } from '@/lib/api'
import { queryClient } from '@/lib/queries'

/** Mise à jour optimiste d'un paramètre, avec retour en cas d'erreur. */
export function useUpdateSettings() {
  return useMutation({
    mutationFn: (patch: Partial<AppSettings>) => api('settings.update', patch),
    onMutate: (patch) => {
      const previous = queryClient.getQueryData(['bootstrap'])
      queryClient.setQueryData(['bootstrap'], (old: { settings: AppSettings } | undefined) => (old ? { ...old, settings: { ...old.settings, ...patch } } : old))
      return { previous }
    },
    onError: (e, _p, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['bootstrap'], ctx.previous)
      toast.error(errorMessage(e))
    }
  })
}

export function SectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-[1.1rem] font-semibold tracking-tight">{title}</h2>
      {description ? <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">{description}</p> : null}
    </div>
  )
}
