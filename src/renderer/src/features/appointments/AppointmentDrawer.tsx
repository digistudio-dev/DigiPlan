// Panneau latéral de détail d'un rendez-vous, avec actions rapides.

import { useQuery } from '@tanstack/react-query'
import {
  Ban,
  Bell,
  BellOff,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  CloudCheck,
  CloudAlert,
  CloudUpload,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Phone as PhoneIcon,
  Play,
  Receipt,
  Repeat,
  RotateCcw,
  Trash2,
  User,
  UserCheck,
  UserX,
  Wallet,
  X,
  MapPin
} from 'lucide-react'
import type { AppointmentDto, AppointmentStatus } from '@shared/types'
import { formatDateFull, formatDateTime, formatDuration, formatTimeRange } from '@shared/format'
import { PAYMENT_METHOD_LABELS } from '@shared/status'
import { api } from '@/lib/api'
import { useAppointment } from '@/lib/queries'
import { useApp, useProGate } from '@/hooks/useApp'
import { useUi } from '@/stores/ui'
import { capitalize, cn } from '@/lib/utils'
import { t } from '@/i18n'
import { Sheet } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Avatar, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, ProBadge, Skeleton, Tooltip } from '@/components/ui/primitives'
import { Money, Phone, StatusBadge } from '@/components/common'
import { useAppointmentActions } from './useAppointmentActions'

export function AppointmentDrawer() {
  const id = useUi((s) => s.appointmentDrawerId)
  const openAppointment = useUi((s) => s.openAppointment)
  const { data: a, isLoading, isError } = useAppointment(id)

  return (
    <Sheet open={id !== null} onOpenChange={(o) => !o && openAppointment(null)} title={t.appointment.details} width={420}>
      {isLoading || (!a && !isError) ? (
        <div className="space-y-3 p-5">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-32" />
          <Skeleton className="h-24" />
        </div>
      ) : a ? (
        <Details a={a} onClose={() => openAppointment(null)} />
      ) : (
        <div className="p-6 text-[0.8125rem] text-muted-foreground">Ce rendez-vous est introuvable ou a été supprimé.</div>
      )}
    </Sheet>
  )
}

function Details({ a, onClose }: { a: AppointmentDto; onClose: () => void }) {
  const ui = useUi()
  const { terms, currency, isPro } = useApp()
  const gate = useProGate()
  const actions = useAppointmentActions()
  const { data: series } = useQuery({
    queryKey: ['appointment', a.id, 'series'],
    queryFn: () => api('appointments.seriesInfo', { id: a.id }),
    enabled: Boolean(a.seriesId)
  })
  const { data: payments } = useQuery({
    queryKey: ['payments', 'appointment', a.id],
    queryFn: () => api('payments.forAppointment', { appointmentId: a.id })
  })

  const set = (s: AppointmentStatus) => actions.setStatus(a.id, s)
  const closed = a.status === 'completed' || a.status === 'cancelled' || a.status === 'no_show'

  const primary: Array<{ status: AppointmentStatus; label: string; icon: typeof Check; show: boolean }> = [
    { status: 'confirmed', label: t.appointment.actions.confirm, icon: Check, show: a.status === 'pending' },
    { status: 'arrived', label: t.appointment.actions.arrived, icon: UserCheck, show: a.status === 'pending' || a.status === 'confirmed' },
    { status: 'in_progress', label: t.appointment.actions.start, icon: Play, show: a.status === 'arrived' || a.status === 'confirmed' },
    { status: 'completed', label: t.appointment.actions.complete, icon: CheckCircle2, show: a.status === 'in_progress' || a.status === 'arrived' }
  ]

  return (
    <div className="flex min-h-full flex-col">
      {/* En-tête */}
      <div className="sticky top-0 z-10 border-b border-border bg-surface px-5 pt-4 pb-4">
        <div className="flex items-center justify-between">
          <StatusBadge status={a.status} />
          <div className="flex items-center gap-0.5">
            <Tooltip content={t.appointment.actions.edit}>
              <Button size="icon-sm" variant="ghost" aria-label={t.appointment.actions.edit} onClick={() => ui.openAppointmentForm({ id: a.id })}>
                <Pencil />
              </Button>
            </Tooltip>
            <Menu>
              <MenuTrigger asChild>
                <Button size="icon-sm" variant="ghost" aria-label={t.common.more}>
                  <MoreHorizontal />
                </Button>
              </MenuTrigger>
              <MenuContent>
                <MenuItem onSelect={() => ui.openClient(a.clientId)}>
                  <User /> {t.appointment.actions.viewClient}
                </MenuItem>
                <MenuItem onSelect={() => ui.focusCalendarOn(a.startAt)}>
                  <CalendarDays /> Voir dans le calendrier
                </MenuItem>
                {a.status !== 'no_show' && !closed ? (
                  <MenuItem onSelect={() => set('no_show')}>
                    <UserX /> {t.appointment.actions.noShow}
                  </MenuItem>
                ) : null}
                {closed ? (
                  <MenuItem onSelect={() => set('confirmed')}>
                    <RotateCcw /> {t.appointment.actions.reopen}
                  </MenuItem>
                ) : null}
                {a.status !== 'cancelled' ? (
                  <MenuItem onSelect={() => void actions.cancel(a)}>
                    <Ban /> {t.appointment.actions.cancel}
                  </MenuItem>
                ) : null}
                <MenuSeparator />
                <MenuItem danger onSelect={() => void actions.destroy(a).then((ok) => ok && onClose())}>
                  <Trash2 /> {t.appointment.actions.delete}
                </MenuItem>
              </MenuContent>
            </Menu>
            <Button size="icon-sm" variant="ghost" aria-label={t.common.close} onClick={onClose}>
              <X />
            </Button>
          </div>
        </div>
        <h2 className="mt-3 text-[1.05rem] font-semibold tracking-tight">{a.services.map((s) => s.name).join(' + ')}</h2>
        <div className="mt-1 flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
          <CalendarDays className="size-3.5" />
          <span>{capitalize(formatDateFull(a.startAt))}</span>
        </div>
        <div className="tabular mt-0.5 flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
          <Clock className="size-3.5" />
          {formatTimeRange(a.startAt, a.endAt)} · {formatDuration(Math.round((a.endAt - a.startAt) / 60000))}
        </div>
        {series ? (
          <div className="mt-0.5 flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
            <Repeat className="size-3.5" /> {t.appointment.series(series.index, series.total)}
          </div>
        ) : null}

        {/* Actions principales */}
        <div className="mt-4 flex flex-wrap gap-2">
          {primary
            .filter((p) => p.show)
            .slice(0, 2)
            .map((p, i) => (
              <Button key={p.status} size="sm" variant={i === 0 ? 'primary' : 'secondary'} onClick={() => set(p.status)} disabled={actions.pending}>
                <p.icon /> {p.label}
              </Button>
            ))}
          {a.balance > 0 && a.status !== 'cancelled' ? (
            <Button size="sm" variant={closed ? 'primary' : 'secondary'} onClick={() => ui.openPayment({ appointmentId: a.id })}>
              <Wallet /> {t.appointment.actions.collect}
            </Button>
          ) : null}
          <Button size="sm" variant="secondary" onClick={() => gate('whatsapp', () => ui.openComposer({ appointmentId: a.id }))}>
            <MessageCircle /> WhatsApp {!isPro ? <ProBadge /> : null}
          </Button>
        </div>
      </div>

      <div className="flex-1 space-y-5 px-5 py-5">
        {/* Client */}
        <section>
          <SectionTitle>{terms.client.singular}</SectionTitle>
          <button type="button" onClick={() => ui.openClient(a.clientId)} className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-surface-2">
            <Avatar name={a.clientName} size={36} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[0.875rem] font-semibold">{a.clientName}</div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <PhoneIcon className="size-3" /> <Phone value={a.clientPhone} />
              </div>
            </div>
          </button>
        </section>

        {/* Infos */}
        <section>
          <SectionTitle>Informations</SectionTitle>
          <dl className="divide-y divide-border rounded-lg border border-border text-[0.8125rem]">
            <Row label={terms.staff.singular}>
              <span className="flex items-center gap-2">
                {a.staffColor ? <span className="size-2 rounded-full" style={{ background: a.staffColor }} /> : null}
                {a.staffName ?? '—'}
              </span>
            </Row>
            {a.resourceName ? (
              <Row label={terms.resource.singular}>
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-3.5 text-muted-foreground" /> {a.resourceName}
                </span>
              </Row>
            ) : null}
            {a.services.map((s, i) => (
              <Row key={i} label={i === 0 ? terms.service.plural : ''}>
                <span className="flex items-center gap-2">
                  {s.name}
                  <span className="text-muted-foreground">·</span>
                  <Money cents={s.price} currency={currency} muted />
                </span>
              </Row>
            ))}
          </dl>
        </section>

        {/* Paiement */}
        <section>
          <SectionTitle>Paiement</SectionTitle>
          <div className="rounded-lg border border-border">
            <div className="grid grid-cols-3 divide-x divide-border text-center">
              {[
                { label: t.common.total, value: a.total },
                { label: t.common.paid, value: a.paid },
                { label: t.common.remaining, value: a.balance, warn: a.balance > 0 && a.status !== 'cancelled' }
              ].map((x) => (
                <div key={x.label} className="px-2 py-2.5">
                  <div className="text-[0.6875rem] text-subtle-foreground">{x.label}</div>
                  <div className={cn('tabular text-[0.875rem] font-semibold', x.warn && 'text-warning')}>
                    <Money cents={x.value} currency={currency} />
                  </div>
                </div>
              ))}
            </div>
            {a.discount ? (
              <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                Remise appliquée : <Money cents={a.discount} currency={currency} />
              </div>
            ) : null}
            {payments?.length ? (
              <ul className="divide-y divide-border border-t border-border">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                    <span className="tabular text-muted-foreground">{formatDateTime(p.paidAt)}</span>
                    <span className="text-muted-foreground">· {PAYMENT_METHOD_LABELS[p.method]}</span>
                    <Money cents={p.amount} currency={currency} className="ml-auto font-medium" />
                    <Button size="icon-sm" variant="ghost" aria-label={t.payments.viewReceipt} onClick={() => ui.openReceipt(p.id)}>
                      <Receipt />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>

        {/* Rappel & synchronisation */}
        <section>
          <SectionTitle>Rappels & synchronisation</SectionTitle>
          <div className="space-y-2 text-[0.8125rem]">
            <div className="flex items-center gap-2">
              {a.reminderEnabled ? <Bell className="size-4 text-primary" /> : <BellOff className="size-4 text-subtle-foreground" />}
              {a.reminderEnabled ? (
                <span>
                  {a.reminderStatus ? t.appointment.reminderStatus[a.reminderStatus] : 'Rappel prévu'}
                  <span className="text-muted-foreground"> · {a.reminderOffsetMin >= 60 ? `${a.reminderOffsetMin / 60} h avant` : `${a.reminderOffsetMin} min avant`}</span>
                </span>
              ) : (
                <span className="text-muted-foreground">{t.appointment.noReminder}</span>
              )}
              {!isPro ? <ProBadge /> : null}
            </div>
            {a.googleSyncStatus ? (
              <div className="flex items-center gap-2">
                {a.googleSyncStatus === 'synced' ? (
                  <CloudCheck className="size-4 text-success" />
                ) : a.googleSyncStatus === 'error' ? (
                  <CloudAlert className="size-4 text-danger" />
                ) : (
                  <CloudUpload className="size-4 text-muted-foreground" />
                )}
                {t.appointment.googleStatus[a.googleSyncStatus]}
              </div>
            ) : null}
          </div>
        </section>

        {a.notes ? (
          <section>
            <SectionTitle>{t.common.notes}</SectionTitle>
            <p className="selectable rounded-lg bg-surface-2 px-3 py-2.5 text-[0.8125rem] whitespace-pre-wrap">{a.notes}</p>
          </section>
        ) : null}
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-[0.6875rem] font-medium tracking-wide text-subtle-foreground uppercase">{children}</h3>
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium">{children}</dd>
    </div>
  )
}
