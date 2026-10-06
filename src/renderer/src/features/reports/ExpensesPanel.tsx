// Dépenses (Pro) : saisie et liste sur la période sélectionnée.

import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Download, MoreHorizontal, Pencil, Plus, Receipt, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { ExpenseDto, PaymentMethod } from '@shared/types'
import { formatDateShort, fromIsoDate, toIsoDate } from '@shared/format'
import { formatMoney } from '@shared/domain/money'
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from '@shared/status'
import { api, errorMessage } from '@/lib/api'
import { useApp } from '@/hooks/useApp'
import { t } from '@/i18n'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Textarea } from '@/components/ui/input'
import { Badge, Card, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Skeleton } from '@/components/ui/primitives'
import { EmptyState, Money, MoneyInput, Select } from '@/components/common'
import { confirm } from '@/components/confirm'

export function ExpensesPanel({ from, to }: { from: string; to: string }) {
  const { currency } = useApp()
  const [editing, setEditing] = useState<ExpenseDto | 'new' | null>(null)
  const { data = [], isLoading } = useQuery({ queryKey: ['expenses', from, to], queryFn: () => api('expenses.list', { from, to }) })
  const total = data.reduce((s, e) => s + e.amount, 0)

  const remove = async (e: ExpenseDto) => {
    if (!(await confirm({ title: t.expenses.deleteTitle, body: t.expenses.deleteBody, confirmLabel: t.common.delete }))) return
    await api('expenses.delete', { id: e.id }).catch((err) => toast.error(errorMessage(err)))
  }
  const exportCsv = async () => {
    try {
      const r = await api('export.csv', { kind: 'expenses', from, to })
      if (r.saved) toast.success(`${r.rows} dépenses exportées`)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <div className="text-[0.875rem] font-semibold">{t.expenses.title}</div>
          <div className="tabular text-xs text-muted-foreground">Total de la période : {formatMoney(total, currency)}</div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={exportCsv}>
            <Download /> CSV
          </Button>
          <Button size="sm" variant="primary" onClick={() => setEditing('new')}>
            <Plus /> {t.expenses.new}
          </Button>
        </div>
      </div>
      {isLoading ? (
        <Skeleton className="m-4 h-32" />
      ) : data.length === 0 ? (
        <EmptyState compact icon={<Receipt />} title={t.expenses.empty} />
      ) : (
        <ul className="divide-y divide-border">
          {data.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-4 py-2.5 text-[0.8125rem]">
              <span className="tabular w-[84px] text-xs text-muted-foreground">{formatDateShort(fromIsoDate(e.date))}</span>
              <Badge>{e.category}</Badge>
              <span className="min-w-0 flex-1 truncate">{e.description || <span className="text-subtle-foreground">—</span>}</span>
              <span className="text-xs text-muted-foreground">{PAYMENT_METHOD_LABELS[e.method]}</span>
              <Money cents={e.amount} currency={currency} className="w-[100px] text-right font-medium" />
              <Menu>
                <MenuTrigger asChild>
                  <Button size="icon-sm" variant="ghost" aria-label={t.common.more}>
                    <MoreHorizontal />
                  </Button>
                </MenuTrigger>
                <MenuContent>
                  <MenuItem onSelect={() => setEditing(e)}>
                    <Pencil /> {t.common.edit}
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem danger onSelect={() => void remove(e)}>
                    <Trash2 /> {t.common.delete}
                  </MenuItem>
                </MenuContent>
              </Menu>
            </li>
          ))}
        </ul>
      )}
      {editing ? <ExpenseDialog expense={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </Card>
  )
}

function ExpenseDialog({ expense, onClose }: { expense: ExpenseDto | null; onClose: () => void }) {
  const { category, currency } = useApp()
  const [v, setV] = useState({
    category: expense?.category ?? category.expenseCategories[0],
    amount: expense?.amount ?? 0,
    description: expense?.description ?? '',
    date: expense?.date ?? toIsoDate(Date.now()),
    method: (expense?.method ?? 'cash') as PaymentMethod,
    notes: expense?.notes ?? ''
  })
  const [submitted, setSubmitted] = useState(false)
  const save = useMutation({
    mutationFn: () => api('expenses.save', { id: expense?.id, ...v }),
    onSuccess: () => {
      toast.success(t.common.saved)
      onClose()
    },
    onError: (e) => toast.error(errorMessage(e, t.errors.save))
  })
  const submit = () => {
    setSubmitted(true)
    if (v.amount > 0 && v.category.trim()) save.mutate()
  }
  const categories = [...new Set([...category.expenseCategories, v.category])]
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title={expense ? 'Modifier la dépense' : t.expenses.new}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" onClick={submit} loading={save.isPending}>
            {t.common.save}
          </Button>
        </>
      }
    >
      <form className="space-y-3" onSubmit={(e) => (e.preventDefault(), submit())}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.payments.amount} error={submitted && v.amount <= 0 ? t.validation.amount : undefined}>
            <MoneyInput value={v.amount} onChange={(amount) => setV({ ...v, amount })} currency={currency} invalid={submitted && v.amount <= 0} autoFocus />
          </Field>
          <Field label={t.common.date}>
            <Input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
          </Field>
          <Field label={t.common.category}>
            <Select value={v.category} onChange={(category) => setV({ ...v, category })} options={categories.map((c) => ({ value: c, label: c }))} />
          </Field>
          <Field label={t.payments.method}>
            <Select value={v.method} onChange={(m) => setV({ ...v, method: m as PaymentMethod })} options={PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }))} />
          </Field>
        </div>
        <Field label={t.common.description} optional>
          <Input value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
        </Field>
        <Field label={t.common.notes} optional>
          <Textarea rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />
        </Field>
      </form>
    </Dialog>
  )
}
