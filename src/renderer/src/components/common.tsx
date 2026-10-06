// Composants applicatifs réutilisables.

import { Component, forwardRef, useEffect, useState, type ErrorInfo, type ReactNode } from 'react'
import { Select as S } from 'radix-ui'
import { Check, ChevronDown, RotateCw } from 'lucide-react'
import type { AppointmentStatus } from '@shared/types'
import { STATUS_COLORS } from '@shared/status'
import { formatMoney, fromCents, parseMoneyInput } from '@shared/domain/money'
import { formatPhone } from '@shared/domain/phone'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { Button } from './ui/button'
import markUrl from '@/assets/brand/digiplan-mark.png'

// ---------- Logo ----------
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return <img src={markUrl} alt="DigiPlan" width={size} height={size} className={cn('shrink-0 rounded-[22%]', className)} draggable={false} />
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('font-semibold tracking-tight', className)}>
      <span className="text-foreground">Digi</span>
      <span className="text-primary">Plan</span>
    </span>
  )
}

// ---------- En-tête de page ----------
export function PageHeader({ title, subtitle, actions, children }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="shrink-0 border-b border-border bg-background px-6 pt-5 pb-4">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[1.3rem] leading-tight font-semibold tracking-tight">{title}</h1>
          {subtitle ? <p className="mt-1 text-[0.8125rem] text-muted-foreground">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  )
}

// ---------- État vide ----------
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact
}: {
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
  compact?: boolean
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'px-4 py-8' : 'px-6 py-16', className)}>
      {icon ? (
        <div className="mb-3 flex size-11 items-center justify-center rounded-xl border border-border bg-surface-2 text-muted-foreground shadow-sm [&_svg]:size-5">
          {icon}
        </div>
      ) : null}
      <div className="text-[0.875rem] font-semibold">{title}</div>
      {description ? <div className="mt-1 max-w-sm text-[0.8125rem] text-muted-foreground">{description}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

// ---------- Statut ----------
export function StatusBadge({ status, className }: { status: AppointmentStatus; className?: string }) {
  const color = STATUS_COLORS[status]
  return (
    <span
      className={cn('inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-[0.6875rem] font-medium whitespace-nowrap', className)}
      style={{ background: `color-mix(in srgb, ${color} 13%, transparent)`, color }}
    >
      <span className="size-1.5 rounded-full" style={{ background: color }} />
      {t.status[status]}
    </span>
  )
}

export function Money({ cents, currency = 'MAD', className, muted }: { cents: number; currency?: string; className?: string; muted?: boolean }) {
  return <span className={cn('tabular whitespace-nowrap', muted && 'text-muted-foreground', className)}>{formatMoney(cents, currency)}</span>
}

export function Phone({ value, className }: { value: string; className?: string }) {
  if (!value) return <span className="text-subtle-foreground">—</span>
  return <span className={cn('tabular', className)}>{formatPhone(value)}</span>
}

// ---------- Saisie monétaire ----------
export const MoneyInput = forwardRef<
  HTMLInputElement,
  { value: number; onChange: (cents: number) => void; currency?: string; id?: string; invalid?: boolean; className?: string; disabled?: boolean; autoFocus?: boolean }
>(({ value, onChange, currency = 'MAD', id, invalid, className, disabled, autoFocus }, ref) => {
  const [text, setText] = useState(() => (value ? String(fromCents(value)).replace('.', ',') : ''))
  useEffect(() => {
    const parsed = parseMoneyInput(text)
    if (parsed !== value) setText(value ? String(fromCents(value)).replace('.', ',') : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <div className={cn('relative', className)}>
      <input
        ref={ref}
        id={id}
        inputMode="decimal"
        autoFocus={autoFocus}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        value={text}
        placeholder="0"
        onChange={(e) => {
          setText(e.target.value)
          const parsed = parseMoneyInput(e.target.value)
          onChange(parsed === null ? 0 : Math.max(0, parsed))
        }}
        className="tabular h-8 w-full rounded-md border border-border bg-surface pr-12 pl-2.5 text-[0.8125rem] shadow-sm transition-[border-color,box-shadow] hover:border-border-strong focus:border-primary focus:ring-3 focus:ring-ring/60 focus:outline-none aria-[invalid=true]:border-danger disabled:opacity-60"
      />
      <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs font-medium text-subtle-foreground">{currency}</span>
    </div>
  )
})
MoneyInput.displayName = 'MoneyInput'

// ---------- Liste déroulante ----------
export interface SelectOption {
  value: string
  label: ReactNode
  hint?: ReactNode
  disabled?: boolean
}

export function Select({
  value,
  onChange,
  options,
  placeholder,
  id,
  className,
  disabled,
  invalid,
  size = 'md'
}: {
  value: string | null | undefined
  onChange: (v: string) => void
  options: SelectOption[]
  placeholder?: string
  id?: string
  className?: string
  disabled?: boolean
  invalid?: boolean
  size?: 'sm' | 'md'
}) {
  return (
    <S.Root value={value ?? undefined} onValueChange={onChange} disabled={disabled}>
      <S.Trigger
        id={id}
        aria-invalid={invalid || undefined}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-md border border-border bg-surface px-2.5 text-left text-[0.8125rem] shadow-sm transition-[border-color,box-shadow] hover:border-border-strong focus:border-primary focus:ring-3 focus:ring-ring/60 focus:outline-none disabled:opacity-60 aria-[invalid=true]:border-danger data-[placeholder]:text-subtle-foreground',
          size === 'sm' ? 'h-7 text-xs' : 'h-8',
          className
        )}
      >
        <span className="min-w-0 truncate">
          <S.Value placeholder={placeholder} />
        </span>
        <S.Icon>
          <ChevronDown className="size-3.5 shrink-0 text-subtle-foreground" />
        </S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content
          position="popper"
          sideOffset={4}
          className="z-[70] max-h-[min(360px,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-border bg-surface shadow-lg data-[state=open]:animate-fade-in"
        >
          <S.Viewport className="p-1">
            {options.map((o) => (
              <S.Item
                key={o.value}
                value={o.value}
                disabled={o.disabled}
                className="relative flex h-8 cursor-pointer items-center gap-2 rounded-md pr-2 pl-7 text-[0.8125rem] outline-none select-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2"
              >
                <S.ItemIndicator className="absolute left-2">
                  <Check className="size-3.5 text-primary" />
                </S.ItemIndicator>
                <S.ItemText>{o.label}</S.ItemText>
                {o.hint ? <span className="ml-auto pl-3 text-xs text-subtle-foreground">{o.hint}</span> : null}
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  )
}

// ---------- Section de formulaire ----------
export function FormSection({ title, description, children, className }: { title: ReactNode; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border border-border bg-surface shadow-sm', className)}>
      <header className="border-b border-border px-5 py-3.5">
        <h2 className="text-[0.875rem] font-semibold">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  )
}

// ---------- Gestion des erreurs d'affichage ----------
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Erreur d’affichage', error, info.componentStack)
  }
  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }
  render() {
    if (this.state.error) {
      return (
        <EmptyState
          className="h-full"
          title={t.errors.renderTitle}
          description={t.errors.renderBody}
          action={
            <Button onClick={() => this.setState({ error: null })}>
              <RotateCw /> {t.errors.reload}
            </Button>
          }
        />
      )
    }
    return this.props.children
  }
}
