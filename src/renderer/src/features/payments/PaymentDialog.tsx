// Encaissement : lié à un rendez-vous (solde), ou paiement libre pour un client.

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Banknote, CreditCard, Landmark, MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import type { PaymentMethod } from '@shared/types'
import { formatDateTime } from '@shared/format'
import { formatMoney } from '@shared/domain/money'
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from '@shared/status'
import { api, errorMessage } from '@/lib/api'
import { useApp } from '@/hooks/useApp'
import { useUi } from '@/stores/ui'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/common'
import { ClientPicker, type PickedClient } from '../clients/ClientPicker'

const METHOD_ICONS: Record<PaymentMethod, typeof Banknote> = { cash: Banknote, card: CreditCard, transfer: Landmark, other: MoreHorizontal }

export function PaymentDialog() {
  const ctx = useUi((s) => s.paymentDialog)
  const close = useUi((s) => s.closePayment)
  const [key, setKey] = useState(0)
  useEffect(() => {
    if (ctx) setKey((k) => k + 1)
  }, [ctx])
  return (
    <Dialog open={ctx !== null} onOpenChange={(o) => !o && close()} title={t.payments.collect} size="md" bodyClassName="p-0">
      {ctx ? <PaymentForm key={key} initialAppointmentId={ctx.appointmentId} initialClientId={ctx.clientId} onDone={close} /> : null}
    </Dialog>
  )
}

function PaymentForm({ initialAppointmentId, initialClientId, onDone }: { initialAppointmentId?: string; initialClientId?: string; onDone: () => void }) {
  const { currency, terms } = useApp()
  const openReceipt = useUi((s) => s.openReceipt)
  const [client, setClient] = useState<PickedClient | null>(null)
  const [appointmentId, setAppointmentId] = useState<string | 'free' | null>(initialAppointmentId ?? null)
  const [amount, setAmount] = useState(0)
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [note, setNote] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const { data: appointment } = useQuery({
    queryKey: ['appointment', initialAppointmentId],
    queryFn: () => api('appointments.get', { id: initialAppointmentId! }),
    enabled: Boolean(initialAppointmentId)
  })
  const clientId = appointment?.clientId ?? client?.id ?? initialClientId ?? null
  useEffect(() => {
    if (initialClientId && !client) void api('clients.get', { id: initialClientId }).then((c) => setClient({ id: c.id, name: `${c.firstName} ${c.lastName}`.trim(), phone: c.phone }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialClientId])

  const { data: history } = useQuery({
    queryKey: ['client', clientId, 'history'],
    queryFn: () => api('clients.history', { id: clientId! }),
    enabled: Boolean(clientId) && !initialAppointmentId
  })
  const open = useMemo(() => (history?.appointments ?? []).filter((a) => a.balance > 0 && a.status !== 'cancelled' && a.status !== 'no_show'), [history])

  // Sélection par défaut du rendez-vous le plus récent avec un solde.
  useEffect(() => {
    if (!initialAppointmentId && history && appointmentId === null) setAppointmentId(open[0]?.id ?? 'free')
  }, [history, open, appointmentId, initialAppointmentId])

  const selected = appointment ?? open.find((a) => a.id === appointmentId) ?? null
  useEffect(() => {
    if (selected) setAmount(selected.balance)
  }, [selected])

  const save = useMutation({
    mutationFn: () =>
      api('payments.create', {
        appointmentId: selected?.id ?? null,
        clientId,
        amount,
        method,
        note: note.trim()
      }),
    onSuccess: (p) => {
      toast.success(`${t.payments.recorded} — ${formatMoney(p.amount, currency)}`, {
        description: `Reçu ${p.receiptNumber}`,
        action: { label: t.payments.viewReceipt, onClick: () => openReceipt(p.id) }
      })
      onDone()
    },
    onError: (e) => toast.error(errorMessage(e, t.errors.save))
  })

  const errors = {
    client: !clientId ? t.validation.required : undefined,
    amount: amount <= 0 ? t.validation.amount : undefined,
    note: appointmentId === 'free' && !note.trim() ? 'Indiquez l’objet du paiement.' : undefined
  }
  const overpay = selected && amount > selected.balance
  const submit = () => {
    setSubmitted(true)
    if (Object.values(errors).some(Boolean)) return
    save.mutate()
  }

  return (
    <form onSubmit={(e) => (e.preventDefault(), submit())}>
      <div className="space-y-4 px-5 pt-1 pb-5">
        {!initialAppointmentId ? (
          <Field label={terms.client.singular} error={submitted ? errors.client : undefined}>
            <ClientPicker value={client} onChange={(c) => { setClient(c); setAppointmentId(null) }} autoFocus={!initialClientId} invalid={submitted && Boolean(errors.client)} />
          </Field>
        ) : null}

        {appointment ? (
          <div className="rounded-lg border border-border bg-surface-2/50 px-3.5 py-3">
            <div className="text-[0.8125rem] font-medium">{appointment.clientName}</div>
            <div className="text-xs text-muted-foreground">
              {appointment.services.map((s) => s.name).join(' + ')} · {formatDateTime(appointment.startAt)}
            </div>
            <div className="tabular mt-2 flex gap-4 text-xs">
              <span>
                {t.common.total} <b>{formatMoney(appointment.total, currency)}</b>
              </span>
              <span>
                {t.common.paid} <b>{formatMoney(appointment.paid, currency)}</b>
              </span>
              <span className="text-warning">
                {t.common.remaining} <b>{formatMoney(appointment.balance, currency)}</b>
              </span>
            </div>
          </div>
        ) : clientId ? (
          <Field label={t.payments.linkedAppointment}>
            <div className="space-y-1.5">
              {open.map((a) => (
                <label key={a.id} className={cn('flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-[0.8125rem]', appointmentId === a.id ? 'border-primary bg-primary-soft/40' : 'border-border hover:bg-surface-2')}>
                  <input type="radio" name="appt" className="accent-[var(--primary)]" checked={appointmentId === a.id} onChange={() => setAppointmentId(a.id)} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{a.services.map((s) => s.name).join(' + ')}</div>
                    <div className="text-xs text-muted-foreground">{formatDateTime(a.startAt)}</div>
                  </div>
                  <span className="tabular text-xs font-medium text-warning">{formatMoney(a.balance, currency)}</span>
                </label>
              ))}
              <label className={cn('flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-[0.8125rem]', appointmentId === 'free' ? 'border-primary bg-primary-soft/40' : 'border-border hover:bg-surface-2')}>
                <input type="radio" name="appt" className="accent-[var(--primary)]" checked={appointmentId === 'free'} onChange={() => { setAppointmentId('free'); setAmount(0) }} />
                <div>
                  <div className="font-medium">{t.payments.standalone}</div>
                  <div className="text-xs text-muted-foreground">{open.length ? 'Acompte, produit, forfait…' : t.payments.noOpenAppointments}</div>
                </div>
              </label>
            </div>
          </Field>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Field label={t.payments.amount} error={submitted ? errors.amount : overpay ? t.payments.tooMuch : undefined}>
            <MoneyInput value={amount} onChange={setAmount} currency={currency} invalid={submitted && Boolean(errors.amount)} autoFocus={Boolean(initialAppointmentId)} />
          </Field>
          {selected && amount !== selected.balance ? (
            <div className="flex items-end">
              <Button type="button" size="sm" variant="ghost" onClick={() => setAmount(selected.balance)}>
                {t.payments.fullAmount} ({formatMoney(selected.balance, currency)})
              </Button>
            </div>
          ) : null}
        </div>

        <Field label={t.payments.method}>
          <div className="grid grid-cols-4 gap-2" role="radiogroup">
            {PAYMENT_METHODS.map((m) => {
              const Icon = METHOD_ICONS[m]
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={method === m}
                  onClick={() => setMethod(m)}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-xs font-medium transition-colors',
                    method === m ? 'border-primary bg-primary-soft/50 text-primary-soft-foreground' : 'border-border text-muted-foreground hover:bg-surface-2'
                  )}
                >
                  <Icon className="size-4" />
                  {PAYMENT_METHOD_LABELS[m]}
                </button>
              )
            })}
          </div>
        </Field>

        <Field label={t.payments.note} optional={appointmentId !== 'free'} error={submitted ? errors.note : undefined}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={appointmentId === 'free' ? 'Ex. Acompte, vente de produit…' : ''} />
        </Field>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border bg-surface-2/50 px-5 py-3">
        <span className="tabular text-[0.8125rem] text-muted-foreground">
          À encaisser : <b className="text-foreground">{formatMoney(amount, currency)}</b>
        </span>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            {t.common.cancel}
          </Button>
          <Button type="submit" variant="primary" loading={save.isPending}>
            {t.payments.collect}
          </Button>
        </div>
      </div>
    </form>
  )
}
