// Tableau de bord adapté à l'activité : indicateurs utiles et actions immédiates.

import type { ComponentType, ReactNode } from 'react'
import {
  Activity,
  AlertCircle,
  ArmchairIcon,
  Ban,
  CalendarCheck,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ChevronRight,
  Clock,
  Footprints,
  Plus,
  TrendingUp,
  UserPlus,
  UserX,
  Wallet,
  Trophy
} from 'lucide-react'
import type { AppointmentDto, DashboardData } from '@shared/types'
import type { KpiWidgetId, PanelWidgetId } from '@shared/categories'
import { formatDateFull, formatTime, formatTimeRange } from '@shared/format'
import { formatMoney } from '@shared/domain/money'
import { nextStatusAction, STATUS_COLORS } from '@shared/status'
import { useApp } from '@/hooks/useApp'
import { useDashboard } from '@/lib/queries'
import { useUi } from '@/stores/ui'
import { capitalize, cn, percent } from '@/lib/utils'
import { t } from '@/i18n'
import { Button } from '@/components/ui/button'
import { Avatar, Card, CardHeader, Skeleton } from '@/components/ui/primitives'
import { EmptyState, Money, StatusBadge } from '@/components/common'
import { RevenueArea } from '@/components/charts'
import { useAppointmentActions } from '../appointments/useAppointmentActions'

interface KpiDef {
  label: string
  icon: ComponentType<{ className?: string }>
  value: (d: DashboardData, currency: string) => ReactNode
  hint?: (d: DashboardData, currency: string) => ReactNode
  tone?: string
}

const KPIS: Record<KpiWidgetId, KpiDef> = {
  todayCount: {
    label: t.dashboard.kpi.todayCount,
    icon: CalendarCheck,
    value: (d) => d.kpis.todayCount,
    hint: (d) => `${d.kpis.todayCompleted} terminé${d.kpis.todayCompleted > 1 ? 's' : ''} · ${d.kpis.todayUpcoming} à venir`
  },
  todayRevenue: {
    label: t.dashboard.kpi.todayRevenue,
    icon: Wallet,
    value: (d, c) => formatMoney(d.kpis.todayRevenue, c),
    hint: (d, c) => `${formatMoney(d.kpis.weekRevenue, c)} cette semaine`
  },
  completed: { label: t.dashboard.kpi.completed, icon: CheckCircle2, value: (d) => d.kpis.todayCompleted, hint: (d) => `sur ${d.kpis.todayCount} aujourd’hui` },
  upcoming: { label: t.dashboard.kpi.upcoming, icon: Clock, value: (d) => d.kpis.todayUpcoming, hint: (d) => `${d.kpis.todayCompleted} déjà terminé${d.kpis.todayCompleted > 1 ? 's' : ''}` },
  cancellations: {
    label: t.dashboard.kpi.cancellations,
    icon: Ban,
    value: (d) => d.kpis.todayCancelled,
    hint: (d) => `${d.kpis.todayNoShow} absence${d.kpis.todayNoShow > 1 ? 's' : ''} aujourd’hui`
  },
  noShowRate: { label: t.dashboard.kpi.noShowRate, icon: UserX, value: (d) => percent(d.kpis.noShowRate30d), hint: (d) => `${d.kpis.todayNoShow} aujourd’hui` },
  outstanding: {
    label: t.dashboard.kpi.outstanding,
    icon: AlertCircle,
    value: (d, c) => formatMoney(d.kpis.outstandingBalance, c),
    hint: (d) => `${d.kpis.outstandingCount} rendez-vous concerné${d.kpis.outstandingCount > 1 ? 's' : ''}`
  },
  waiting: { label: t.dashboard.kpi.waiting, icon: ArmchairIcon, value: (d) => d.kpis.waitingCount, hint: () => 'Clients arrivés, pas encore pris en charge' },
  weekRevenue: {
    label: t.dashboard.kpi.weekRevenue,
    icon: TrendingUp,
    value: (d, c) => formatMoney(d.kpis.weekRevenue, c),
    hint: (d, c) => `${formatMoney(d.kpis.monthRevenue, c)} ce mois`
  },
  newClients: { label: t.dashboard.kpi.newClients, icon: UserPlus, value: (d) => d.kpis.newClients30d, hint: () => 'Fiches créées ces 30 derniers jours' }
}

export function DashboardPage() {
  const { business, category, terms, currency } = useApp()
  const { data, isLoading } = useDashboard()
  const ui = useUi()
  const hour = new Date().getHours()

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1280px] px-6 pt-6 pb-10">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-[1.4rem] font-semibold tracking-tight">
              {hour < 18 ? t.dashboard.greetingMorning : t.dashboard.greetingEvening}
              {business?.ownerName ? `, ${greetingName(business.ownerName)}` : ''}
            </h1>
            <p className="mt-1 text-[0.8125rem] text-muted-foreground">
              <span>{capitalize(formatDateFull(Date.now()))}</span>
              {data ? ` · ${t.dashboard.appointmentsCount(data.kpis.todayCount)} aujourd’hui` : ''}
            </p>
          </div>
          <div className="flex gap-2">
            {category.features.walkIn ? (
              <Button onClick={() => ui.openAppointmentForm({ walkIn: true, startAt: Date.now() })}>
                <Footprints /> {t.dashboard.walkIn}
              </Button>
            ) : (
              <Button onClick={() => ui.openClientForm()}>
                <UserPlus /> {terms.client.newLabel}
              </Button>
            )}
            <Button variant="primary" onClick={() => ui.openAppointmentForm()}>
              <CalendarPlus /> {t.dashboard.newAppointment}
            </Button>
          </div>
        </div>

        {/* Indicateurs */}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {category.kpis.map((id) => {
            const k = KPIS[id]
            return (
              <Card key={id} className="px-4 py-3.5">
                <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                  {k.label}
                  <k.icon className="size-4 text-subtle-foreground" />
                </div>
                {data ? (
                  <>
                    <div className="tabular mt-2 text-[1.45rem] leading-none font-semibold tracking-tight">{k.value(data, currency)}</div>
                    <div className="mt-1.5 truncate text-xs text-subtle-foreground">{k.hint?.(data, currency)}</div>
                  </>
                ) : (
                  <>
                    <Skeleton className="mt-2 h-6 w-20" />
                    <Skeleton className="mt-2 h-3 w-28" />
                  </>
                )}
              </Card>
            )
          })}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Timeline data={data} loading={isLoading} />
          <div className="space-y-4">
            <NextAppointment appointment={data?.nextAppointment ?? null} now={data?.now ?? Date.now()} loading={isLoading} />
            {data ? category.panels.map((p) => <Panel key={p} id={p} data={data} currency={currency} />) : <Skeleton className="h-40" />}
          </div>
        </div>
      </div>
    </div>
  )
}

function greetingName(full: string): string {
  const parts = full.trim().split(/\s+/)
  const title = /^(dr|pr|me|m|mme|mlle)\.?$/i
  if (parts.length > 1 && title.test(parts[0])) return `${parts[0]} ${parts[parts.length - 1]}`
  return parts[0]
}

function Timeline({ data, loading }: { data?: DashboardData; loading: boolean }) {
  const ui = useUi()
  const actions = useAppointmentActions()
  const items = data?.todayAppointments ?? []
  const now = data?.now ?? Date.now()
  const nowIndex = items.findIndex((a) => a.endAt > now)

  return (
    <Card className="min-h-[360px]">
      <CardHeader
        icon={<CalendarDays />}
        title={t.dashboard.timeline}
        action={
          <Button size="sm" variant="ghost" onClick={() => ui.focusCalendarOn(Date.now())}>
            {t.nav.calendar} <ChevronRight />
          </Button>
        }
      />
      {loading ? (
        <div className="space-y-2 p-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<CalendarDays />}
          title={t.dashboard.timelineEmpty}
          description="Les rendez-vous du jour apparaîtront ici, dans l’ordre chronologique."
          action={
            <Button variant="primary" onClick={() => ui.openAppointmentForm()}>
              <Plus /> {t.dashboard.addAppointment}
            </Button>
          }
        />
      ) : (
        <ol className="p-2">
          {items.map((a, i) => {
            const next = nextStatusAction(a.status)
            const past = a.endAt <= now
            return (
              <li key={a.id}>
                {i === nowIndex && nowIndex > 0 ? (
                  <div className="flex items-center gap-2 px-3 py-1" aria-label="Maintenant">
                    <span className="tabular text-[0.6875rem] font-semibold text-danger">{formatTime(now)}</span>
                    <span className="h-px flex-1 bg-danger/50" />
                  </div>
                ) : null}
                <div
                  className={cn(
                    'group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-2',
                    (a.status === 'cancelled' || a.status === 'no_show') && 'opacity-55'
                  )}
                >
                  <button type="button" onClick={() => ui.openAppointment(a.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <div className="tabular w-[46px] shrink-0 text-right">
                      <div className={cn('text-[0.8125rem] font-semibold', past && 'text-muted-foreground')}>{formatTime(a.startAt)}</div>
                      <div className="text-[0.6875rem] text-subtle-foreground">{formatTime(a.endAt)}</div>
                    </div>
                    <span className="h-9 w-[3px] shrink-0 rounded-full" style={{ background: STATUS_COLORS[a.status] }} />
                    <div className="min-w-0 flex-1">
                      <div className={cn('truncate text-[0.8125rem] font-medium', a.status === 'cancelled' && 'line-through')}>{a.clientName}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {a.services.map((s) => s.name).join(' + ')}
                        {a.staffName ? ` · ${a.staffName}` : ''}
                      </div>
                    </div>
                  </button>
                  {a.balance > 0 && a.status !== 'cancelled' ? (
                    <span className="tabular hidden text-xs text-warning sm:inline">
                      Reste <Money cents={a.balance} />
                    </span>
                  ) : null}
                  <StatusBadge status={a.status} />
                  {next ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="w-[118px] opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                      onClick={() => actions.setStatus(a.id, next.to)}
                    >
                      {next.label}
                    </Button>
                  ) : a.status === 'completed' && a.balance > 0 ? (
                    <Button size="sm" variant="soft" className="w-[118px]" onClick={() => ui.openPayment({ appointmentId: a.id })}>
                      <Wallet /> {t.appointment.actions.collect}
                    </Button>
                  ) : (
                    <span className="w-[118px]" />
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </Card>
  )
}

function NextAppointment({ appointment: a, now, loading }: { appointment: AppointmentDto | null; now: number; loading: boolean }) {
  const ui = useUi()
  const actions = useAppointmentActions()
  const { currency } = useApp()
  if (loading) return <Skeleton className="h-[188px] rounded-xl" />
  if (!a) {
    return (
      <Card>
        <CardHeader icon={<Clock />} title={t.dashboard.nextAppointment} />
        <EmptyState compact title={t.dashboard.noNextAppointment} description={t.dashboard.noNextAppointmentHint} />
      </Card>
    )
  }
  const minutes = Math.round((a.startAt - now) / 60000)
  const next = nextStatusAction(a.status)
  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<Clock />}
        title={t.dashboard.nextAppointment}
        action={<span className="text-xs font-medium text-primary">{minutes < 24 * 60 ? t.dashboard.inMinutes(minutes) : capitalize(formatDateFull(a.startAt))}</span>}
      />
      <button type="button" onClick={() => ui.openAppointment(a.id)} className="block w-full px-4 pt-3.5 text-left">
        <div className="flex items-center gap-3">
          <Avatar name={a.clientName} size={38} color={a.staffColor} />
          <div className="min-w-0">
            <div className="truncate text-[0.95rem] font-semibold">{a.clientName}</div>
            <div className="truncate text-xs text-muted-foreground">{a.services.map((s) => s.name).join(' + ')}</div>
          </div>
        </div>
        <dl className="mt-3.5 grid grid-cols-2 gap-y-2 text-xs">
          <dt className="text-subtle-foreground">{t.common.time}</dt>
          <dd className="tabular text-right font-medium">{formatTimeRange(a.startAt, a.endAt)}</dd>
          <dt className="text-subtle-foreground">Avec</dt>
          <dd className="truncate text-right font-medium">{a.staffName ?? '—'}</dd>
          <dt className="text-subtle-foreground">{t.common.total}</dt>
          <dd className="text-right font-medium">
            <Money cents={a.total} currency={currency} />
          </dd>
        </dl>
      </button>
      <div className="mt-3.5 flex items-center justify-between border-t border-border px-4 py-2.5">
        <StatusBadge status={a.status} />
        {next ? (
          <Button size="sm" variant="primary" onClick={() => actions.setStatus(a.id, next.to)}>
            {next.label}
          </Button>
        ) : null}
      </div>
    </Card>
  )
}

function Panel({ id, data, currency }: { id: PanelWidgetId; data: DashboardData; currency: string }) {
  const ui = useUi()
  const { terms } = useApp()
  if (id === 'revenueTrend') {
    const total = data.revenueTrend.reduce((s, d) => s + d.amount, 0)
    return (
      <Card>
        <CardHeader icon={<Activity />} title={t.dashboard.revenueTrend} />
        <div className="px-4 pt-3 pb-2">
          <div className="tabular text-lg font-semibold tracking-tight">{formatMoney(total, currency)}</div>
          {total > 0 ? <RevenueArea data={data.revenueTrend} currency={currency} height={110} /> : <div className="py-6 text-center text-xs text-subtle-foreground">{t.dashboard.noData}</div>}
        </div>
      </Card>
    )
  }
  if (id === 'outstanding') {
    return (
      <Card>
        <CardHeader icon={<Wallet />} title={t.dashboard.outstandingPanel} action={<Button size="sm" variant="ghost" onClick={() => ui.navigate('reports')}>{t.common.seeAll}</Button>} />
        <div className="px-4 py-3.5">
          <div className={cn('tabular text-lg font-semibold tracking-tight', data.kpis.outstandingBalance > 0 && 'text-warning')}>{formatMoney(data.kpis.outstandingBalance, currency)}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {data.kpis.outstandingCount ? `${data.kpis.outstandingCount} rendez-vous réalisés non soldés` : 'Tous les rendez-vous réalisés sont réglés.'}
          </div>
        </div>
      </Card>
    )
  }
  const isService = id === 'topService'
  const top = isService ? data.topService : data.topStaff
  return (
    <Card>
      <CardHeader icon={<Trophy />} title={isService ? `Top ${terms.service.singular.toLowerCase()} (30 j)` : t.dashboard.topStaff} />
      <div className="flex items-center gap-3 px-4 py-3.5">
        {top ? (
          <>
            {!isService && data.topStaff ? <Avatar name={data.topStaff.name} color={data.topStaff.color} size={32} /> : null}
            <div className="min-w-0">
              <div className="truncate text-[0.875rem] font-semibold">{top.name}</div>
              <div className="text-xs text-muted-foreground">
                {top.count} {isService ? 'réservation' : 'rendez-vous terminé'}
                {top.count > 1 ? 's' : ''}
              </div>
            </div>
          </>
        ) : (
          <div className="text-xs text-subtle-foreground">{t.dashboard.noData}</div>
        )}
      </div>
    </Card>
  )
}
