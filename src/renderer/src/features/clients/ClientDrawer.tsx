// Fiche client / patient : aperçu, rendez-vous, paiements, notes.

import { useMutation } from '@tanstack/react-query'
import { Archive, ArchiveRestore, CalendarPlus, Mail, MapPin, MessageCircle, MoreHorizontal, Pencil, Phone as PhoneIcon, Receipt, Trash2, Wallet, X, Cake, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { differenceInYears } from 'date-fns'
import type { AppointmentDto } from '@shared/types'
import { formatDateLong, formatDateShort, formatDateTime } from '@shared/format'
import { PAYMENT_METHOD_LABELS } from '@shared/status'
import { fromIsoDate } from '@shared/format'
import { api, errorMessage } from '@/lib/api'
import { useClient, useClientHistory } from '@/lib/queries'
import { useApp, useProGate } from '@/hooks/useApp'
import { useUi } from '@/stores/ui'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { Sheet } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Avatar, Badge, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, ProBadge, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives'
import { EmptyState, Money, Phone, StatusBadge } from '@/components/common'
import { confirm } from '@/components/confirm'

export function ClientDrawer() {
  const id = useUi((s) => s.clientDrawerId)
  const openClient = useUi((s) => s.openClient)
  return (
    <Sheet open={id !== null} onOpenChange={(o) => !o && openClient(null)} title="Fiche" width={560}>
      {id ? <Profile id={id} onClose={() => openClient(null)} /> : null}
    </Sheet>
  )
}

function Profile({ id, onClose }: { id: string; onClose: () => void }) {
  const ui = useUi()
  const { currency, isPro } = useApp()
  const gate = useProGate()
  const { data: c, isLoading } = useClient(id)
  const { data: history } = useClientHistory(id)

  const archive = useMutation({
    mutationFn: (archived: boolean) => api('clients.archive', { id, archived }),
    onSuccess: (_d, archived) => toast.success(archived ? 'Fiche archivée' : 'Fiche restaurée'),
    onError: (e) => toast.error(errorMessage(e))
  })

  const remove = async () => {
    const impact = await api('clients.deletionImpact', { id })
    if (impact.appointments || impact.payments) {
      const ok = await confirm({
        title: t.clients.archiveTitle,
        body: `${t.clients.deleteBlocked} (${impact.appointments} rendez-vous, ${impact.payments} paiement(s)). ${t.clients.archiveBody}`,
        confirmLabel: t.common.archive,
        tone: 'primary'
      })
      if (ok) archive.mutate(true)
      return
    }
    const ok = await confirm({ title: t.clients.deleteTitle, body: t.clients.deleteBody, confirmLabel: t.common.delete })
    if (!ok) return
    try {
      await api('clients.delete', { id })
      toast.success(t.common.deleted)
      onClose()
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  if (isLoading || !c) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-12 w-12 rounded-full" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-20" />
        <Skeleton className="h-48" />
      </div>
    )
  }
  const name = `${c.firstName} ${c.lastName}`.trim()
  const age = c.birthDate ? differenceInYears(Date.now(), fromIsoDate(c.birthDate)) : null
  const upcoming = (history?.appointments ?? []).filter((a) => a.startAt > Date.now() && (a.status === 'pending' || a.status === 'confirmed'))
  const past = (history?.appointments ?? []).filter((a) => !upcoming.includes(a))

  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b border-border px-6 pt-5 pb-4">
        <div className="flex items-start gap-4">
          <Avatar name={name} size={52} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-[1.15rem] font-semibold tracking-tight">{name}</h2>
              {c.archivedAt ? <Badge>{t.common.archived}</Badge> : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {c.phone ? (
                <span className="flex items-center gap-1">
                  <PhoneIcon className="size-3" /> <Phone value={c.phone} />
                </span>
              ) : null}
              {c.email ? (
                <span className="flex items-center gap-1">
                  <Mail className="size-3" /> {c.email}
                </span>
              ) : null}
              {age !== null ? (
                <span className="flex items-center gap-1">
                  <Cake className="size-3" /> {age} ans
                </span>
              ) : null}
              {c.insurance ? (
                <span className="flex items-center gap-1">
                  <ShieldCheck className="size-3" /> {c.insurance}
                </span>
              ) : null}
            </div>
            {c.tags.length ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {c.tags.map((tag) => (
                  <Badge key={tag} tone="primary">
                    {tag}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-0.5">
            <Button size="icon-sm" variant="ghost" aria-label={t.common.edit} onClick={() => ui.openClientForm(c.id)}>
              <Pencil />
            </Button>
            <Menu>
              <MenuTrigger asChild>
                <Button size="icon-sm" variant="ghost" aria-label={t.common.more}>
                  <MoreHorizontal />
                </Button>
              </MenuTrigger>
              <MenuContent>
                {c.archivedAt ? (
                  <MenuItem onSelect={() => archive.mutate(false)}>
                    <ArchiveRestore /> {t.common.unarchive}
                  </MenuItem>
                ) : (
                  <MenuItem
                    onSelect={async () => {
                      if (await confirm({ title: t.clients.archiveTitle, body: t.clients.archiveBody, confirmLabel: t.common.archive, tone: 'primary' })) archive.mutate(true)
                    }}
                  >
                    <Archive /> {t.common.archive}
                  </MenuItem>
                )}
                <MenuSeparator />
                <MenuItem danger onSelect={() => void remove()}>
                  <Trash2 /> {t.common.delete}
                </MenuItem>
              </MenuContent>
            </Menu>
            <Button size="icon-sm" variant="ghost" aria-label={t.common.close} onClick={onClose}>
              <X />
            </Button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant="primary" onClick={() => ui.openAppointmentForm({ clientId: c.id })}>
            <CalendarPlus /> {t.appointment.new}
          </Button>
          <Button size="sm" onClick={() => ui.openPayment({ clientId: c.id })}>
            <Wallet /> {t.payments.collect}
          </Button>
          <Button size="sm" onClick={() => gate('whatsapp', () => ui.openComposer({ clientId: c.id }))}>
            <MessageCircle /> WhatsApp {!isPro ? <ProBadge /> : null}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 divide-x divide-border border-b border-border">
        {[
          { label: t.clients.stats.appointments, value: String(c.appointmentCount) },
          { label: t.clients.stats.spent, value: <Money cents={c.totalSpent} currency={currency} /> },
          { label: t.clients.stats.balance, value: <Money cents={c.balance} currency={currency} />, warn: c.balance > 0 },
          { label: `${t.clients.stats.cancellations} / ${t.clients.stats.noShows}`, value: `${c.cancellationCount} / ${c.noShowCount}` }
        ].map((s) => (
          <div key={s.label} className="px-4 py-3">
            <div className="truncate text-[0.6875rem] text-subtle-foreground">{s.label}</div>
            <div className={cn('tabular mt-0.5 text-[0.95rem] font-semibold', s.warn && 'text-warning')}>{s.value}</div>
          </div>
        ))}
      </div>

      <Tabs defaultValue="overview" className="flex-1 px-6 pt-4 pb-6">
        <TabsList>
          <TabsTrigger value="overview">{t.clients.tabs.overview}</TabsTrigger>
          <TabsTrigger value="appointments">
            {t.clients.tabs.appointments} <span className="text-subtle-foreground">{history?.appointments.length ?? ''}</span>
          </TabsTrigger>
          <TabsTrigger value="payments">{t.clients.tabs.payments}</TabsTrigger>
          <TabsTrigger value="notes">{t.clients.tabs.notes}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 pt-4">
          <dl className="grid grid-cols-2 gap-3 text-[0.8125rem]">
            <Info label={t.clients.lastVisit} value={c.lastAppointmentAt ? formatDateLong(c.lastAppointmentAt) : t.clients.never} />
            <Info label={t.clients.nextAppointment} value={c.nextAppointmentAt ? formatDateTime(c.nextAppointmentAt) : t.clients.noneUpcoming} highlight={Boolean(c.nextAppointmentAt)} />
            <Info label={t.clients.stats.since} value={formatDateLong(c.createdAt)} />
            <Info label="WhatsApp" value={<Phone value={c.whatsappPhone || c.phone} />} />
            {c.address ? (
              <Info
                label={t.common.address}
                value={
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3" /> {c.address}
                  </span>
                }
                wide
              />
            ) : null}
          </dl>
          {upcoming.length ? (
            <div>
              <h3 className="mb-2 text-[0.6875rem] font-medium tracking-wide text-subtle-foreground uppercase">À venir</h3>
              <AppointmentList items={upcoming} />
            </div>
          ) : null}
          {c.notes ? (
            <div>
              <h3 className="mb-2 text-[0.6875rem] font-medium tracking-wide text-subtle-foreground uppercase">{t.common.notes}</h3>
              <p className="selectable line-clamp-4 rounded-lg bg-surface-2 px-3 py-2 text-[0.8125rem] whitespace-pre-wrap">{c.notes}</p>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="appointments" className="pt-4">
          {history?.appointments.length ? (
            <AppointmentList items={[...upcoming, ...past]} />
          ) : (
            <EmptyState compact title={t.clients.noAppointments} action={<Button size="sm" variant="primary" onClick={() => ui.openAppointmentForm({ clientId: c.id })}><CalendarPlus /> {t.appointment.new}</Button>} />
          )}
        </TabsContent>

        <TabsContent value="payments" className="pt-4">
          {history?.payments.length ? (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {history.payments.map((p) => (
                <li key={p.id} className={cn('flex items-center gap-3 px-3 py-2.5 text-[0.8125rem]', p.voidedAt && 'opacity-50')}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 font-medium">
                      <Money cents={p.amount} currency={currency} className={cn(p.voidedAt && 'line-through')} />
                      <span className="text-xs font-normal text-muted-foreground">· {PAYMENT_METHOD_LABELS[p.method]}</span>
                      {p.voidedAt ? <Badge tone="danger">{t.payments.voided}</Badge> : null}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {formatDateShort(p.paidAt)} · {p.receiptNumber}
                      {p.appointmentLabel ? ` · ${p.appointmentLabel}` : ''}
                    </div>
                  </div>
                  <Button size="icon-sm" variant="ghost" aria-label={t.payments.viewReceipt} onClick={() => ui.openReceipt(p.id)}>
                    <Receipt />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact title={t.clients.noPayments} />
          )}
        </TabsContent>

        <TabsContent value="notes" className="pt-4">
          {c.notes ? <p className="selectable rounded-lg bg-surface-2 px-4 py-3 text-[0.8125rem] leading-relaxed whitespace-pre-wrap">{c.notes}</p> : <EmptyState compact title={t.clients.noNotes} />}
          <Button size="sm" className="mt-3" onClick={() => ui.openClientForm(c.id)}>
            <Pencil /> {t.common.edit}
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Info({ label, value, highlight, wide }: { label: string; value: React.ReactNode; highlight?: boolean; wide?: boolean }) {
  return (
    <div className={cn('rounded-lg border border-border px-3 py-2', wide && 'col-span-2')}>
      <dt className="text-[0.6875rem] text-subtle-foreground">{label}</dt>
      <dd className={cn('mt-0.5 font-medium', highlight && 'text-primary')}>{value}</dd>
    </div>
  )
}

function AppointmentList({ items }: { items: AppointmentDto[] }) {
  const ui = useUi()
  const { currency } = useApp()
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {items.map((a) => (
        <li key={a.id}>
          <button type="button" onClick={() => ui.openAppointment(a.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-[0.8125rem] transition-colors hover:bg-surface-2">
            <div className="tabular w-[92px] shrink-0 text-xs text-muted-foreground">{formatDateTime(a.startAt).replace(' · ', '\n')}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{a.services.map((s) => s.name).join(' + ')}</div>
              <div className="truncate text-xs text-muted-foreground">{a.staffName}</div>
            </div>
            <div className="text-right">
              <Money cents={a.total} currency={currency} className="text-xs" />
              {a.balance > 0 && a.status !== 'cancelled' ? <div className="text-[0.6875rem] text-warning">reste <Money cents={a.balance} currency={currency} /></div> : null}
            </div>
            <StatusBadge status={a.status} />
          </button>
        </li>
      ))}
    </ul>
  )
}
