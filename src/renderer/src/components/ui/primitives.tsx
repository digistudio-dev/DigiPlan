// Petits composants d'interface : badges, interrupteurs, onglets, menus, infobulles…

import type { ComponentProps, ReactNode } from 'react'
import { Checkbox as CB, DropdownMenu as DM, Popover as PO, Switch as SW, Tabs as TB, Tooltip as TT } from 'radix-ui'
import { Check } from 'lucide-react'
import { cn, initials } from '@/lib/utils'

// ---------- Badge ----------
export function Badge({
  children,
  tone = 'neutral',
  className,
  dot
}: {
  children: ReactNode
  tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'pro'
  className?: string
  dot?: string
}) {
  const tones = {
    neutral: 'bg-surface-2 text-muted-foreground border-border',
    primary: 'bg-primary-soft text-primary-soft-foreground border-transparent',
    success: 'bg-success-soft text-success border-transparent',
    warning: 'bg-warning-soft text-warning border-transparent',
    danger: 'bg-danger-soft text-danger border-transparent',
    pro: 'bg-gradient-to-r from-[#0e6be6] to-[#18a5f2] text-white border-transparent'
  }
  return (
    <span className={cn('inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[0.6875rem] font-medium whitespace-nowrap', tones[tone], className)}>
      {dot ? <span className="size-1.5 rounded-full" style={{ background: dot }} /> : null}
      {children}
    </span>
  )
}

export function ProBadge({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex h-4 items-center rounded px-1 text-[0.6rem] font-semibold tracking-wide text-white uppercase bg-gradient-to-r from-[#0e6be6] to-[#18a5f2]', className)}>
      Pro
    </span>
  )
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd className={cn('inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-border bg-surface-2 px-1 font-sans text-[0.65rem] font-medium text-muted-foreground', className)}>
      {children}
    </kbd>
  )
}

// ---------- Switch & Checkbox ----------
export function Switch({ className, ...props }: ComponentProps<typeof SW.Root>) {
  return (
    <SW.Root
      className={cn(
        'relative inline-flex h-[18px] w-8 shrink-0 cursor-pointer items-center rounded-full bg-surface-3 transition-colors duration-200 data-[state=checked]:bg-primary disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    >
      <SW.Thumb className="block size-3.5 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform duration-200 data-[state=checked]:translate-x-[16px]" />
    </SW.Root>
  )
}

export function Checkbox({ className, ...props }: ComponentProps<typeof CB.Root>) {
  return (
    <CB.Root
      className={cn(
        'flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-[4px] border border-border-strong bg-surface transition-colors data-[state=checked]:border-primary data-[state=checked]:bg-primary',
        className
      )}
      {...props}
    >
      <CB.Indicator>
        <Check className="size-3 text-white" strokeWidth={3} />
      </CB.Indicator>
    </CB.Root>
  )
}

/** Ligne de réglage : libellé + description à gauche, contrôle à droite. */
export function SettingRow({ title, description, children, className }: { title: ReactNode; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-6 py-3', className)}>
      <div className="min-w-0">
        <div className="text-[0.8125rem] font-medium">{title}</div>
        {description ? <div className="mt-0.5 text-xs text-muted-foreground">{description}</div> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

// ---------- Segmented control ----------
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = 'md'
}: {
  value: T
  onChange: (v: T) => void
  options: Array<{ value: T; label: ReactNode; title?: string }>
  className?: string
  size?: 'sm' | 'md'
}) {
  return (
    <div role="radiogroup" className={cn('inline-flex rounded-lg border border-border bg-surface-2 p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-2.5 font-medium text-muted-foreground transition-all duration-150 hover:text-foreground [&_svg]:size-3.5',
            size === 'sm' ? 'h-6 text-xs' : 'h-7 text-[0.8125rem]',
            value === o.value && 'bg-surface text-foreground shadow-sm'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ---------- Tabs ----------
export const Tabs = TB.Root
export function TabsList({ className, ...props }: ComponentProps<typeof TB.List>) {
  return <TB.List className={cn('flex gap-4 border-b border-border', className)} {...props} />
}
export function TabsTrigger({ className, ...props }: ComponentProps<typeof TB.Trigger>) {
  return (
    <TB.Trigger
      className={cn(
        '-mb-px border-b-2 border-transparent pb-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground',
        className
      )}
      {...props}
    />
  )
}
export const TabsContent = TB.Content

// ---------- Tooltip ----------
export function Tooltip({ content, children, side = 'top' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <TT.Root delayDuration={350}>
      <TT.Trigger asChild>{children}</TT.Trigger>
      <TT.Portal>
        <TT.Content side={side} sideOffset={6} className="z-[60] rounded-md bg-[#18191d] px-2 py-1 text-xs text-white shadow-md data-[state=delayed-open]:animate-fade-in dark:bg-[#2b2e36]">
          {content}
        </TT.Content>
      </TT.Portal>
    </TT.Root>
  )
}
export const TooltipProvider = TT.Provider

// ---------- Dropdown menu ----------
export const Menu = DM.Root
export const MenuTrigger = DM.Trigger
export function MenuContent({ className, align = 'end', ...props }: ComponentProps<typeof DM.Content>) {
  return (
    <DM.Portal>
      <DM.Content
        align={align}
        sideOffset={6}
        className={cn('z-50 min-w-[200px] rounded-lg border border-border bg-surface p-1 shadow-lg data-[state=open]:animate-fade-in', className)}
        {...props}
      />
    </DM.Portal>
  )
}
export function MenuItem({ className, danger, ...props }: ComponentProps<typeof DM.Item> & { danger?: boolean }) {
  return (
    <DM.Item
      className={cn(
        'flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-[0.8125rem] outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2 [&_svg]:size-[15px] [&_svg]:text-muted-foreground',
        danger && 'text-danger data-[highlighted]:bg-danger-soft [&_svg]:text-danger',
        className
      )}
      {...props}
    />
  )
}
export function MenuSeparator() {
  return <DM.Separator className="my-1 h-px bg-border" />
}
export function MenuLabel({ children }: { children: ReactNode }) {
  return <DM.Label className="px-2 pt-1.5 pb-1 text-[0.6875rem] font-medium tracking-wide text-subtle-foreground uppercase">{children}</DM.Label>
}

// ---------- Popover ----------
export const Popover = PO.Root
export const PopoverTrigger = PO.Trigger
export const PopoverAnchor = PO.Anchor
export function PopoverContent({ className, align = 'start', ...props }: ComponentProps<typeof PO.Content>) {
  return (
    <PO.Portal>
      <PO.Content
        align={align}
        sideOffset={6}
        className={cn('z-50 rounded-lg border border-border bg-surface shadow-lg focus:outline-none data-[state=open]:animate-fade-in', className)}
        {...props}
      />
    </PO.Portal>
  )
}

// ---------- Avatar ----------
export function Avatar({ name, color, src, size = 28, className }: { name: string; color?: string | null; src?: string | null; size?: number; className?: string }) {
  if (src) return <img src={src} alt="" className={cn('shrink-0 rounded-full object-cover', className)} style={{ width: size, height: size }} />
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold', className)}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: color ? `color-mix(in srgb, ${color} 16%, transparent)` : 'var(--surface-3)',
        color: color ?? 'var(--muted-foreground)'
      }}
    >
      {initials(name)}
    </span>
  )
}

// ---------- Squelettes & divers ----------
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-surface-3/70', className)} />
}

export function Separator({ className }: { className?: string }) {
  return <div className={cn('h-px bg-border', className)} />
}

export function Card({ className, children, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('rounded-xl border border-border bg-surface shadow-sm', className)} {...props}>
      {children}
    </div>
  )
}

export function CardHeader({ title, action, className, icon }: { title: ReactNode; action?: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <div className={cn('flex h-11 items-center justify-between gap-3 border-b border-border px-4', className)}>
      <div className="flex min-w-0 items-center gap-2 text-[0.8125rem] font-semibold [&_svg]:size-4 [&_svg]:text-muted-foreground">
        {icon}
        <span className="truncate">{title}</span>
      </div>
      {action}
    </div>
  )
}

export function ColorSwatches({ value, onChange, colors }: { value: string | null; onChange: (c: string) => void; colors: readonly string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Couleur ${c}`}
          onClick={() => onChange(c)}
          className={cn(
            'size-6 rounded-full ring-offset-2 ring-offset-surface transition-transform hover:scale-110',
            value?.toLowerCase() === c.toLowerCase() && 'ring-2 ring-foreground/70'
          )}
          style={{ background: c }}
        />
      ))}
    </div>
  )
}
