// Création / modification rapide d'un rendez-vous.
// Parcours : client → prestations → équipe → date → heure (créneaux libres) → prix → paiement → rappel → notes.

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { addMinutes, format } from 'date-fns'
import { AlertTriangle, Ban, Bell, Clock, Lock, Plus, Repeat, Trash2, UserPlus, X } from 'lucide-react'
import { toast } from 'sonner'
import type { AppointmentDto, AppointmentStatus, PaymentMethod } from '@shared/types'
import type { Conflict } from '@shared/domain/availability'
import { computeAppointmentTotals } from '@shared/domain/pricing'
import { formatMoney } from '@shared/domain/money'
import { isPlausiblePhone } from '@shared/domain/phone'
import { REMINDER_OFFSETS } from '@shared/domain/reminders'
import { FREQUENCY_LABELS, type RecurrenceFrequency } from '@shared/domain/recurrence'
import { formatDuration, formatTime, toIsoDate } from '@shared/format'
import { APPOINTMENT_STATUSES, PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from '@shared/status'
import { api, errorMessage } from '@/lib/api'
import { useCatalog, useResources, useStaffList, useWhatsAppState } from '@/lib/queries'
import { useApp, useProGate } from '@/hooks/useApp'
import { useUi } from '@/stores/ui'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/input'
import { Checkbox, Kbd, Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger, ProBadge, Segmented, Switch } from '@/components/ui/primitives'
import { MoneyInput, Select } from '@/components/common'
import { ClientPicker, type PickedClient } from '../clients/ClientPicker'
import { askSeriesScope } from './useAppointmentActions'

interface Line {
  key: string
  serviceId: string | null
  name: string
  durationMin: number
  price: number
}

type PayMode = 'none' | 'full' | 'partial'

const roundTo = (ms: number, step: number) => {
  const d = new Date(ms)
  d.setSeconds(0, 0)
  d.setMinutes(Math.floor(d.getMinutes() / step) * step)
  return d.getTime()
}

export function AppointmentFormDialog() {
  const draft = useUi((s) => s.appointmentForm)
  const close = useUi((s) => s.closeAppointmentForm)
  const open = draft !== null
  // Remonte le formulaire à chaque ouverture pour repartir d'un état propre.
  const [instance, setInstance] = useState(0)
  useEffect(() => {
    if (open) setInstance((i) => i + 1)
  }, [open])

  const { data: existing, isLoading } = useQuery({
    queryKey: ['appointment', draft?.id],
    queryFn: () => api('appointments.get', { id: draft!.id! }),
    enabled: Boolean(draft?.id)
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && close()}
      size="lg"
      title={draft?.id ? t.appointment.edit : draft?.walkIn ? t.appointment.walkIn : t.appointment.new}
      bodyClassName="p-0"
    >
      {open && (!draft?.id || (!isLoading && existing)) ? <AppointmentForm key={instance} existing={existing ?? null} onDone={close} /> : <div className="h-[420px]" />}
    </Dialog>
  )
}

function AppointmentForm({ existing, onDone }: { existing: AppointmentDto | null; onDone: () => void }) {
  const draft = useUi((s) => s.appointmentForm) ?? {}
  const { settings, category, terms, currency, isPro } = useApp()
  const gate = useProGate()
  const { data: staffList = [] } = useStaffList()
  const { data: catalog } = useCatalog()
  const { data: resources = [] } = useResources()
  const { data: wa } = useWhatsAppState()
  const isEdit = Boolean(existing)

  // ---------- État ----------
  const initialStart = existing?.startAt ?? (draft.startAt ? (draft.walkIn ? roundTo(draft.startAt, 5) : draft.startAt) : null)
  const [client, setClient] = useState<PickedClient | null>(existing ? { id: existing.clientId, name: existing.clientName, phone: existing.clientPhone } : null)
  const [newClient, setNewClient] = useState<{ firstName: string; lastName: string; phone: string } | null>(null)
  const [lines, setLines] = useState<Line[]>(
    existing?.services.map((s, i) => ({ key: String(i), serviceId: s.serviceId, name: s.name, durationMin: s.durationMin, price: s.price })) ?? []
  )
  const [staffId, setStaffId] = useState<string>(existing?.staffId ?? draft.staffId ?? '')
  const [resourceId, setResourceId] = useState<string>(existing?.resourceId ?? '')
  const [date, setDate] = useState(toIsoDate(initialStart ?? Date.now()))
  const [time, setTime] = useState(initialStart ? formatTime(initialStart) : '')
  const [discount, setDiscount] = useState(existing?.discount ?? 0)
  const [status, setStatus] = useState<AppointmentStatus>(existing?.status ?? (draft.walkIn ? 'arrived' : settings.defaultAppointmentStatus))
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [reminderEnabled, setReminderEnabled] = useState(existing?.reminderEnabled ?? (isPro && settings.remindersEnabledByDefault && !draft.walkIn))
  const [reminderOffset, setReminderOffset] = useState(existing?.reminderOffsetMin ?? settings.defaultReminderOffsetMin)
  const [sendConfirmation, setSendConfirmation] = useState(false)
  const [payMode, setPayMode] = useState<PayMode>('none')
  const [payAmount, setPayAmount] = useState(0)
  const [payMethod, setPayMethod] = useState<PaymentMethod>('cash')
  const [recurrence, setRecurrence] = useState<RecurrenceFrequency | 'none'>('none')
  const [recurrenceEnd, setRecurrenceEnd] = useState<'count' | 'until'>('count')
  const [recurrenceCount, setRecurrenceCount] = useState(4)
  const [recurrenceUntil, setRecurrenceUntil] = useState(toIsoDate(Date.now() + 90 * 86400_000))
  const [conflicts, setConflicts] = useState<{ list: Conflict[]; occurrence?: number } | null>(null)
  const [submitted, setSubmitted] = useState(false)

  // Préremplissages.
  useEffect(() => {
    if (!staffId && staffList.length) setStaffId(staffList[0].id)
  }, [staffList, staffId])
  useEffect(() => {
    if (draft.clientId && !client) {
      void api('clients.get', { id: draft.clientId }).then((c) => setClient({ id: c.id, name: `${c.firstName} ${c.lastName}`.trim(), phone: c.phone }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.clientId])

  const staff = staffList.find((s) => s.id === staffId)
  const services = catalog?.services ?? []
  const availableServices = services.filter(
    (s) => (s.staffIds.length === 0 || s.staffIds.includes(staffId)) && (!staff || staff.serviceIds.length === 0 || staff.serviceIds.includes(s.id))
  )
  const totals = computeAppointmentTotals(lines, discount)
  const durationMin = totals.durationMin || draft.durationMin || category.defaultAppointmentDurationMin
  const startAt = useMemo(() => {
    if (!date || !/^\d{2}:\d{2}$/.test(time)) return null
    const [y, m, d] = date.split('-').map(Number)
    const [h, mi] = time.split(':').map(Number)
    return new Date(y, m - 1, d, h, mi).getTime()
  }, [date, time])
  const endAt = startAt ? addMinutes(startAt, durationMin).getTime() : null
  const serviceIds = lines.map((l) => l.serviceId).filter((x): x is string => Boolean(x))
  const resourcesActive = isPro && settings.resourcesEnabled && resources.some((r) => r.active)

  // Créneaux disponibles du jour.
  const slots = useQuery({
    queryKey: ['appointments', 'slots', date, staffId, resourceId, durationMin, serviceIds.join(','), existing?.id],
    queryFn: () =>
      api('appointments.slots', { date, staffId, resourceId: resourceId || null, durationMin, serviceIds, excludeId: existing?.id }),
    enabled: Boolean(staffId && date && durationMin > 0 && !draft.walkIn)
  })

  // Vérification en direct du créneau choisi.
  const liveCheck = useQuery({
    queryKey: ['appointments', 'check', startAt, staffId, resourceId, durationMin, serviceIds.join(','), existing?.id],
    queryFn: () =>
      api('appointments.check', { startAt: startAt!, staffId, resourceId: resourceId || null, durationMin, serviceIds, excludeId: existing?.id }),
    enabled: Boolean(startAt && staffId && durationMin > 0)
  })
  const liveBlocking = (liveCheck.data ?? []).filter((c) => c.blocking)

  const addService = (id: string) => {
    const s = services.find((x) => x.id === id)
    if (!s) return
    setLines((l) => [...l, { key: `${Date.now()}`, serviceId: s.id, name: s.name, durationMin: s.durationMin, price: s.price }])
    setConflicts(null)
  }

  const save = useMutation({
    mutationFn: async (acknowledgeWarnings: boolean) => {
      let scope: 'single' | 'following' | 'series' = 'single'
      if (existing?.seriesId) {
        const s = await askSeriesScope(existing, 'modifier')
        if (!s) return null
        scope = s
      }
      const payment =
        !isEdit && payMode !== 'none'
          ? { amount: payMode === 'full' ? totals.total : Math.min(payAmount, totals.total), method: payMethod }
          : null
      return api('appointments.save', {
        id: existing?.id,
        clientId: client?.id ?? null,
        newClient: !client && newClient
          ? { firstName: newClient.firstName.trim(), lastName: newClient.lastName.trim(), phone: newClient.phone, whatsappPhone: '', email: '', birthDate: null, gender: null, address: '', insurance: '', notes: '', tags: [] }
          : undefined,
        staffId,
        resourceId: resourcesActive ? resourceId || null : null,
        startAt: startAt!,
        services: lines.map(({ serviceId, name, durationMin, price }) => ({ serviceId, name: name.trim() || 'Prestation', durationMin, price })),
        discount: totals.discount,
        status,
        notes,
        reminderEnabled: isPro && reminderEnabled,
        reminderOffsetMin: reminderOffset,
        sendConfirmation: isPro && sendConfirmation,
        recurrence:
          !isEdit && recurrence !== 'none'
            ? { frequency: recurrence, count: recurrenceEnd === 'count' ? recurrenceCount : null, until: recurrenceEnd === 'until' ? recurrenceUntil : null }
            : null,
        scope,
        acknowledgeWarnings,
        initialPayment: payment && payment.amount > 0 ? payment : null
      })
    },
    onSuccess: (res) => {
      if (!res) return
      if (!res.ok) {
        setConflicts({ list: res.conflicts, occurrence: res.occurrence })
        return
      }
      toast.success(res.createdCount > 1 ? t.appointment.createdMany(res.createdCount) : isEdit ? t.appointment.updated : t.appointment.created, {
        description: `${res.appointment.clientName} · ${format(res.appointment.startAt, 'dd/MM')} à ${formatTime(res.appointment.startAt)}`
      })
      onDone()
    },
    onError: (e) => toast.error(errorMessage(e, t.errors.save))
  })

  // ---------- Validation ----------
  const errors = {
    client: !client && !(newClient && newClient.firstName.trim()) ? t.validation.required : undefined,
    newClientPhone: newClient && newClient.phone.trim() && !isPlausiblePhone(newClient.phone) ? t.validation.phone : undefined,
    services: lines.length === 0 ? `Ajoutez au moins ${terms.service.a}.` : undefined,
    staff: !staffId ? t.validation.required : undefined,
    time: !startAt ? t.validation.time : undefined,
    payment: payMode === 'partial' && (payAmount <= 0 || payAmount > totals.total) ? t.validation.amount : undefined
  }
  const valid = !Object.values(errors).some(Boolean)
  const submit = (ack = false) => {
    setSubmitted(true)
    if (!valid) return
    save.mutate(ack)
  }

  const blockingConflicts = conflicts?.list.filter((c) => c.blocking) ?? []
  const groupedServices = (catalog?.categories ?? [])
    .map((c) => ({ name: c.name, items: availableServices.filter((s) => s.categoryId === c.id) }))
    .concat([{ name: 'Autres', items: availableServices.filter((s) => !s.categoryId || !catalog?.categories.some((c) => c.id === s.categoryId)) }])
    .filter((g) => g.items.length)

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit(false)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.ctrlKey) {
          e.preventDefault()
          submit(false)
        }
      }}
      className="flex max-h-[calc(100vh-140px)] flex-col"
    >
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pt-1 pb-5">
        {/* 1. Client */}
        <Field label={terms.client.singular} error={submitted ? errors.client : undefined}>
          {newClient && !client ? (
            <div className="rounded-lg border border-primary/40 bg-primary-soft/30 p-3">
              <div className="mb-2 flex items-center justify-between text-xs font-medium text-primary-soft-foreground">
                <span className="flex items-center gap-1.5">
                  <UserPlus className="size-3.5" /> {terms.client.newLabel}
                </span>
                <button type="button" className="rounded p-0.5 hover:bg-surface" onClick={() => setNewClient(null)} aria-label={t.common.cancel}>
                  <X className="size-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Input autoFocus placeholder={t.clients.firstName} value={newClient.firstName} onChange={(e) => setNewClient({ ...newClient, firstName: e.target.value })} aria-invalid={submitted && !newClient.firstName.trim()} />
                <Input placeholder={t.clients.lastName} value={newClient.lastName} onChange={(e) => setNewClient({ ...newClient, lastName: e.target.value })} />
                <Input placeholder="06 12 34 56 78" value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} aria-invalid={Boolean(errors.newClientPhone)} />
              </div>
              {errors.newClientPhone ? <p className="mt-1 text-xs text-danger">{errors.newClientPhone}</p> : null}
            </div>
          ) : (
            <ClientPicker
              value={client}
              onChange={setClient}
              autoFocus={!isEdit && !client}
              invalid={submitted && Boolean(errors.client)}
              onCreateNew={(search) => {
                const digits = search.replace(/[\s+]/g, '')
                const isPhone = /^\d{6,}$/.test(digits)
                const [first, ...rest] = isPhone ? [''] : search.trim().split(/\s+/)
                setNewClient({ firstName: first ?? '', lastName: rest.join(' '), phone: isPhone ? search.trim() : '' })
              }}
            />
          )}
        </Field>

        {/* 2. Prestations */}
        <Field label={terms.service.plural} error={submitted ? errors.services : undefined}>
          <div className="overflow-hidden rounded-lg border border-border">
            {lines.map((l, i) => (
              <div key={l.key} className="flex items-center gap-2 border-b border-border bg-surface px-2.5 py-1.5 last:border-b-0">
                <span className="size-2 shrink-0 rounded-full" style={{ background: services.find((s) => s.id === l.serviceId)?.color ?? 'var(--primary)' }} />
                <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-medium">{l.name}</span>
                <div className="relative w-[86px]">
                  <Input
                    type="number"
                    min={5}
                    step={5}
                    aria-label={t.common.duration}
                    value={l.durationMin}
                    onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, durationMin: Math.max(5, Number(e.target.value) || 5) } : x)))}
                    className="h-7 pr-9 text-xs"
                  />
                  <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[0.6875rem] text-subtle-foreground">min</span>
                </div>
                <MoneyInput value={l.price} currency={currency} onChange={(price) => setLines(lines.map((x, j) => (j === i ? { ...x, price } : x)))} className="w-[118px] [&_input]:h-7 [&_input]:text-xs" />
                <button type="button" aria-label="Retirer" onClick={() => setLines(lines.filter((_, j) => j !== i))} className="flex size-7 items-center justify-center rounded-md text-subtle-foreground hover:bg-danger-soft hover:text-danger">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
            <Menu>
              <MenuTrigger asChild>
                <button type="button" className={cn('flex h-9 w-full items-center gap-2 bg-surface-2/50 px-3 text-[0.8125rem] font-medium text-primary hover:bg-surface-2', submitted && errors.services && 'text-danger')}>
                  <Plus className="size-4" /> {lines.length ? `Ajouter ${terms.service.a}` : `Choisir ${terms.service.a}`}
                </button>
              </MenuTrigger>
              <MenuContent align="start" className="max-h-[340px] w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto">
                {groupedServices.length === 0 ? <div className="px-2 py-3 text-xs text-muted-foreground">{t.services.empty}</div> : null}
                {groupedServices.map((g) => (
                  <div key={g.name}>
                    <MenuLabel>{g.name}</MenuLabel>
                    {g.items.map((s) => (
                      <MenuItem key={s.id} onSelect={() => addService(s.id)}>
                        <span className="size-2 rounded-full" style={{ background: s.color ?? 'var(--primary)' }} />
                        <span className="flex-1 truncate">{s.name}</span>
                        <span className="tabular text-xs text-muted-foreground">
                          {formatDuration(s.durationMin)} · {formatMoney(s.price, currency)}
                        </span>
                      </MenuItem>
                    ))}
                  </div>
                ))}
              </MenuContent>
            </Menu>
          </div>
        </Field>

        {/* 3–5. Équipe, date, heure */}
        <div className={cn('grid gap-3', resourcesActive ? 'grid-cols-[1fr_1fr_150px_110px]' : 'grid-cols-[1fr_150px_110px]')}>
          <Field label={terms.staff.singular} error={submitted ? errors.staff : undefined}>
            <Select value={staffId} onChange={(v) => { setStaffId(v); setConflicts(null) }} options={staffList.map((s) => ({ value: s.id, label: <span className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: s.color }} />{s.name}</span> }))} />
          </Field>
          {resourcesActive ? (
            <Field label={terms.resource.singular}>
              <Select
                value={resourceId || '__none'}
                onChange={(v) => setResourceId(v === '__none' ? '' : v)}
                options={[{ value: '__none', label: t.appointment.noResource }, ...resources.filter((r) => r.active).map((r) => ({ value: r.id, label: r.name }))]}
              />
            </Field>
          ) : null}
          <Field label={t.common.date}>
            <Input type="date" value={date} onChange={(e) => { setDate(e.target.value); setConflicts(null) }} required />
          </Field>
          <Field label={t.common.time} error={submitted ? errors.time : undefined}>
            <Input type="time" step={300} value={time} onChange={(e) => { setTime(e.target.value); setConflicts(null) }} aria-invalid={submitted && Boolean(errors.time)} />
          </Field>
        </div>

        {/* Créneaux */}
        {!draft.walkIn ? (
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-medium text-muted-foreground">{t.appointment.availableSlots}</span>
              {startAt && endAt ? (
                <span className="tabular flex items-center gap-1 text-muted-foreground">
                  <Clock className="size-3" /> {formatTime(startAt)} – {formatTime(endAt)} · {formatDuration(durationMin)}
                </span>
              ) : null}
            </div>
            {slots.data && slots.data.length === 0 ? (
              <div className="rounded-md bg-surface-2 px-3 py-2 text-xs text-muted-foreground">{t.appointment.noSlots}</div>
            ) : (
              <div className="flex max-h-[96px] flex-wrap gap-1.5 overflow-y-auto pr-1">
                {(slots.data ?? []).map((s) => {
                  const label = formatTime(s)
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => { setTime(label); setConflicts(null) }}
                      className={cn(
                        'tabular h-7 rounded-md border px-2.5 text-xs font-medium transition-colors',
                        time === label ? 'border-primary bg-primary text-white' : 'border-border bg-surface hover:border-primary/50 hover:text-primary'
                      )}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        ) : null}

        {liveBlocking.length && !conflicts ? (
          <div className="flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">
            <Ban className="mt-px size-3.5 shrink-0" />
            <div>{liveBlocking.map((c) => <div key={c.code + c.message}>{c.message}</div>)}</div>
          </div>
        ) : null}

        {/* 6–9. Prix, remise, statut, paiement */}
        <div className="grid grid-cols-[1fr_1fr_1.2fr] gap-3">
          <Field label={t.appointment.discount}>
            <MoneyInput value={discount} currency={currency} onChange={setDiscount} />
          </Field>
          <Field label={t.common.status}>
            <Select
              value={status}
              onChange={(v) => setStatus(v as AppointmentStatus)}
              options={(isEdit ? APPOINTMENT_STATUSES : (['pending', 'confirmed', 'arrived', 'in_progress', 'completed'] as AppointmentStatus[])).map((s) => ({ value: s, label: t.status[s] }))}
            />
          </Field>
          <div className="flex flex-col justify-end rounded-lg bg-surface-2 px-3 py-1.5">
            <div className="flex items-baseline justify-between text-xs text-muted-foreground">
              <span>{t.common.total}</span>
              {totals.discount ? <span className="tabular line-through">{formatMoney(totals.subtotal, currency)}</span> : null}
            </div>
            <div className="tabular text-right text-lg leading-tight font-semibold">{formatMoney(totals.total, currency)}</div>
          </div>
        </div>

        {!isEdit && totals.total > 0 ? (
          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border px-3 py-2.5">
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">{t.appointment.payment}</div>
              <Segmented<PayMode>
                value={payMode}
                onChange={setPayMode}
                options={[
                  { value: 'none', label: t.appointment.paymentNone },
                  { value: 'full', label: t.appointment.paymentFull },
                  { value: 'partial', label: t.appointment.paymentPartial }
                ]}
              />
            </div>
            {payMode === 'partial' ? (
              <Field label={t.payments.amount} error={submitted ? errors.payment : undefined} className="w-[130px]">
                <MoneyInput value={payAmount} currency={currency} onChange={setPayAmount} invalid={submitted && Boolean(errors.payment)} />
              </Field>
            ) : null}
            {payMode !== 'none' ? (
              <Field label={t.payments.method} className="w-[150px]">
                <Select value={payMethod} onChange={(v) => setPayMethod(v as PaymentMethod)} options={PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }))} />
              </Field>
            ) : null}
          </div>
        ) : null}

        {/* 10. Rappel & récurrence (Pro) */}
        <div className="divide-y divide-border rounded-lg border border-border">
          <div className="flex items-center gap-3 px-3 py-2.5">
            <Bell className="size-4 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[0.8125rem] font-medium">
                {t.appointment.reminder} {!isPro ? <ProBadge /> : null}
              </div>
              <div className="text-xs text-muted-foreground">
                {isPro && wa && wa.status !== 'ready' ? 'WhatsApp non connecté : le rappel partira dès la reconnexion.' : t.appointment.reminderHint}
              </div>
            </div>
            {reminderEnabled && isPro ? (
              <Select
                size="sm"
                className="w-[150px]"
                value={String(reminderOffset)}
                onChange={(v) => setReminderOffset(Number(v))}
                options={REMINDER_OFFSETS.map((o) => ({ value: String(o.minutes), label: o.label }))}
              />
            ) : null}
            <Switch checked={isPro && reminderEnabled} onCheckedChange={(v) => gate('whatsappReminders', () => setReminderEnabled(v))} aria-label={t.appointment.reminder} />
          </div>
          {isPro && !isEdit ? (
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-[0.8125rem]">
              <Checkbox checked={sendConfirmation} onCheckedChange={(v) => setSendConfirmation(v === true)} />
              {t.appointment.sendConfirmation}
            </label>
          ) : null}
          {!isEdit && !draft.walkIn ? (
            <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <Repeat className="size-4 text-muted-foreground" />
              <div className="flex items-center gap-2 text-[0.8125rem] font-medium">
                {t.appointment.recurrence} {!isPro ? <ProBadge /> : null}
              </div>
              <Select
                size="sm"
                className="ml-auto w-[190px]"
                value={recurrence}
                onChange={(v) => {
                  if (v === 'none') setRecurrence('none')
                  else gate('recurringAppointments', () => setRecurrence(v as RecurrenceFrequency))
                }}
                options={[
                  { value: 'none', label: t.appointment.recurrenceNone },
                  ...(Object.keys(FREQUENCY_LABELS) as RecurrenceFrequency[]).map((f) => ({ value: f, label: FREQUENCY_LABELS[f] }))
                ]}
              />
              {recurrence !== 'none' ? (
                <div className="flex w-full items-center gap-2 pl-7">
                  <Segmented<'count' | 'until'>
                    size="sm"
                    value={recurrenceEnd}
                    onChange={setRecurrenceEnd}
                    options={[
                      { value: 'count', label: t.appointment.occurrences },
                      { value: 'until', label: t.appointment.until }
                    ]}
                  />
                  {recurrenceEnd === 'count' ? (
                    <Input type="number" min={2} max={104} value={recurrenceCount} onChange={(e) => setRecurrenceCount(Math.min(104, Math.max(2, Number(e.target.value) || 2)))} className="h-7 w-20" />
                  ) : (
                    <Input type="date" value={recurrenceUntil} onChange={(e) => setRecurrenceUntil(e.target.value)} className="h-7 w-[150px]" />
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* 11. Notes */}
        <Field label={t.appointment.notes} optional>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t.appointment.notesPlaceholder} rows={2} />
        </Field>

        {conflicts ? (
          <div role="alert" className={cn('rounded-lg border px-3.5 py-3', blockingConflicts.length ? 'border-danger/30 bg-danger-soft' : 'border-warning/30 bg-warning-soft')}>
            <div className={cn('flex items-center gap-2 text-[0.8125rem] font-semibold', blockingConflicts.length ? 'text-danger' : 'text-warning')}>
              {blockingConflicts.length ? <Lock className="size-4" /> : <AlertTriangle className="size-4" />}
              {blockingConflicts.length ? t.errors.slotUnavailable : t.appointment.warningsTitle}
            </div>
            {conflicts.occurrence !== undefined ? <div className="mt-1 text-xs">{t.appointment.occurrenceConflict(conflicts.occurrence + 1)}</div> : null}
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs text-foreground/80">
              {conflicts.list.map((c, i) => (
                <li key={i}>{c.message}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2 border-t border-border bg-surface-2/50 px-5 py-3">
        <span className="hidden items-center gap-1 text-[0.6875rem] text-subtle-foreground md:flex">
          <Kbd>Ctrl</Kbd>
          <Kbd>Entrée</Kbd> pour enregistrer
        </span>
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            {t.common.cancel}
          </Button>
          {conflicts && !blockingConflicts.length ? (
            <Button type="button" variant="secondary" onClick={() => submit(true)} loading={save.isPending}>
              {t.appointment.saveAnyway}
            </Button>
          ) : null}
          <Button type="submit" variant="primary" loading={save.isPending} disabled={Boolean(conflicts && blockingConflicts.length)}>
            {t.common.save}
          </Button>
        </div>
      </div>
    </form>
  )
}
