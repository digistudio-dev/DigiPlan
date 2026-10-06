// Prestations / services : catégories, durées, prix, temps tampons, équipe.

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { FolderPlus, MoreHorizontal, Pencil, Plus, Tag, Trash2, Clock } from 'lucide-react'
import { toast } from 'sonner'
import type { ServiceDto } from '@shared/types'
import { SERVICE_COLORS } from '@shared/constants'
import { formatDuration } from '@shared/format'
import { api, errorMessage } from '@/lib/api'
import { useCatalog, useStaffList } from '@/lib/queries'
import { useApp } from '@/hooks/useApp'
import { cn } from '@/lib/utils'
import { requiredText } from '@/lib/validation'
import { t } from '@/i18n'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Textarea } from '@/components/ui/input'
import { Avatar, Checkbox, ColorSwatches, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Skeleton, Switch } from '@/components/ui/primitives'
import { EmptyState, Money, MoneyInput, PageHeader, Select } from '@/components/common'
import { confirm } from '@/components/confirm'

export default function ServicesPage() {
  const { terms, currency } = useApp()
  const [showInactive, setShowInactive] = useState(false)
  const { data, isLoading } = useCatalog(true)
  const [editing, setEditing] = useState<ServiceDto | 'new' | null>(null)
  const [newCategoryFor, setNewCategoryFor] = useState<string | null>(null)
  const [categoryDialog, setCategoryDialog] = useState<{ id?: string; name: string } | null>(null)

  const toggle = useMutation({
    mutationFn: (s: ServiceDto) => api('services.save', { ...s, active: !s.active }),
    onError: (e) => toast.error(errorMessage(e))
  })
  const removeService = async (s: ServiceDto) => {
    if (!(await confirm({ title: `Supprimer « ${s.name} » ?`, body: t.services.archivedInfo, confirmLabel: t.common.delete }))) return
    try {
      const r = await api('services.delete', { id: s.id })
      toast.success(r.archived ? 'Archivé (historique conservé)' : t.common.deleted)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }
  const removeCategory = async (id: string, name: string) => {
    if (!(await confirm({ title: `${t.services.deleteCategory} « ${name} » ?`, body: t.services.deleteCategoryBody, confirmLabel: t.common.delete }))) return
    await api('serviceCategories.delete', { id }).catch((e) => toast.error(errorMessage(e)))
  }

  const services = (data?.services ?? []).filter((s) => showInactive || s.active)
  const groups = [
    ...(data?.categories ?? []).map((c) => ({ id: c.id, name: c.name, items: services.filter((s) => s.categoryId === c.id) })),
    { id: '', name: t.services.uncategorized, items: services.filter((s) => !s.categoryId || !data?.categories.some((c) => c.id === s.categoryId)) }
  ].filter((g) => g.id || g.items.length)

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={terms.service.plural}
        subtitle={`${(data?.services ?? []).filter((s) => s.active).length} ${terms.service.lowerPlural} actifs`}
        actions={
          <>
            <label className="mr-2 flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={showInactive} onCheckedChange={setShowInactive} /> {t.services.showInactive}
            </label>
            <Button onClick={() => setCategoryDialog({ name: '' })}>
              <FolderPlus /> {t.services.newCategory}
            </Button>
            <Button variant="primary" onClick={() => setEditing('new')}>
              <Plus /> {terms.service.newLabel}
            </Button>
          </>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {isLoading ? (
          <Skeleton className="h-64" />
        ) : !data?.services.length ? (
          <EmptyState
            icon={<Tag />}
            title={`${terms.service.none} pour le moment`}
            description={`Créez vos ${terms.service.lowerPlural} avec leur durée et leur prix pour planifier vos rendez-vous.`}
            action={
              <Button variant="primary" onClick={() => setEditing('new')}>
                <Plus /> {terms.service.newLabel}
              </Button>
            }
          />
        ) : (
          <div className="mx-auto max-w-[1080px] space-y-5">
            {groups.map((g) => (
              <section key={g.id || 'none'} className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
                <header className="group flex h-11 items-center justify-between border-b border-border bg-surface-2/40 px-4">
                  <div className="text-[0.8125rem] font-semibold">
                    {g.name} <span className="ml-1 font-normal text-subtle-foreground">{g.items.length}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => { setNewCategoryFor(g.id || null); setEditing('new') }}>
                      <Plus /> {t.common.add}
                    </Button>
                    {g.id ? (
                      <Menu>
                        <MenuTrigger asChild>
                          <Button size="icon-sm" variant="ghost" aria-label={t.common.more}>
                            <MoreHorizontal />
                          </Button>
                        </MenuTrigger>
                        <MenuContent>
                          <MenuItem onSelect={() => setCategoryDialog({ id: g.id, name: g.name })}>
                            <Pencil /> {t.services.renameCategory}
                          </MenuItem>
                          <MenuItem danger onSelect={() => void removeCategory(g.id, g.name)}>
                            <Trash2 /> {t.services.deleteCategory}
                          </MenuItem>
                        </MenuContent>
                      </Menu>
                    ) : null}
                  </div>
                </header>
                {g.items.length === 0 ? (
                  <div className="px-4 py-4 text-xs text-subtle-foreground">{t.services.empty}</div>
                ) : (
                  <ul className="divide-y divide-border">
                    {g.items.map((s) => (
                      <li key={s.id} className={cn('group flex items-center gap-4 px-4 py-2.5', !s.active && 'opacity-55')}>
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color ?? 'var(--border-strong)' }} />
                        <button type="button" onClick={() => setEditing(s)} className="min-w-0 flex-1 text-left">
                          <div className="truncate text-[0.8125rem] font-medium">{s.name}</div>
                          {s.description ? <div className="truncate text-xs text-muted-foreground">{s.description}</div> : null}
                        </button>
                        <span className="tabular flex w-[110px] items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="size-3" />
                          {formatDuration(s.durationMin)}
                          {s.bufferBeforeMin || s.bufferAfterMin ? <span className="text-subtle-foreground">+{s.bufferBeforeMin + s.bufferAfterMin}</span> : null}
                        </span>
                        <Money cents={s.price} currency={currency} className="w-[100px] text-right text-[0.8125rem] font-medium" />
                        <Switch checked={s.active} onCheckedChange={() => toggle.mutate(s)} aria-label={s.active ? t.common.active : t.common.inactive} />
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
                            <MenuItem danger onSelect={() => void removeService(s)}>
                              <Trash2 /> {t.common.delete}
                            </MenuItem>
                          </MenuContent>
                        </Menu>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        )}
      </div>

      {editing ? (
        <ServiceDialog
          service={editing === 'new' ? null : editing}
          defaultCategoryId={newCategoryFor}
          onClose={() => {
            setEditing(null)
            setNewCategoryFor(null)
          }}
        />
      ) : null}
      {categoryDialog ? <CategoryDialog initial={categoryDialog} onClose={() => setCategoryDialog(null)} /> : null}
    </div>
  )
}

function CategoryDialog({ initial, onClose }: { initial: { id?: string; name: string }; onClose: () => void }) {
  const [name, setName] = useState(initial.name)
  const save = useMutation({
    mutationFn: () => api('serviceCategories.save', { id: initial.id, name }),
    onSuccess: onClose,
    onError: (e) => toast.error(errorMessage(e))
  })
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title={initial.id ? t.services.renameCategory : t.services.newCategory}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" disabled={!name.trim()} loading={save.isPending} onClick={() => save.mutate()}>
            {t.common.save}
          </Button>
        </>
      }
    >
      <form onSubmit={(e) => (e.preventDefault(), name.trim() && save.mutate())}>
        <Field label={t.services.categoryName} htmlFor="cat-name">
          <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  )
}

const schema = z.object({
  name: requiredText(120),
  description: z.string().max(1000),
  categoryId: z.string(),
  durationMin: z.number({ message: 'Durée invalide.' }).int().min(5, 'Minimum 5 minutes.').max(1440),
  price: z.number().int().min(0),
  color: z.string().nullable(),
  bufferBeforeMin: z.number().int().min(0).max(240),
  bufferAfterMin: z.number().int().min(0).max(240),
  active: z.boolean()
})
type Form = z.infer<typeof schema>

function ServiceDialog({ service, defaultCategoryId, onClose }: { service: ServiceDto | null; defaultCategoryId: string | null; onClose: () => void }) {
  const { terms, currency, category } = useApp()
  const { data } = useCatalog(true)
  const { data: staff = [] } = useStaffList()
  const [staffIds, setStaffIds] = useState<string[]>(service?.staffIds ?? [])
  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: service?.name ?? '',
      description: service?.description ?? '',
      categoryId: service?.categoryId ?? defaultCategoryId ?? '',
      durationMin: service?.durationMin ?? category.defaultAppointmentDurationMin,
      price: service?.price ?? 0,
      color: service?.color ?? SERVICE_COLORS[(data?.services.length ?? 0) % SERVICE_COLORS.length],
      bufferBeforeMin: service?.bufferBeforeMin ?? 0,
      bufferAfterMin: service?.bufferAfterMin ?? 0,
      active: service?.active ?? true
    }
  })
  const e = form.formState.errors
  const save = useMutation({
    mutationFn: (v: Form) => api('services.save', { ...v, id: service?.id, categoryId: v.categoryId || null, staffIds }),
    onSuccess: () => {
      toast.success(service ? t.common.saved : `${terms.service.singular} créé${terms.service.feminine ? 'e' : ''}`)
      onClose()
    },
    onError: (err) => toast.error(errorMessage(err, t.errors.save))
  })

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={service ? `Modifier « ${service.name} »` : terms.service.newLabel}
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
      <form className="space-y-4" onSubmit={form.handleSubmit((v) => save.mutate(v))}>
        <div className="grid grid-cols-[1fr_200px] gap-3">
          <Field label={t.common.name} htmlFor="sv-name" error={e.name?.message}>
            <Input id="sv-name" {...form.register('name')} aria-invalid={Boolean(e.name)} />
          </Field>
          <Field label={t.common.category}>
            <Select
              value={form.watch('categoryId') || '__none'}
              onChange={(v) => form.setValue('categoryId', v === '__none' ? '' : v)}
              options={[{ value: '__none', label: t.services.uncategorized }, ...(data?.categories ?? []).map((c) => ({ value: c.id, label: c.name }))]}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`${t.common.duration} (minutes)`} htmlFor="sv-dur" error={e.durationMin?.message}>
            <Input id="sv-dur" type="number" min={5} step={5} {...form.register('durationMin', { valueAsNumber: true })} aria-invalid={Boolean(e.durationMin)} />
          </Field>
          <Field label={t.common.price}>
            <MoneyInput value={form.watch('price')} currency={currency} onChange={(v) => form.setValue('price', v)} />
          </Field>
          <Field label={`${t.services.bufferBefore} (min)`} htmlFor="sv-bb" hint={t.services.bufferHint}>
            <Input id="sv-bb" type="number" min={0} step={5} {...form.register('bufferBeforeMin', { valueAsNumber: true })} />
          </Field>
          <Field label={`${t.services.bufferAfter} (min)`} htmlFor="sv-ba">
            <Input id="sv-ba" type="number" min={0} step={5} {...form.register('bufferAfterMin', { valueAsNumber: true })} />
          </Field>
        </div>
        <Field label={t.common.description} htmlFor="sv-desc" optional>
          <Textarea id="sv-desc" rows={2} {...form.register('description')} />
        </Field>
        <Field label={t.common.color}>
          <ColorSwatches value={form.watch('color')} onChange={(c) => form.setValue('color', c)} colors={SERVICE_COLORS} />
        </Field>
        {staff.length > 1 ? (
          <Field label={t.services.availableStaff} hint="Aucune sélection = proposé par toute l’équipe.">
            <div className="flex flex-wrap gap-2">
              {staff.map((s) => (
                <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-[0.8125rem]">
                  <Checkbox checked={staffIds.includes(s.id)} onCheckedChange={(v) => setStaffIds(v ? [...staffIds, s.id] : staffIds.filter((x) => x !== s.id))} />
                  <Avatar name={s.name} color={s.color} size={20} /> {s.name}
                </label>
              ))}
            </div>
          </Field>
        ) : null}
        <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border px-3 py-2.5 text-[0.8125rem]">
          <span>
            <span className="font-medium">{t.common.active}</span>
            <span className="block text-xs text-muted-foreground">Proposé lors de la prise de rendez-vous</span>
          </span>
          <Switch checked={form.watch('active')} onCheckedChange={(v) => form.setValue('active', v)} />
        </label>
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}
