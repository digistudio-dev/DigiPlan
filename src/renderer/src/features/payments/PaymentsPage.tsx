// Grand livre des paiements.

import { useEffect, useMemo, useState } from 'react'
import { useInfiniteQuery, useMutation } from '@tanstack/react-query'
import { Ban, CreditCard, Download, MoreHorizontal, Plus, Receipt, Search } from 'lucide-react'
import { toast } from 'sonner'
import { endOfDay, startOfMonth, startOfYear, subDays } from 'date-fns'
import type { PaymentDto, PaymentMethod } from '@shared/types'
import { formatDateShort, formatTime, fromIsoDate, toIsoDate } from '@shared/format'
import { formatMoney } from '@shared/domain/money'
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from '@shared/status'
import { api, errorMessage } from '@/lib/api'
import { useApp } from '@/hooks/useApp'
import { useUiActions } from '@/stores/ui'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Skeleton, Switch } from '@/components/ui/primitives'
import { EmptyState, Money, PageHeader, Select } from '@/components/common'
import { confirm } from '@/components/confirm'

type Period = 'today' | '7d' | 'month' | 'year' | 'all'
const PAGE = 50

function periodRange(p: Period): { from?: number; to?: number; fromIso?: string; toIso?: string } {
  const now = Date.now()
  const to = endOfDay(now).getTime() + 1
  const from = p === 'today' ? fromIsoDate(toIsoDate(now)) : p === '7d' ? subDays(fromIsoDate(toIsoDate(now)), 6).getTime() : p === 'month' ? startOfMonth(now).getTime() : p === 'year' ? startOfYear(now).getTime() : undefined
  return { from, to: p === 'all' ? undefined : to, fromIso: from ? toIsoDate(from) : undefined, toIso: toIsoDate(now) }
}

export default function PaymentsPage() {
  const { currency } = useApp()
  const ui = useUiActions()
  const [period, setPeriod] = useState<Period>('month')
  const [method, setMethod] = useState<PaymentMethod | ''>('')
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [includeVoided, setIncludeVoided] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setQ(search.trim()), 200)
    return () => clearTimeout(id)
  }, [search])
  const range = useMemo(() => periodRange(period), [period])

  const query = useInfiniteQuery({
    queryKey: ['payments', 'list', period, method, q, includeVoided],
    queryFn: ({ pageParam }) =>
      api('payments.list', { from: range.from, to: range.to, method: method || undefined, search: q || undefined, includeVoided, page: pageParam, pageSize: PAGE }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (pages.length * PAGE < last.total ? pages.length : undefined)
  })
  const items = query.data?.pages.flatMap((p) => p.items) ?? []
  const first = query.data?.pages[0]

  const voidPayment = useMutation({
    mutationFn: (p: PaymentDto) => api('payments.void', { id: p.id, reason: '' }),
    onSuccess: () => toast.success('Paiement annulé'),
    onError: (e) => toast.error(errorMessage(e))
  })

  const exportCsv = async () => {
    try {
      const r = await api('export.csv', { kind: 'payments', from: range.fromIso, to: range.toIso })
      if (r.saved) toast.success(`${r.rows} paiements exportés`, { description: r.path })
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={t.payments.title}
        subtitle={first ? `${t.payments.count(first.total)} · ${t.payments.periodTotal} ${formatMoney(first.sum, currency)}` : ' '}
        actions={
          <>
            <Button onClick={exportCsv}>
              <Download /> {t.common.export}
            </Button>
            <Button variant="primary" onClick={() => ui.openPayment()}>
              <Plus /> {t.payments.new}
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-[280px]">
            <Input leading={<Search />} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Client ou n° de reçu…" />
          </div>
          <Select
            className="w-[170px]"
            value={period}
            onChange={(v) => setPeriod(v as Period)}
            options={[
              { value: 'today', label: t.reports.presets.today },
              { value: '7d', label: '7 derniers jours' },
              { value: 'month', label: t.reports.presets.month },
              { value: 'year', label: t.reports.presets.year },
              { value: 'all', label: 'Tout l’historique' }
            ]}
          />
          <Select
            className="w-[160px]"
            value={method || '__all'}
            onChange={(v) => setMethod(v === '__all' ? '' : (v as PaymentMethod))}
            options={[{ value: '__all', label: 'Tous les modes' }, ...PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }))]}
          />
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={includeVoided} onCheckedChange={setIncludeVoided} /> {t.payments.showVoided}
          </label>
        </div>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!query.isLoading && items.length === 0 ? (
          <EmptyState icon={<CreditCard />} title={t.payments.empty} action={<Button variant="primary" onClick={() => ui.openPayment()}><Plus /> {t.payments.new}</Button>} />
        ) : (
          <table className="w-full border-separate border-spacing-0 text-[0.8125rem]">
            <thead className="sticky top-0 z-10 bg-panel">
              <tr className="text-left text-[0.6875rem] tracking-wide text-subtle-foreground uppercase">
                <th className="border-b border-border py-2 pl-6 font-medium">{t.payments.paidAt}</th>
                <th className="border-b border-border py-2 font-medium">{t.payments.receiptNumber}</th>
                <th className="border-b border-border py-2 font-medium">{t.payments.client}</th>
                <th className="border-b border-border py-2 font-medium">{t.payments.linkedAppointment}</th>
                <th className="border-b border-border py-2 font-medium">{t.payments.method}</th>
                <th className="border-b border-border py-2 text-right font-medium">{t.payments.amount}</th>
                <th className="w-[84px] border-b border-border py-2 pr-6" />
              </tr>
            </thead>
            <tbody>
              {query.isLoading
                ? Array.from({ length: 6 }, (_, i) => (
                    <tr key={i}>
                      <td colSpan={7} className="border-b border-border px-6 py-2.5">
                        <Skeleton className="h-5" />
                      </td>
                    </tr>
                  ))
                : items.map((p) => (
                    <tr key={p.id} className={cn('group transition-colors hover:bg-surface-2/70', p.voidedAt && 'opacity-50')}>
                      <td className="tabular border-b border-border py-2 pl-6">
                        {formatDateShort(p.paidAt)} <span className="text-subtle-foreground">{formatTime(p.paidAt)}</span>
                      </td>
                      <td className="tabular border-b border-border py-2 text-muted-foreground">{p.receiptNumber}</td>
                      <td className="border-b border-border py-2">
                        {p.clientId ? (
                          <button type="button" className="font-medium hover:underline" onClick={() => ui.openClient(p.clientId!)}>
                            {p.clientName}
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="max-w-[260px] truncate border-b border-border py-2 text-muted-foreground">
                        {p.appointmentId ? (
                          <button type="button" className="truncate hover:underline" onClick={() => ui.openAppointment(p.appointmentId!)}>
                            {p.appointmentLabel}
                          </button>
                        ) : (
                          p.note || t.payments.standalone
                        )}
                      </td>
                      <td className="border-b border-border py-2">
                        <Badge>{PAYMENT_METHOD_LABELS[p.method]}</Badge>
                        {p.voidedAt ? <Badge tone="danger" className="ml-1">{t.payments.voided}</Badge> : null}
                      </td>
                      <td className={cn('border-b border-border py-2 text-right font-semibold', p.voidedAt && 'line-through')}>
                        <Money cents={p.amount} currency={currency} />
                      </td>
                      <td className="border-b border-border py-2 pr-6 text-right">
                        <div className="flex justify-end gap-0.5">
                          <Button size="icon-sm" variant="ghost" aria-label={t.payments.viewReceipt} onClick={() => ui.openReceipt(p.id)}>
                            <Receipt />
                          </Button>
                          {!p.voidedAt ? (
                            <Menu>
                              <MenuTrigger asChild>
                                <Button size="icon-sm" variant="ghost" aria-label={t.common.more}>
                                  <MoreHorizontal />
                                </Button>
                              </MenuTrigger>
                              <MenuContent>
                                <MenuItem onSelect={() => ui.openReceipt(p.id)}>
                                  <Receipt /> {t.payments.viewReceipt}
                                </MenuItem>
                                <MenuSeparator />
                                <MenuItem
                                  danger
                                  onSelect={async () => {
                                    if (await confirm({ title: t.payments.voidTitle, body: t.payments.voidBody, confirmLabel: t.payments.void })) voidPayment.mutate(p)
                                  }}
                                >
                                  <Ban /> {t.payments.void}
                                </MenuItem>
                              </MenuContent>
                            </Menu>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        )}
        {query.hasNextPage ? (
          <div className="flex justify-center py-4">
            <Button onClick={() => void query.fetchNextPage()} loading={query.isFetchingNextPage}>
              {t.clients.loadMore}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
