// Création / modification d'une fiche client ou patient.

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertTriangle, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { formatPhone, normalizePhone } from '@shared/domain/phone'
import { api, errorMessage } from '@/lib/api'
import { useTags } from '@/lib/queries'
import { useApp } from '@/hooks/useApp'
import { useUi } from '@/stores/ui'
import { optionalEmail, optionalPhone, requiredText } from '@/lib/validation'
import { t } from '@/i18n'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/input'
import { Checkbox, Segmented } from '@/components/ui/primitives'

const schema = z.object({
  firstName: requiredText(80),
  lastName: z.string().trim().max(80),
  phone: optionalPhone,
  whatsappPhone: optionalPhone,
  email: optionalEmail,
  birthDate: z.string(),
  gender: z.enum(['', 'male', 'female']),
  address: z.string().trim().max(300),
  insurance: z.string().trim().max(120),
  notes: z.string().max(5000)
})
type Form = z.infer<typeof schema>

export function ClientFormDialog() {
  const state = useUi((s) => s.clientForm)
  const close = useUi((s) => s.closeClientForm)
  const { terms } = useApp()
  const { data: existing, isLoading } = useQuery({
    queryKey: ['client', state?.id],
    queryFn: () => api('clients.get', { id: state!.id! }),
    enabled: Boolean(state?.id)
  })
  const open = state !== null
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()} title={state?.id ? `Modifier la fiche` : terms.client.newLabel} size="md" bodyClassName="p-0">
      {open && (!state?.id || (!isLoading && existing)) ? <ClientForm key={state?.id ?? 'new'} existing={existing ?? null} onDone={close} /> : <div className="h-80" />}
    </Dialog>
  )
}

function ClientForm({ existing, onDone }: { existing: Awaited<ReturnType<typeof api<'clients.get'>>> | null; onDone: () => void }) {
  const { category, terms } = useApp()
  const openClient = useUi((s) => s.openClient)
  const { data: allTags = [] } = useTags()
  const [tags, setTags] = useState<string[]>(existing?.tags ?? [])
  const [tagInput, setTagInput] = useState('')
  const [waSame, setWaSame] = useState(!existing?.whatsappPhone || existing.whatsappPhone === existing.phone)
  const f = category.features

  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: existing?.firstName ?? '',
      lastName: existing?.lastName ?? '',
      phone: existing?.phone ? formatPhone(existing.phone) : '',
      whatsappPhone: existing?.whatsappPhone && existing.whatsappPhone !== existing.phone ? formatPhone(existing.whatsappPhone) : '',
      email: existing?.email ?? '',
      birthDate: existing?.birthDate ?? '',
      gender: existing?.gender ?? '',
      address: existing?.address ?? '',
      insurance: existing?.insurance ?? '',
      notes: existing?.notes ?? ''
    }
  })
  const errors = form.formState.errors
  const phone = form.watch('phone')

  // Détection de doublon par numéro de téléphone.
  const [debouncedPhone, setDebouncedPhone] = useState(phone)
  useEffect(() => {
    const id = setTimeout(() => setDebouncedPhone(phone), 350)
    return () => clearTimeout(id)
  }, [phone])
  const { data: duplicates = [] } = useQuery({
    queryKey: ['clients', 'dup', debouncedPhone, existing?.id],
    queryFn: () => api('clients.findDuplicates', { phone: debouncedPhone, excludeId: existing?.id }),
    enabled: normalizePhone(debouncedPhone).replace(/\D/g, '').length >= 9
  })

  const save = useMutation({
    mutationFn: (v: Form) =>
      api('clients.save', {
        id: existing?.id,
        ...v,
        whatsappPhone: waSame ? v.phone : v.whatsappPhone,
        birthDate: v.birthDate || null,
        gender: v.gender || null,
        tags
      }),
    onSuccess: (c) => {
      toast.success(existing ? t.common.saved : `${terms.client.singular} ajouté${terms.client.feminine ? 'e' : ''}`, { description: `${c.firstName} ${c.lastName}`.trim() })
      onDone()
    },
    onError: (e) => toast.error(errorMessage(e, t.errors.save))
  })

  const addTag = (tag: string) => {
    const v = tag.trim()
    if (v && !tags.includes(v)) setTags([...tags, v])
    setTagInput('')
  }
  const suggestions = [...new Set([...category.suggestedTags, ...allTags])].filter((x) => !tags.includes(x)).slice(0, 6)

  return (
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="flex max-h-[calc(100vh-140px)] flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pt-1 pb-5">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.clients.firstName} htmlFor="c-first" error={errors.firstName?.message}>
            <Input id="c-first" {...form.register('firstName')} aria-invalid={Boolean(errors.firstName)} />
          </Field>
          <Field label={t.clients.lastName} htmlFor="c-last">
            <Input id="c-last" {...form.register('lastName')} />
          </Field>
          <Field label={t.common.phone} htmlFor="c-phone" error={errors.phone?.message}>
            <Input id="c-phone" {...form.register('phone')} placeholder="06 12 34 56 78" aria-invalid={Boolean(errors.phone)} />
          </Field>
          <Field label={t.common.email} htmlFor="c-email" optional error={errors.email?.message}>
            <Input id="c-email" type="email" {...form.register('email')} aria-invalid={Boolean(errors.email)} />
          </Field>
        </div>

        {duplicates.length ? (
          <div className="flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">
            <AlertTriangle className="mt-px size-3.5 shrink-0" />
            <div>
              {t.clients.duplicateWarning}{' '}
              {duplicates.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className="font-semibold underline underline-offset-2"
                  onClick={() => {
                    onDone()
                    openClient(d.id)
                  }}
                >
                  {d.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="rounded-lg border border-border px-3 py-2.5">
          <label className="flex cursor-pointer items-center gap-2.5 text-[0.8125rem]">
            <Checkbox checked={waSame} onCheckedChange={(v) => setWaSame(v === true)} />
            WhatsApp : {t.clients.whatsappSame.toLowerCase()}
          </label>
          {!waSame ? (
            <Field htmlFor="c-wa" error={errors.whatsappPhone?.message} className="mt-2">
              <Input id="c-wa" {...form.register('whatsappPhone')} placeholder="+212 6 12 34 56 78" aria-invalid={Boolean(errors.whatsappPhone)} />
            </Field>
          ) : null}
        </div>

        {f.clientBirthDate || f.clientGender || f.clientInsurance ? (
          <div className="grid grid-cols-2 gap-3">
            {f.clientBirthDate ? (
              <Field label={t.clients.birthDate} htmlFor="c-birth" optional>
                <Input id="c-birth" type="date" max={new Date().toISOString().slice(0, 10)} {...form.register('birthDate')} />
              </Field>
            ) : null}
            {f.clientGender ? (
              <Field label={t.clients.gender} optional>
                <Segmented<'' | 'male' | 'female'>
                  value={form.watch('gender')}
                  onChange={(v) => form.setValue('gender', v)}
                  options={[
                    { value: '', label: '—' },
                    { value: 'female', label: t.clients.female },
                    { value: 'male', label: t.clients.male }
                  ]}
                />
              </Field>
            ) : null}
            {f.clientInsurance ? (
              <Field label={t.clients.insurance} htmlFor="c-ins" optional className="col-span-2">
                <Input id="c-ins" {...form.register('insurance')} placeholder="CNSS, CNOPS, AMO, assurance privée…" />
              </Field>
            ) : null}
          </div>
        ) : null}

        <Field label={t.common.address} htmlFor="c-address" optional>
          <Input id="c-address" {...form.register('address')} />
        </Field>

        <Field label={t.clients.tags} optional>
          <div className="flex min-h-8 flex-wrap items-center gap-1.5 rounded-md border border-border bg-surface px-1.5 py-1 shadow-sm focus-within:border-primary focus-within:ring-3 focus-within:ring-ring/60">
            {tags.map((tag) => (
              <span key={tag} className="inline-flex h-6 items-center gap-1 rounded bg-primary-soft pr-1 pl-2 text-xs font-medium text-primary-soft-foreground">
                {tag}
                <button type="button" aria-label={`Retirer ${tag}`} onClick={() => setTags(tags.filter((x) => x !== tag))} className="rounded p-0.5 hover:bg-surface/60">
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault()
                  addTag(tagInput)
                } else if (e.key === 'Backspace' && !tagInput && tags.length) setTags(tags.slice(0, -1))
              }}
              onBlur={() => tagInput && addTag(tagInput)}
              placeholder={tags.length ? '' : t.clients.addTag}
              className="h-6 min-w-[120px] flex-1 bg-transparent px-1 text-[0.8125rem] outline-none placeholder:text-subtle-foreground"
            />
          </div>
          {suggestions.length ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {suggestions.map((s) => (
                <button key={s} type="button" onClick={() => addTag(s)} className="inline-flex h-6 items-center gap-1 rounded border border-dashed border-border-strong px-2 text-xs text-muted-foreground hover:border-primary hover:text-primary">
                  <Plus className="size-3" /> {s}
                </button>
              ))}
            </div>
          ) : null}
        </Field>

        <Field label={t.common.notes} htmlFor="c-notes" optional hint={category.features.clientInsurance ? 'Informations pratiques uniquement — DigiPlan n’est pas un dossier médical.' : undefined}>
          <Textarea id="c-notes" rows={3} {...form.register('notes')} />
        </Field>
      </div>
      <div className="flex justify-end gap-2 border-t border-border bg-surface-2/50 px-5 py-3">
        <Button type="button" variant="ghost" onClick={onDone}>
          {t.common.cancel}
        </Button>
        <Button type="submit" variant="primary" loading={save.isPending}>
          {t.common.save}
        </Button>
      </div>
    </form>
  )
}
