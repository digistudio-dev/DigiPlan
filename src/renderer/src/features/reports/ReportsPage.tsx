// Rapports : basiques (Free) et avancés (Pro), dépenses et résultat net.

import { useMemo, useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { endOfMonth, endOfYear, startOfISOWeek, startOfMonth, startOfYear, subMonths } from 'date-fns'
import { ArrowDownRight, ArrowUpRight, Download, Lock, Receipt, Sparkles, TrendingUp, Users, Wallet, Tag } from 'lucide-react'
import { toast } from 'sonner'
import { formatDateShort, toIsoDate, fromIsoDate } from '@shared/format'
import { formatMoney } from '@shared/domain/money'
import { PAYMENT_METHOD_LABELS } from '@shared/status'
import { api, errorMessage } from '@/lib/api'
import { useStaffList } from '@/lib/queries'
import { useApp, useProGate } from '@/hooks/useApp'
import { useUi } from '@/stores/ui'
import { cn, percent } from '@/lib/utils'
import { t } from '@/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, Card, CardHeader, ProBadge, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives'
import { EmptyState, Money, PageHeader, Select } from '@/components/common'
import { RankedBars, RevenueBars } from '@/components/charts'
import { ExpensesPanel } from './ExpensesPanel'

type Preset = 'today' | 'week' | 'month' | 'lastMonth' | 'year' | 'custom'

function presetRange(p: Preset): { from: string; to: string } {
  const now = Date.now()
  const today = toIsoDate(now)
  switch (p) {
    case 'today':
      return { from: today, to: today }
    case 'week':
      return { from: toIsoDate(startOfISOWeek(now).getTime()), to: today }
    case 'month':
      return { from: toIsoDate(startOfMonth(now).getTime()), to: toIsoDate(endOfMonth(now).getTime()) }
    case 'lastMonth': {
      const d = subMonths(now, 1)
      return { from: toIsoDate(startOfMonth(d).getTime()), to: toIsoDate(endOfMonth(d).getTime()) }
    }
    case 'year':
      return { from: toIsoDate(startOfYear(now).getTime()), to: toIsoDate(endOfYear(now).getTime()) }
    default:
      return { from: today, to: today }
  }
}

export default function ReportsPage() {
  const { currency, isPro, terms } = useApp()
  const gate = useProGate()
  const ui = useUi()
  const [preset, setPreset] = useState<Preset>('month')
  const [custom, setCustom] = useState(presetRange('month'))
  const [staffId, setStaffId] = useState<string>('')
  const { data: staff = [] } = useStaffList(true)
  const range = useMemo(() => (preset === 'custom' ? custom : presetRange(preset)), [preset, custom])

  const { data: r, isLoading } = useQuery({
    queryKey: ['reports', range.from, range.to, staffId],
    queryFn: () => api('reports.get', { from: range.from, to: range.to, staffId: staffId || null }),
    placeholderData: keepPreviousData
  })

  const changePreset = (p: Preset) => {
    if ((p === 'year' || p === 'custom' || p === 'lastMonth') && !isPro) return gate('advancedReports')
    setPreset(p)
  }

  const exportCsv = async () => {
    try {
      const res = await api('export.csv', { kind: 'report', from: range.from, to: range.to })
      if (res.saved) toast.success('Rapport exporté', { description: res.path })
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const delta = r && r.previousRevenue > 0 ? (r.revenue - r.previousRevenue) / r.previousRevenue : null

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={t.reports.title}
        subtitle={`${formatDateShort(fromIsoDate(range.from))} – ${formatDateShort(fromIsoDate(range.to))}`}
        actions={
          <Button onClick={exportCsv}>
            <Download /> {t.common.exportCsv}
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Select
            className="w-[190px]"
            value={preset}
            onChange={(v) => changePreset(v as Preset)}
            options={(Object.keys(t.reports.presets) as Preset[]).map((p) => ({
              value: p,
              label: (
                <span className="flex items-center gap-2">
                  {t.reports.presets[p]} {!isPro && (p === 'year' || p === 'custom' || p === 'lastMonth') ? <ProBadge /> : null}
                </span>
              )
            }))}
          />
          {preset === 'custom' ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Input type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="w-[150px]" />
              {t.common.to}
              <Input type="date" value={custom.to} min={custom.from} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="w-[150px]" />
            </div>
          ) : null}
          {staff.length > 1 ? (
            <Select
              className="w-[200px]"
              value={staffId || '__all'}
              onChange={(v) => (v === '__all' ? setStaffId('') : gate('advancedReports', () => setStaffId(v)))}
              options={[{ value: '__all', label: t.calendar.allStaff }, ...staff.map((s) => ({ value: s.id, label: s.name }))]}
            />
          ) : null}
        </div>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Tabs defaultValue="overview" className="mx-auto max-w-[1280px] px-6 pt-4 pb-10">
          <TabsList className="mb-5">
            <TabsTrigger value="overview">Vue d’ensemble</TabsTrigger>
            <TabsTrigger value="expenses" onClick={(e) => !isPro && (e.preventDefault(), gate('expenses'))}>
              <span className="flex items-center gap-1.5">
                {t.expenses.title} {!isPro ? <ProBadge /> : null}
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {isLoading || !r ? (
              <div className="grid grid-cols-4 gap-3">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24" />
                ))}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                  <Kpi label={t.reports.revenue} icon={<Wallet />} value={formatMoney(r.revenue, currency)}>
                    {delta !== null ? (
                      <span className={cn('inline-flex items-center gap-0.5 font-medium', delta >= 0 ? 'text-success' : 'text-danger')}>
                        {delta >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                        {percent(Math.abs(delta))} <span className="font-normal text-subtle-foreground">{t.reports.vsPrevious}</span>
                      </span>
                    ) : (
                      'Encaissements de la période'
                    )}
                  </Kpi>
                  <Kpi label={t.reports.appointments} icon={<TrendingUp />} value={String(r.appointmentCount)}>
                    {r.completedCount} terminé{r.completedCount > 1 ? 's' : ''} · {r.cancelledCount} annulé{r.cancelledCount > 1 ? 's' : ''}
                  </Kpi>
                  <Kpi label={t.reports.averageTicket} icon={<Receipt />} value={formatMoney(r.averageTicket, currency)}>
                    Sur les rendez-vous terminés
                  </Kpi>
                  <Kpi label={t.reports.noShowRate} icon={<Users />} value={percent(r.noShowRate)}>
                    {r.noShowCount} absence{r.noShowCount > 1 ? 's' : ''} · {r.newClients} {r.newClients > 1 ? `nouveaux ${terms.client.lowerPlural}` : `nouveau ${terms.client.lower}`}
                  </Kpi>
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
                  <Card>
                    <CardHeader title={t.reports.revenueByDay} />
                    <div className="px-3 pt-3 pb-2">
                      {r.revenue > 0 ? <RevenueBars data={r.revenueByDay} currency={currency} /> : <EmptyState compact title={t.reports.noData} />}
                    </div>
                  </Card>
                  <Card>
                    <CardHeader title={t.reports.paymentMethods} />
                    <div className="px-4 py-4">
                      {r.revenue > 0 ? (
                        <RankedBars
                          rows={r.paymentMethods
                            .filter((m) => m.amount > 0)
                            .sort((a, b) => b.amount - a.amount)
                            .map((m) => ({ key: m.method, label: PAYMENT_METHOD_LABELS[m.method], value: m.amount, sub: `${percent(m.amount / r.revenue)}` }))}
                          formatValue={(v) => formatMoney(v, currency)}
                        />
                      ) : (
                        <div className="py-6 text-center text-xs text-subtle-foreground">{t.reports.noData}</div>
                      )}
                    </div>
                  </Card>
                </div>

                {isPro ? (
                  <>
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      <Card>
                        <CardHeader icon={<Users />} title={t.reports.byStaff} />
                        {r.byStaff.length ? (
                          <table className="w-full text-[0.8125rem]">
                            <thead>
                              <tr className="text-left text-[0.6875rem] tracking-wide text-subtle-foreground uppercase">
                                <th className="py-2 pl-4 font-medium">{terms.staff.singular}</th>
                                <th className="py-2 text-right font-medium">{t.reports.count}</th>
                                <th className="py-2 text-right font-medium">{t.reports.value}</th>
                                <th className="py-2 pr-4 text-right font-medium">{t.reports.commission}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.byStaff.map((s) => (
                                <tr key={s.staffId ?? 'none'} className="border-t border-border">
                                  <td className="py-2 pl-4">
                                    <span className="flex items-center gap-2">
                                      <Avatar name={s.name} color={s.color} size={22} /> {s.name}
                                    </span>
                                  </td>
                                  <td className="tabular py-2 text-right">{s.count}</td>
                                  <td className="py-2 text-right font-medium">
                                    <Money cents={s.value} currency={currency} />
                                  </td>
                                  <td className="py-2 pr-4 text-right text-muted-foreground">{s.commission ? <Money cents={s.commission} currency={currency} /> : '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <EmptyState compact title={t.reports.noData} />
                        )}
                      </Card>
                      <Card>
                        <CardHeader icon={<Tag />} title={t.reports.byService} />
                        <div className="px-4 py-4">
                          {r.byService.length ? (
                            <RankedBars rows={r.byService.slice(0, 8).map((s) => ({ key: s.name, label: s.name, value: s.count, sub: formatMoney(s.value, currency) }))} formatValue={(v) => `${v}×`} />
                          ) : (
                            <div className="py-6 text-center text-xs text-subtle-foreground">{t.reports.noData}</div>
                          )}
                        </div>
                      </Card>
                    </div>

                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
                      <Card>
                        <CardHeader title={`${t.reports.unpaid} — ${formatMoney(r.unpaidTotal, currency)}`} />
                        {r.unpaid.length ? (
                          <ul className="max-h-[300px] divide-y divide-border overflow-y-auto">
                            {r.unpaid.map((u) => (
                              <li key={u.appointmentId}>
                                <button type="button" onClick={() => ui.openAppointment(u.appointmentId)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[0.8125rem] hover:bg-surface-2">
                                  <span className="tabular w-[86px] text-xs text-muted-foreground">{formatDateShort(u.startAt)}</span>
                                  <span className="min-w-0 flex-1 truncate font-medium">{u.clientName}</span>
                                  <span className="text-xs text-subtle-foreground">
                                    sur <Money cents={u.total} currency={currency} />
                                  </span>
                                  <Money cents={u.balance} currency={currency} className="w-[90px] text-right font-semibold text-warning" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <EmptyState compact title="Aucun impayé sur la période" />
                        )}
                      </Card>
                      <Card>
                        <CardHeader title={t.reports.net} />
                        <dl className="space-y-2 px-4 py-4 text-[0.8125rem]">
                          <div className="flex justify-between">
                            <dt className="text-muted-foreground">{t.reports.revenue}</dt>
                            <dd className="font-medium"><Money cents={r.revenue} currency={currency} /></dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-muted-foreground">{t.reports.expenses}</dt>
                            <dd className="font-medium">− <Money cents={r.expensesTotal} currency={currency} /></dd>
                          </div>
                          <div className="flex justify-between border-t border-border pt-2 text-[0.95rem]">
                            <dt className="font-semibold">{t.reports.net}</dt>
                            <dd className={cn('font-semibold', r.net < 0 && 'text-danger')}><Money cents={r.net} currency={currency} /></dd>
                          </div>
                          <div className="flex justify-between pt-1 text-xs text-muted-foreground">
                            <dt>{t.reports.recurringClients}</dt>
                            <dd>{r.recurringClients}</dd>
                          </div>
                        </dl>
                      </Card>
                    </div>
                  </>
                ) : (
                  <Card className="flex items-center gap-4 px-5 py-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0e6be6] to-[#18a5f2] text-white">
                      <Sparkles className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-[0.875rem] font-semibold">
                        {t.reports.proSection} <Lock className="size-3.5 text-subtle-foreground" />
                      </div>
                      <div className="text-xs text-muted-foreground">{t.reports.proSectionHint}</div>
                    </div>
                    <Button variant="primary" onClick={() => gate('advancedReports')}>
                      Découvrir Pro
                    </Button>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="expenses">{isPro ? <ExpensesPanel from={range.from} to={range.to} /> : null}</TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

function Kpi({ label, value, icon, children }: { label: string; value: string; icon: React.ReactNode; children?: React.ReactNode }) {
  return (
    <Card className="px-4 py-3.5">
      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground [&_svg]:size-4 [&_svg]:text-subtle-foreground">
        {label}
        {icon}
      </div>
      <div className="tabular mt-2 text-[1.45rem] leading-none font-semibold tracking-tight">{value}</div>
      <div className="mt-1.5 truncate text-xs text-subtle-foreground">{children}</div>
    </Card>
  )
}
