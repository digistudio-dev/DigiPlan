import { Bell, Check, Info, KeyRound, Monitor, Moon, Plus, Search, Settings, Sun, AlertCircle, AlertTriangle, CalendarClock, X } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import type { NotificationItem, ThemePreference } from '@shared/types'
import { formatDateFull, formatRelativeDay, formatTime } from '@shared/format'
import { useApp } from '@/hooks/useApp'
import { useNotifications, queryClient } from '@/lib/queries'
import { api } from '@/lib/api'
import { useUi } from '@/stores/ui'
import { capitalize, cn, initials } from '@/lib/utils'
import { t } from '@/i18n'
import { Button } from '../ui/button'
import { Kbd, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, Popover, PopoverContent, PopoverTrigger, Tooltip } from '../ui/primitives'
import { LogoMark, Wordmark } from '../common'

export function Topbar() {
  const { business, settings } = useApp()
  const setCommandOpen = useUi((s) => s.setCommandOpen)
  const openAppointmentForm = useUi((s) => s.openAppointmentForm)
  const navigate = useUi((s) => s.navigate)

  const theme = useMutation({
    mutationFn: (value: ThemePreference) => api('settings.update', { theme: value }),
    onSuccess: (s) => queryClient.setQueryData(['bootstrap'], (old: unknown) => (old ? { ...(old as object), settings: s } : old))
  })

  const themeOptions: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
    { value: 'light', label: t.topbar.themeLight, icon: Sun },
    { value: 'dark', label: t.topbar.themeDark, icon: Moon },
    { value: 'system', label: t.topbar.themeSystem, icon: Monitor }
  ]

  return (
    <header className="drag flex h-[var(--titlebar-h)] shrink-0 items-center gap-3 pr-[150px] pl-4">
      <div className="flex w-[188px] shrink-0 items-center gap-2">
        <LogoMark size={22} />
        <Wordmark className="text-[0.95rem]" />
      </div>

      <button
        type="button"
        onClick={() => setCommandOpen(true)}
        className="no-drag flex h-7 w-full max-w-[380px] items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-[0.8125rem] text-subtle-foreground shadow-sm transition-colors hover:border-border-strong hover:text-muted-foreground"
      >
        <Search className="size-3.5" />
        <span className="truncate">{t.topbar.search}</span>
        <span className="ml-auto flex gap-0.5">
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      <div className="ml-auto flex items-center gap-1.5">
        <div className="no-drag mr-1 hidden items-center gap-1.5 text-xs text-muted-foreground lg:flex">
          <CalendarClock className="size-3.5" />
          <span>{capitalize(formatDateFull(Date.now()))}</span>
        </div>
        <Button size="sm" variant="primary" className="no-drag" onClick={() => openAppointmentForm()}>
          <Plus /> Rendez-vous
        </Button>
        <NotificationsButton />
        <Menu>
          <MenuTrigger asChild>
            <button
              type="button"
              className="no-drag flex h-7 max-w-[200px] items-center gap-2 rounded-md px-1.5 text-[0.8125rem] font-medium transition-colors hover:bg-surface-3/60"
              aria-label="Menu de l'établissement"
            >
              {business?.logoDataUrl ? (
                <img src={business.logoDataUrl} alt="" className="size-5 rounded object-contain" />
              ) : (
                <span className="flex size-5 items-center justify-center rounded bg-primary-soft text-[0.6rem] font-bold text-primary-soft-foreground">
                  {initials(business?.name ?? 'D')}
                </span>
              )}
              <span className="truncate">{business?.name}</span>
            </button>
          </MenuTrigger>
          <MenuContent className="w-60">
            <MenuLabel>{business?.name}</MenuLabel>
            <MenuItem onSelect={() => navigate('settings', 'business')}>
              <Settings /> {t.topbar.settings}
            </MenuItem>
            <MenuItem onSelect={() => navigate('settings', 'license')}>
              <KeyRound /> {t.license.title}
            </MenuItem>
            <MenuSeparator />
            <MenuLabel>{t.topbar.theme}</MenuLabel>
            {themeOptions.map((o) => (
              <MenuItem key={o.value} onSelect={() => theme.mutate(o.value)}>
                <o.icon /> {o.label}
                {settings.theme === o.value ? <Check className="ml-auto !text-primary" /> : null}
              </MenuItem>
            ))}
            <MenuSeparator />
            <MenuItem onSelect={() => navigate('settings', 'about')}>
              <Info /> {t.topbar.about}
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
    </header>
  )
}

const SEVERITY_ICON = { info: CalendarClock, warning: AlertTriangle, error: AlertCircle }
const SEVERITY_COLOR = { info: 'text-primary bg-primary-soft', warning: 'text-warning bg-warning-soft', error: 'text-danger bg-danger-soft' }

function NotificationsButton() {
  const { data = [] } = useNotifications()
  const openAppointment = useUi((s) => s.openAppointment)
  const navigate = useUi((s) => s.navigate)
  const urgent = data.filter((n) => n.severity !== 'info').length

  const dismiss = (id: string) => {
    queryClient.setQueryData<NotificationItem[]>(['notifications'], (old) => old?.filter((n) => n.id !== id))
    void api('notifications.dismiss', { id })
  }

  const act = (n: NotificationItem) => {
    if (n.appointmentId) openAppointment(n.appointmentId)
    else if (n.kind === 'unpaid') navigate('reports')
    else if (n.kind === 'backup_error') navigate('settings', 'backups')
    else if (n.kind === 'google_error') navigate('settings', 'google')
    else if (n.kind === 'whatsapp_disconnected') navigate('whatsapp')
  }

  return (
    <Popover>
      <Tooltip content={t.topbar.notifications} side="bottom">
        <PopoverTrigger asChild>
          <button
            type="button"
            className="no-drag relative flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-3/60 hover:text-foreground"
            aria-label={`${t.topbar.notifications}${data.length ? ` (${data.length})` : ''}`}
          >
            <Bell className="size-4" />
            {data.length ? (
              <span
                className={cn(
                  'absolute top-0.5 right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-1 text-[0.6rem] font-bold text-white',
                  urgent ? 'bg-danger' : 'bg-primary'
                )}
              >
                {data.length}
              </span>
            ) : null}
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex h-10 items-center border-b border-border px-3.5 text-[0.8125rem] font-semibold">{t.topbar.notifications}</div>
        {data.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <div className="mx-auto mb-2 flex size-9 items-center justify-center rounded-full bg-success-soft text-success">
              <Check className="size-4" />
            </div>
            <div className="text-[0.8125rem] font-medium">{t.topbar.noNotifications}</div>
            <div className="text-xs text-muted-foreground">{t.topbar.noNotificationsHint}</div>
          </div>
        ) : (
          <ul className="max-h-[420px] overflow-y-auto p-1">
            {data.map((n) => {
              const Icon = SEVERITY_ICON[n.severity]
              return (
                <li key={n.id} className="group flex items-start gap-2.5 rounded-md px-2.5 py-2 hover:bg-surface-2">
                  <span className={cn('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md', SEVERITY_COLOR[n.severity])}>
                    <Icon className="size-3.5" />
                  </span>
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => act(n)}>
                    <div className="truncate text-[0.8125rem] font-medium">{n.title}</div>
                    <div className="line-clamp-2 text-xs text-muted-foreground">{n.description}</div>
                    <div className="mt-0.5 text-[0.6875rem] text-subtle-foreground">
                      {formatRelativeDay(n.at)} · {formatTime(n.at)}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => dismiss(n.id)}
                    aria-label={t.topbar.dismiss}
                    className="rounded p-0.5 text-subtle-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus:opacity-100"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
