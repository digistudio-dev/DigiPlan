import { useEffect, useState } from 'react'
import { Command } from 'cmdk'
import { Dialog as D } from 'radix-ui'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { BarChart3, Calendar, CalendarPlus, CreditCard, LayoutDashboard, Search, Settings, Tag, UserPlus, Users, UsersRound } from 'lucide-react'
import { formatDateTime } from '@shared/format'
import { formatMoney } from '@shared/domain/money'
import { formatDuration } from '@shared/format'
import { api } from '@/lib/api'
import { useApp } from '@/hooks/useApp'
import { useUi, useUiActions, type Page } from '@/stores/ui'
import { t } from '@/i18n'
import { StatusBadge } from '@/components/common'
import { Avatar, Kbd } from '@/components/ui/primitives'

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return v
}

const itemCls =
  'flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-[0.8125rem] outline-none select-none data-[selected=true]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-muted-foreground'
const groupCls =
  '[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[0.6875rem] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-subtle-foreground [&_[cmdk-group-heading]]:uppercase'

export function CommandPalette() {
  const open = useUi((s) => s.commandOpen)
  const ui = useUiActions()
  const { terms, currency } = useApp()
  const [query, setQuery] = useState('')
  const q = useDebounced(query.trim(), 160)
  const { data } = useQuery({
    queryKey: ['search', q],
    queryFn: () => api('search.global', { query: q }),
    enabled: open && q.length > 0,
    placeholderData: keepPreviousData
  })

  const close = () => {
    ui.setCommandOpen(false)
    setQuery('')
  }
  const run = (fn: () => void) => {
    close()
    fn()
  }

  const pages: Array<{ page: Page; label: string; icon: typeof Calendar }> = [
    { page: 'dashboard', label: t.nav.dashboard, icon: LayoutDashboard },
    { page: 'calendar', label: t.nav.calendar, icon: Calendar },
    { page: 'clients', label: terms.client.plural, icon: Users },
    { page: 'services', label: terms.service.plural, icon: Tag },
    { page: 'staff', label: terms.staffNavLabel, icon: UsersRound },
    { page: 'payments', label: t.nav.payments, icon: CreditCard },
    { page: 'reports', label: t.nav.reports, icon: BarChart3 },
    { page: 'settings', label: t.nav.settings, icon: Settings }
  ]
  const hasResults = data && (data.clients.length || data.appointments.length || data.services.length || data.staff.length)

  return (
    <D.Root open={open} onOpenChange={(o) => (o ? ui.setCommandOpen(true) : close())}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-fade-in" />
        <D.Content className="fixed top-[14vh] left-1/2 z-50 w-[620px] max-w-[calc(100vw-48px)] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-surface shadow-lg focus:outline-none data-[state=open]:animate-fade-in">
          <D.Title className="sr-only">{t.shortcuts.search}</D.Title>
          <D.Description className="sr-only">{t.topbar.search}</D.Description>
          <Command shouldFilter={false} loop>
            <div className="flex items-center gap-2.5 border-b border-border px-4">
              <Search className="size-4 text-subtle-foreground" />
              <Command.Input
                autoFocus
                value={query}
                onValueChange={setQuery}
                placeholder={t.topbar.search}
                className="h-12 flex-1 bg-transparent text-[0.9rem] outline-none placeholder:text-subtle-foreground"
              />
              <Kbd>Échap</Kbd>
            </div>
            <Command.List className="max-h-[420px] overflow-y-auto p-1.5">
              {q && !hasResults ? <Command.Empty className="py-10 text-center text-[0.8125rem] text-muted-foreground">Aucun résultat pour « {q} »</Command.Empty> : null}

              {!q ? (
                <>
                  <Command.Group heading="Actions rapides" className={groupCls}>
                    <Command.Item className={itemCls} onSelect={() => run(() => ui.openAppointmentForm())}>
                      <CalendarPlus /> {t.shortcuts.newAppointment}
                      <span className="ml-auto flex gap-0.5"><Kbd>Ctrl</Kbd><Kbd>N</Kbd></span>
                    </Command.Item>
                    <Command.Item className={itemCls} onSelect={() => run(() => ui.openClientForm())}>
                      <UserPlus /> {terms.client.newLabel}
                      <span className="ml-auto flex gap-0.5"><Kbd>Ctrl</Kbd><Kbd>Maj</Kbd><Kbd>C</Kbd></span>
                    </Command.Item>
                    <Command.Item className={itemCls} onSelect={() => run(() => ui.openPayment())}>
                      <CreditCard /> {t.shortcuts.newPayment}
                      <span className="ml-auto flex gap-0.5"><Kbd>Ctrl</Kbd><Kbd>P</Kbd></span>
                    </Command.Item>
                  </Command.Group>
                  <Command.Group heading="Aller à" className={groupCls}>
                    {pages.map((p) => (
                      <Command.Item key={p.page} className={itemCls} onSelect={() => run(() => ui.navigate(p.page))}>
                        <p.icon /> {p.label}
                      </Command.Item>
                    ))}
                  </Command.Group>
                </>
              ) : null}

              {data?.clients.length ? (
                <Command.Group heading={terms.client.plural} className={groupCls}>
                  {data.clients.map((c) => (
                    <Command.Item key={c.id} value={`c-${c.id}`} className={itemCls} onSelect={() => run(() => ui.openClient(c.id))}>
                      <Avatar name={c.name} size={22} />
                      <span className="truncate font-medium">{c.name}</span>
                      <span className="tabular ml-auto text-xs text-muted-foreground">{c.phone}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}
              {data?.appointments.length ? (
                <Command.Group heading="Rendez-vous" className={groupCls}>
                  {data.appointments.map((a) => (
                    <Command.Item key={a.id} value={`a-${a.id}`} className={itemCls} onSelect={() => run(() => ui.openAppointment(a.id))}>
                      <Calendar />
                      <span className="truncate">
                        <span className="font-medium">{a.clientName}</span>
                        <span className="text-muted-foreground"> · {a.serviceLabel}</span>
                      </span>
                      <span className="ml-auto flex shrink-0 items-center gap-2">
                        <span className="tabular text-xs text-muted-foreground">{formatDateTime(a.startAt)}</span>
                        <StatusBadge status={a.status} />
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}
              {data?.services.length ? (
                <Command.Group heading={terms.service.plural} className={groupCls}>
                  {data.services.map((s) => (
                    <Command.Item key={s.id} value={`s-${s.id}`} className={itemCls} onSelect={() => run(() => ui.navigate('services'))}>
                      <Tag /> <span className="truncate">{s.name}</span>
                      <span className="tabular ml-auto text-xs text-muted-foreground">
                        {formatDuration(s.durationMin)} · {formatMoney(s.price, currency)}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}
              {data?.staff.length ? (
                <Command.Group heading={terms.staffNavLabel} className={groupCls}>
                  {data.staff.map((s) => (
                    <Command.Item key={s.id} value={`t-${s.id}`} className={itemCls} onSelect={() => run(() => ui.navigate('staff'))}>
                      <Avatar name={s.name} color={s.color} size={22} />
                      <span className="truncate">{s.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{s.role}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}
            </Command.List>
            <div className="flex items-center gap-3 border-t border-border bg-surface-2/50 px-4 py-2 text-[0.6875rem] text-subtle-foreground">
              <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> naviguer</span>
              <span className="flex items-center gap-1"><Kbd>Entrée</Kbd> ouvrir</span>
            </div>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}
