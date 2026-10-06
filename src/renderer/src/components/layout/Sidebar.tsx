import type { ComponentType } from 'react'
import { BarChart3, Calendar, CreditCard, LayoutDashboard, MessageCircle, Settings, Sparkles, Tag, Users, UsersRound } from 'lucide-react'
import { useApp } from '@/hooks/useApp'
import { useUi, type Page } from '@/stores/ui'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { ProBadge } from '../ui/primitives'

interface NavItem {
  page: Page
  label: string
  icon: ComponentType<{ className?: string }>
  pro?: boolean
}

export function Sidebar() {
  const { terms, isPro } = useApp()
  const page = useUi((s) => s.page)
  const navigate = useUi((s) => s.navigate)
  const openUpgrade = useUi((s) => s.openUpgrade)

  const main: NavItem[] = [
    { page: 'dashboard', label: t.nav.dashboard, icon: LayoutDashboard },
    { page: 'calendar', label: t.nav.calendar, icon: Calendar },
    { page: 'clients', label: terms.client.plural, icon: Users },
    { page: 'services', label: terms.service.plural, icon: Tag },
    { page: 'staff', label: terms.staffNavLabel, icon: UsersRound }
  ]
  const business: NavItem[] = [
    { page: 'payments', label: t.nav.payments, icon: CreditCard },
    { page: 'reports', label: t.nav.reports, icon: BarChart3 },
    { page: 'whatsapp', label: t.nav.whatsapp, icon: MessageCircle, pro: true }
  ]

  const renderItem = (item: NavItem) => {
    const active = page === item.page
    const Icon = item.icon
    return (
      <button
        key={item.page}
        type="button"
        onClick={() => navigate(item.page)}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'group flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[0.8125rem] font-medium transition-colors duration-150',
          active ? 'bg-surface text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:bg-surface-3/60 hover:text-foreground'
        )}
      >
        <Icon className={cn('size-[16px] shrink-0', active ? 'text-primary' : 'text-subtle-foreground group-hover:text-muted-foreground')} />
        <span className="truncate">{item.label}</span>
        {item.pro && !isPro ? <ProBadge className="ml-auto" /> : null}
      </button>
    )
  }

  return (
    <nav aria-label="Navigation principale" className="flex w-[212px] shrink-0 flex-col px-2.5 pt-2 pb-3">
      <div className="space-y-0.5">{main.map(renderItem)}</div>
      <div className="mt-5 mb-1.5 px-2.5 text-[0.6875rem] font-medium tracking-wide text-subtle-foreground uppercase">Gestion</div>
      <div className="space-y-0.5">{business.map(renderItem)}</div>
      <div className="mt-auto space-y-2">
        {renderItem({ page: 'settings', label: t.nav.settings, icon: Settings })}
        {isPro ? (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-2 shadow-sm">
            <span className="flex size-6 items-center justify-center rounded-md bg-gradient-to-br from-[#0e6be6] to-[#18a5f2] text-white">
              <Sparkles className="size-3.5" />
            </span>
            <div className="min-w-0 leading-tight">
              <div className="text-xs font-semibold">{t.app.pro}</div>
              <div className="text-[0.6875rem] text-subtle-foreground">{t.license.activated}</div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => openUpgrade('whatsappReminders')}
            className="group w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-left shadow-sm transition-colors hover:border-primary/40"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">{t.app.free}</span>
              <span className="text-[0.6875rem] font-medium text-primary group-hover:underline">Passer à Pro</span>
            </div>
            <div className="mt-0.5 text-[0.6875rem] text-subtle-foreground">Rappels WhatsApp, équipe illimitée…</div>
          </button>
        )}
        <div className="px-2.5 text-[0.6875rem] text-subtle-foreground">{t.app.vendor}</div>
      </div>
    </nav>
  )
}
