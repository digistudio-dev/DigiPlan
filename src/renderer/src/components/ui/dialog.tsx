import type { ReactNode } from 'react'
import { Dialog as D } from 'radix-ui'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  className,
  bodyClassName,
  hideClose,
  headerless
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  bodyClassName?: string
  hideClose?: boolean
  /** Pas de barre de titre visible (le titre reste accessible aux lecteurs d'écran). */
  headerless?: boolean
}) {
  const width = { sm: 'max-w-[420px]', md: 'max-w-[560px]', lg: 'max-w-[720px]', xl: 'max-w-[900px]' }[size]
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-fade-in" />
        <D.Content
          className={cn(
            'fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100vh-48px)] w-[calc(100vw-48px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-surface shadow-lg focus:outline-none data-[state=open]:animate-zoom-in',
            width,
            className
          )}
          onOpenAutoFocus={(e) => {
            // Focalise le premier champ plutôt que le bouton de fermeture.
            const el = (e.currentTarget as HTMLElement).querySelector<HTMLElement>('[data-autofocus], input:not([type=hidden]), textarea, select')
            if (el) {
              e.preventDefault()
              el.focus()
            }
          }}
        >
          {headerless ? (
            <>
              <D.Title className="sr-only">{title}</D.Title>
              <D.Description className="sr-only">{typeof description === 'string' ? description : ''}</D.Description>
              <D.Close className="absolute top-3 right-3 z-10 rounded-md p-1 text-subtle-foreground transition-colors hover:bg-surface-2 hover:text-foreground" aria-label="Fermer">
                <X className="size-4" />
              </D.Close>
            </>
          ) : (
          <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
            <div className="min-w-0">
              <D.Title className="text-[0.95rem] font-semibold tracking-tight">{title}</D.Title>
              {description ? <D.Description className="mt-0.5 text-[0.8125rem] text-muted-foreground">{description}</D.Description> : <D.Description className="sr-only">{typeof title === 'string' ? title : ''}</D.Description>}
            </div>
            {!hideClose ? (
              <D.Close className="-mt-0.5 -mr-1.5 rounded-md p-1 text-subtle-foreground transition-colors hover:bg-surface-2 hover:text-foreground" aria-label="Fermer">
                <X className="size-4" />
              </D.Close>
            ) : null}
          </div>
          )}
          <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 pb-5', bodyClassName)}>{children}</div>
          {footer ? <div className="flex items-center justify-end gap-2 border-t border-border bg-surface-2/50 px-5 py-3 rounded-b-xl">{footer}</div> : null}
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}

export function Sheet({
  open,
  onOpenChange,
  title,
  children,
  width = 440,
  header
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  children: ReactNode
  width?: number
  header?: ReactNode
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 top-[var(--titlebar-h)] z-40 bg-overlay/40 data-[state=open]:animate-fade-in" />
        <D.Content
          style={{ width }}
          className="fixed top-[var(--titlebar-h)] right-0 bottom-0 z-40 flex max-w-[calc(100vw-80px)] flex-col border-l border-border bg-surface shadow-lg focus:outline-none data-[state=open]:animate-slide-in-right"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <D.Title className="sr-only">{title}</D.Title>
          <D.Description className="sr-only">{title}</D.Description>
          {header}
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}

export const DialogClose = D.Close
