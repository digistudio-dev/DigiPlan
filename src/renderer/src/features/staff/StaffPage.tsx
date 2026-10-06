// Équipe : membres, horaires, pauses, prestations, commissions.

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { Clock, ImagePlus, Mail, MoreHorizontal, Pencil, Phone as PhoneIcon, Plus, Trash2, UsersRound, Percent } from 'lucide-react'
import { toast } from 'sonner'
import type { DaySchedule, StaffDto } from '@shared/types'
import { STAFF_COLORS } from '@shared/constants'
import { minutesToHHMM } from '@shared/domain/time'
import { formatPhone } from '@shared/domain/phone'
import { api, errorMessage } from '@/lib/api'
import { useCatalog, useStaffList } from '@/lib/queries'
import { useApp, useProGate } from '@/hooks/useApp'
import { cn } from '@/lib/utils'
import { optionalEmail, optionalPhone, requiredText } from '@/lib/validation'
import { t } from '@/i18n'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/input'
import { Avatar, Badge, Checkbox, ColorSwatches, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, ProBadge, Skeleton, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives'
import { EmptyState, PageHeader } from '@/components/common'
import { confirm } from '@/components/confirm'
import { WeekScheduleEditor, validateWeek } from '@/components/WeekScheduleEditor'

export default function StaffPage() {
  const { terms, isPro } = useApp()
  const gate = useProGate()
  const { data: staff = [], isLoading } = useStaffList(true)
  const [editing, setEditing] = useState<StaffDto | 'new' | null>(null)
  const activeCount = staff.filter((s) => s.active).length

  const add = () => {
    if (activeCount >= 1 && !isPro) gate('unlimitedStaff')
    else setEditing('new')
  }
  const remove = async (s: StaffDto) => {
    if (!(await confirm({ title: t.staff.deleteTitle, body: t.staff.deleteBody, confirmLabel: t.common.delete }))) return
    try {
      const r = await api('staff.delete', { id: s.id })
      toast.success(r.archived ? t.staff.archived : t.common.deleted)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={terms.staffNavLabel}
        subtitle={`${activeCount} ${activeCount > 1 ? terms.staff.lowerPlural : terms.staff.lower} actif${activeCount > 1 ? 's' : ''}${!isPro ? ' · Free : 1 membre actif' : ''}`}
        actions={
          <Button variant="primary" onClick={add}>
            <Plus /> {terms.staff.newLabel} {!isPro && activeCount >= 1 ? <ProBadge /> : null}
          </Button>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-44" />
            ))}
          </div>
        ) : staff.length === 0 ? (
          <EmptyState icon={<UsersRound />} title={`${terms.staff.none} pour le moment`} action={<Button variant="primary" onClick={add}><Plus /> {terms.staff.newLabel}</Button>} />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {staff.map((s) => (
              <article key={s.id} className={cn('group rounded-xl border border-border bg-surface p-4 shadow-sm transition-shadow hover:shadow-md', !s.active && 'opacity-60')}>
                <div className="flex items-start gap-3">
                  <Avatar name={s.name} color={s.color} src={s.avatarDataUrl} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-[0.9rem] font-semibold">{s.name}</h3>
                      {!s.active ? <Badge>{t.common.inactive}</Badge> : null}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{s.role || terms.staff.singular}</div>
                  </div>
                  <Menu>
                    <MenuTrigger asChild>
                      <Button size="icon-sm" variant="ghost" aria-label={t.common.more}>
                        <MoreHorizontal />
                      </Button>
                    </MenuTrigger>
                    <MenuContent>
                      <MenuItem onSelect={() => setEditing(s)}>
                        <Pencil /> {t.common.edit}
                      </MenuItem>
                      <MenuSeparator />
                      <MenuItem danger onSelect={() => void remove(s)}>
                        <Trash2 /> {t.common.delete}
                      </MenuItem>
                    </MenuContent>
                  </Menu>
                </div>
                <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                  {s.phone ? (
                    <div className="flex items-center gap-1.5">
                      <PhoneIcon className="size-3" /> {formatPhone(s.phone)}
                    </div>
                  ) : null}
                  {s.email ? (
                    <div className="flex items-center gap-1.5 truncate">
                      <Mail className="size-3" /> {s.email}
                    </div>
                  ) : null}
                  <div className="flex items-center gap-1.5">
                    <Clock className="size-3" /> {s.useBusinessHours ? 'Horaires de l’établissement' : summarize(s.schedule)}
                  </div>
                  {s.commissionRate ? (
                    <div className="flex items-center gap-1.5">
                      <Percent className="size-3" /> Commission {s.commissionRate} %
                    </div>
                  ) : null}
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="size-2.5 rounded-full" style={{ background: s.color }} /> Couleur agenda
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>
                    <Pencil /> {t.common.edit}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
      {editing ? <StaffDialog staff={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  )
}

function summarize(week: DaySchedule[]): string {
  const open = week.filter((d) => d.open)
  if (!open.length) return 'Aucun jour travaillé'
  const first = open[0]
  const same = open.every((d) => d.start === first.start && d.end === first.end)
  const days = open.map((d) => t.hours.weekdays[d.weekday - 1].slice(0, 3)).join(', ')
  return same ? `${days} · ${minutesToHHMM(first.start)}–${minutesToHHMM(first.end)}` : days
}

const schema = z.object({
  name: requiredText(120),
  role: z.string().trim().max(80),
  phone: optionalPhone,
  email: optionalEmail,
  color: z.string(),
  active: z.boolean(),
  commissionRate: z.number().min(0).max(100).nullable()
})
type Form = z.infer<typeof schema>

function StaffDialog({ staff, onClose }: { staff: StaffDto | null; onClose: () => void }) {
  const { terms, hours, isPro, category } = useApp()
  const gate = useProGate()
  const { data: catalog } = useCatalog()
  const { data: all = [] } = useStaffList(true)
  const [useBusinessHours, setUseBusinessHours] = useState(staff?.useBusinessHours ?? true)
  const [schedule, setSchedule] = useState<DaySchedule[]>(staff && !staff.useBusinessHours ? staff.schedule : hours.map((d) => ({ ...d, breaks: [...d.breaks] })))
  const [serviceIds, setServiceIds] = useState<string[]>(staff?.serviceIds ?? [])
  const [avatar, setAvatar] = useState<string | null>(staff?.avatarDataUrl ?? null)

  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: staff?.name ?? '',
      role: staff?.role ?? category.defaultStaffRole,
      phone: staff?.phone ? formatPhone(staff.phone) : '',
      email: staff?.email ?? '',
      color: staff?.color ?? STAFF_COLORS[all.length % STAFF_COLORS.length],
      active: staff?.active ?? true,
      commissionRate: staff?.commissionRate ?? null
    }
  })
  const e = form.formState.errors

  const save = useMutation({
    mutationFn: (v: Form) => {
      if (!useBusinessHours) {
        const err = validateWeek(schedule)
        if (err) throw new Error(err)
      }
      return api('staff.save', { id: staff?.id, ...v, avatarDataUrl: avatar, useBusinessHours, schedule, serviceIds })
    },
    onSuccess: () => {
      toast.success(staff ? t.common.saved : `${terms.staff.singular} ajouté${terms.staff.feminine ? 'e' : ''}`)
      onClose()
    },
    onError: (err) => toast.error(err instanceof Error && !('code' in err) ? err.message : errorMessage(err, t.errors.save))
  })

  const pickAvatar = async () => {
    try {
      const d = await api('logo.pick')
      if (d) setAvatar(d)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={staff ? `Modifier — ${staff.name}` : terms.staff.newLabel}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" loading={save.isPending} onClick={form.handleSubmit((v) => save.mutate(v))}>
            {t.common.save}
          </Button>
        </>
      }
    >
      <Tabs defaultValue="profile">
        <TabsList className="mb-4">
          <TabsTrigger value="profile">Profil</TabsTrigger>
          <TabsTrigger value="hours">{t.staff.schedule}</TabsTrigger>
          <TabsTrigger value="services">{terms.service.plural}</TabsTrigger>
        </TabsList>
        <TabsContent value="profile">
          <form className="space-y-4" onSubmit={form.handleSubmit((v) => save.mutate(v))}>
            <div className="flex items-center gap-4">
              <button type="button" onClick={pickAvatar} className="relative rounded-full" aria-label={t.staff.photo}>
                {avatar ? <Avatar name="" src={avatar} size={56} /> : <span className="flex size-14 items-center justify-center rounded-full border border-dashed border-border-strong bg-surface-2 text-subtle-foreground hover:text-primary"><ImagePlus className="size-5" /></span>}
              </button>
              <div className="text-xs text-muted-foreground">
                {t.staff.photo} ({t.common.optional})
                {avatar ? (
                  <button type="button" className="ml-2 text-danger hover:underline" onClick={() => setAvatar(null)}>
                    Retirer
                  </button>
                ) : null}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t.common.name} htmlFor="st-name" error={e.name?.message}>
                <Input id="st-name" {...form.register('name')} aria-invalid={Boolean(e.name)} />
              </Field>
              <Field label={t.staff.role} htmlFor="st-role">
                <Input id="st-role" {...form.register('role')} />
              </Field>
              <Field label={t.common.phone} htmlFor="st-phone" optional error={e.phone?.message}>
                <Input id="st-phone" {...form.register('phone')} aria-invalid={Boolean(e.phone)} />
              </Field>
              <Field label={t.common.email} htmlFor="st-email" optional error={e.email?.message}>
                <Input id="st-email" {...form.register('email')} aria-invalid={Boolean(e.email)} />
              </Field>
            </div>
            <Field label={t.staff.calendarColor}>
              <ColorSwatches value={form.watch('color')} onChange={(c) => form.setValue('color', c)} colors={STAFF_COLORS} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border px-3 py-2.5 text-[0.8125rem]">
                <span className="font-medium">{t.common.active}</span>
                <Switch
                  checked={form.watch('active')}
                  onCheckedChange={(v) => {
                    if (v && !isPro && all.filter((s) => s.active && s.id !== staff?.id).length >= 1) gate('unlimitedStaff')
                    else form.setValue('active', v)
                  }}
                />
              </label>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-1.5 text-[0.8125rem]">
                <span className="flex items-center gap-1.5 font-medium">
                  {t.staff.commission} {!isPro ? <ProBadge /> : null}
                </span>
                <div className="relative w-[90px]">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    disabled={!isPro}
                    value={form.watch('commissionRate') ?? ''}
                    onChange={(ev) => form.setValue('commissionRate', ev.target.value === '' ? null : Math.min(100, Math.max(0, Number(ev.target.value))))}
                    onFocus={() => !isPro && gate('commissions')}
                    className="h-7 pr-7"
                    aria-label={t.staff.commission}
                  />
                  <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-subtle-foreground">%</span>
                </div>
              </div>
            </div>
            <button type="submit" hidden />
          </form>
        </TabsContent>
        <TabsContent value="hours" className="space-y-3">
          <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border px-3 py-2.5 text-[0.8125rem]">
            <span className="font-medium">{t.staff.useBusinessHours}</span>
            <Switch checked={useBusinessHours} onCheckedChange={setUseBusinessHours} />
          </label>
          {!useBusinessHours ? <WeekScheduleEditor value={schedule} onChange={setSchedule} compact /> : <p className="px-1 text-xs text-muted-foreground">Les horaires et pauses de l’établissement s’appliquent. Désactivez pour définir des horaires personnalisés.</p>}
        </TabsContent>
        <TabsContent value="services">
          <p className="mb-3 text-xs text-muted-foreground">Aucune sélection = {terms.staff.the} propose toutes les {terms.service.lowerPlural}.</p>
          <div className="grid grid-cols-2 gap-1.5">
            {(catalog?.services ?? []).map((s) => (
              <label key={s.id} className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border px-2.5 py-2 text-[0.8125rem] hover:bg-surface-2">
                <Checkbox checked={serviceIds.includes(s.id)} onCheckedChange={(v) => setServiceIds(v ? [...serviceIds, s.id] : serviceIds.filter((x) => x !== s.id))} />
                <span className="truncate">{s.name}</span>
              </label>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </Dialog>
  )
}
