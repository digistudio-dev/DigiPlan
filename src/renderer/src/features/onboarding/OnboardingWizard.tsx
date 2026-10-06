// Assistant de premier lancement : configuration guidée selon l'activité.

import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Check, ImagePlus, Plus, Trash2, Rocket, Building2, Clock, UserRound, Tag, LayoutGrid, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import type { CategoryId, DaySchedule } from '@shared/types'
import { CATEGORIES, CATEGORY_ORDER, defaultOpeningHours, getCategoryConfig } from '@shared/categories'
import { resolveTerminology } from '@shared/terminology'
import { STAFF_COLORS, DEFAULT_CURRENCY, DEFAULT_TIMEZONE } from '@shared/constants'
import { toCents } from '@shared/domain/money'
import { api, errorMessage } from '@/lib/api'
import { queryClient } from '@/lib/queries'
import { useUi } from '@/stores/ui'
import { optionalEmail, optionalPhone, requiredText } from '@/lib/validation'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Checkbox, ColorSwatches } from '@/components/ui/primitives'
import { LogoMark, MoneyInput, Wordmark } from '@/components/common'
import { CategoryIcon } from '@/components/CategoryIcon'
import { WeekScheduleEditor, validateWeek } from '@/components/WeekScheduleEditor'
import wordmarkUrl from '@/assets/brand/digiplan-wordmark.png'

const businessSchema = z.object({
  name: requiredText(120),
  ownerName: z.string().trim().max(120),
  phone: optionalPhone,
  whatsapp: optionalPhone,
  email: optionalEmail,
  address: z.string().trim().max(300),
  city: z.string().trim().max(80),
  currency: z.string().trim().min(1),
  timezone: z.string().trim().min(1)
})
type BusinessForm = z.infer<typeof businessSchema>

interface ServiceDraft {
  key: string
  selected: boolean
  name: string
  category: string
  durationMin: number
  price: number
}

const STEPS = [
  { id: 'welcome', label: 'Bienvenue', icon: Sparkles },
  { id: 'category', label: 'Activité', icon: LayoutGrid },
  { id: 'business', label: 'Établissement', icon: Building2 },
  { id: 'hours', label: 'Horaires', icon: Clock },
  { id: 'staff', label: 'Équipe', icon: UserRound },
  { id: 'services', label: 'Prestations', icon: Tag },
  { id: 'done', label: 'Terminé', icon: Rocket }
] as const

export function OnboardingWizard() {
  const [step, setStep] = useState(0)
  const [categoryId, setCategoryId] = useState<CategoryId | null>(null)
  const [logo, setLogo] = useState<string | null>(null)
  const [hours, setHours] = useState<DaySchedule[]>(() => defaultOpeningHours('other'))
  const [hoursTouched, setHoursTouched] = useState(false)
  const [staff, setStaff] = useState({ name: '', role: '', phone: '', email: '', color: STAFF_COLORS[0] as string })
  const [services, setServices] = useState<ServiceDraft[]>([])

  const config = categoryId ? getCategoryConfig(categoryId) : null
  const terms = useMemo(() => resolveTerminology(categoryId ?? 'other'), [categoryId])

  const form = useForm<BusinessForm>({
    resolver: zodResolver(businessSchema),
    defaultValues: { name: '', ownerName: '', phone: '', whatsapp: '', email: '', address: '', city: '', currency: DEFAULT_CURRENCY, timezone: DEFAULT_TIMEZONE }
  })

  const chooseCategory = (id: CategoryId) => {
    setCategoryId(id)
    const c = getCategoryConfig(id)
    setServices(
      c.defaultServices.map((s, i) => ({ key: `${id}-${i}`, selected: true, name: s.name, category: s.category, durationMin: s.durationMin, price: toCents(s.price) }))
    )
    if (!hoursTouched) setHours(defaultOpeningHours(id))
    setStaff((s) => ({ ...s, role: s.role && s.role !== config?.defaultStaffRole ? s.role : c.defaultStaffRole }))
  }

  const complete = useMutation({
    mutationFn: async () => {
      const b = form.getValues()
      await api('onboarding.complete', {
        categoryId: categoryId!,
        business: { ...b, logoDataUrl: logo },
        hours,
        staff: { ...staff, name: staff.name.trim() || b.ownerName || b.name },
        services: services.filter((s) => s.selected && s.name.trim()).map(({ name, category, durationMin, price }) => ({ name: name.trim(), category, durationMin, price })),
        resources: []
      })
    },
    onError: (e) => toast.error(errorMessage(e, t.errors.save))
  })

  const pickLogo = async () => {
    try {
      const data = await api('logo.pick')
      if (data) setLogo(data)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const next = async () => {
    if (step === 1 && !categoryId) return
    if (step === 2 && !(await form.trigger())) return
    if (step === 3) {
      const err = validateWeek(hours)
      if (err) return toast.error(err)
      if (!hours.some((d) => d.open)) return toast.error('Indiquez au moins un jour d’ouverture.')
    }
    if (step === 4) {
      if (!staff.name.trim()) {
        setStaff((s) => ({ ...s, name: form.getValues('ownerName') }))
        if (!form.getValues('ownerName').trim()) return toast.error(`Indiquez le nom ${terms.staff.feminine ? 'de la' : 'du'} ${terms.staff.lower}.`)
      }
    }
    if (step === 5) {
      try {
        await complete.mutateAsync()
      } catch {
        return
      }
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  useEffect(() => {
    useUi.setState({ onboardingActive: true })
  }, [])
  const finish = () => {
    useUi.setState({ onboardingActive: false })
    void queryClient.invalidateQueries({ queryKey: ['bootstrap'] })
  }

  return (
    <div className="flex h-full bg-background">
      {/* Colonne de progression */}
      <aside className="drag relative flex w-[300px] shrink-0 flex-col border-r border-border bg-panel px-7 pt-8 pb-6">
        <div className="flex items-center gap-2.5">
          <LogoMark size={30} />
          <Wordmark className="text-lg" />
        </div>
        <ol className="no-drag mt-10 space-y-1">
          {STEPS.map((s, i) => {
            const done = i < step
            const current = i === step
            return (
              <li key={s.id} className={cn('flex items-center gap-3 rounded-lg px-2 py-2 text-[0.8125rem] transition-colors', current && 'bg-surface shadow-sm ring-1 ring-border')}>
                <span
                  className={cn(
                    'flex size-6 items-center justify-center rounded-full border text-[0.6875rem] font-semibold transition-colors',
                    done && 'border-primary bg-primary text-white',
                    current && 'border-primary text-primary',
                    !done && !current && 'border-border-strong text-subtle-foreground'
                  )}
                >
                  {done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
                </span>
                <span className={cn('font-medium', !current && !done && 'text-subtle-foreground', done && 'text-muted-foreground')}>{s.id === 'services' && categoryId ? terms.service.plural : s.label}</span>
              </li>
            )
          })}
        </ol>
        <div className="mt-auto text-xs text-subtle-foreground">
          Développé par <span className="font-medium text-muted-foreground">DigiStudio.dev</span>
        </div>
      </aside>

      {/* Contenu */}
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="drag h-[var(--titlebar-h)] shrink-0" />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[760px] px-10 pt-4 pb-10">
            {step === 0 && (
              <div className="flex min-h-[520px] flex-col items-center justify-center text-center">
                <img src={wordmarkUrl} alt="DigiPlan" className="w-[300px] dark:rounded-xl dark:bg-white dark:px-5 dark:py-3" draggable={false} />
                <h1 className="mt-10 text-[1.7rem] font-semibold tracking-tight">Bienvenue sur DigiPlan</h1>
                <p className="mt-2 max-w-md text-[0.9rem] leading-relaxed text-muted-foreground">
                  Le logiciel de gestion de rendez-vous pensé pour votre activité. Quelques minutes suffisent pour configurer votre établissement.
                </p>
                <Button size="lg" variant="primary" className="mt-8 px-6" onClick={() => setStep(1)} data-autofocus>
                  Commencer la configuration <ArrowRight />
                </Button>
                <p className="mt-4 text-xs text-subtle-foreground">Vos données restent sur cet ordinateur et fonctionnent sans internet.</p>
              </div>
            )}

            {step === 1 && (
              <StepFrame title="Quelle est votre activité ?" subtitle="DigiPlan adapte son vocabulaire, son tableau de bord et ses prestations à votre métier.">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
                  {CATEGORY_ORDER.map((id) => {
                    const c = CATEGORIES[id]
                    const selected = categoryId === id
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => chooseCategory(id)}
                        aria-pressed={selected}
                        className={cn(
                          'group flex flex-col items-center gap-2.5 rounded-xl border bg-surface px-3 py-5 text-center shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md',
                          selected ? 'border-primary ring-3 ring-primary/15' : 'border-border'
                        )}
                      >
                        <span
                          className={cn(
                            'flex size-11 items-center justify-center rounded-xl transition-colors',
                            selected ? 'bg-primary text-white' : 'bg-surface-2 text-muted-foreground group-hover:text-primary'
                          )}
                        >
                          <CategoryIcon name={c.icon} className="size-5" />
                        </span>
                        <span className="text-[0.8125rem] leading-tight font-semibold">{c.label}</span>
                        <span className="text-[0.6875rem] leading-tight text-subtle-foreground">{c.description}</span>
                      </button>
                    )
                  })}
                </div>
                {config ? (
                  <p className="mt-5 rounded-lg border border-border bg-surface-2/60 px-4 py-3 text-xs text-muted-foreground">
                    Vous gérerez vos <b className="text-foreground">{terms.client.lowerPlural}</b>, votre équipe de{' '}
                    <b className="text-foreground">{terms.staff.lowerPlural}</b> et vos <b className="text-foreground">{terms.service.lowerPlural}</b>.
                  </p>
                ) : null}
              </StepFrame>
            )}

            {step === 2 && (
              <StepFrame title="Votre établissement" subtitle="Ces informations apparaîtront sur vos reçus et vos messages.">
                <form className="space-y-4" onSubmit={(e) => (e.preventDefault(), void next())}>
                  <div className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4 shadow-sm">
                    <button
                      type="button"
                      onClick={pickLogo}
                      className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border-strong bg-surface-2 text-subtle-foreground transition-colors hover:border-primary hover:text-primary"
                      aria-label="Choisir un logo"
                    >
                      {logo ? <img src={logo} alt="" className="size-full object-contain" /> : <ImagePlus className="size-5" />}
                    </button>
                    <div className="text-[0.8125rem]">
                      <div className="font-medium">Logo de l’établissement</div>
                      <div className="text-xs text-muted-foreground">Facultatif — PNG, JPG ou SVG, 2 Mo maximum.</div>
                      {logo ? (
                        <button type="button" className="mt-1 text-xs text-danger hover:underline" onClick={() => setLogo(null)}>
                          Retirer
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Nom de l’établissement" htmlFor="b-name" error={form.formState.errors.name?.message} className="col-span-2">
                      <Input id="b-name" {...form.register('name')} placeholder="Ex. Salon Atlas" aria-invalid={Boolean(form.formState.errors.name)} />
                    </Field>
                    <Field label="Nom du responsable" htmlFor="b-owner" optional>
                      <Input id="b-owner" {...form.register('ownerName')} />
                    </Field>
                    <Field label={t.common.email} htmlFor="b-email" optional error={form.formState.errors.email?.message}>
                      <Input id="b-email" type="email" {...form.register('email')} aria-invalid={Boolean(form.formState.errors.email)} />
                    </Field>
                    <Field label={t.common.phone} htmlFor="b-phone" optional error={form.formState.errors.phone?.message}>
                      <Input id="b-phone" {...form.register('phone')} placeholder="06 12 34 56 78" aria-invalid={Boolean(form.formState.errors.phone)} />
                    </Field>
                    <Field label={t.common.whatsapp} htmlFor="b-wa" optional error={form.formState.errors.whatsapp?.message}>
                      <Input id="b-wa" {...form.register('whatsapp')} placeholder="+212 6 12 34 56 78" aria-invalid={Boolean(form.formState.errors.whatsapp)} />
                    </Field>
                    <Field label={t.common.address} htmlFor="b-address" optional className="col-span-2">
                      <Input id="b-address" {...form.register('address')} />
                    </Field>
                    <Field label={t.common.city} htmlFor="b-city" optional>
                      <Input id="b-city" {...form.register('city')} placeholder="Casablanca" />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Devise" htmlFor="b-currency">
                        <Input id="b-currency" {...form.register('currency')} />
                      </Field>
                      <Field label="Fuseau horaire" htmlFor="b-tz">
                        <Input id="b-tz" {...form.register('timezone')} />
                      </Field>
                    </div>
                  </div>
                  <button type="submit" hidden />
                </form>
              </StepFrame>
            )}

            {step === 3 && (
              <StepFrame title="Horaires d’ouverture" subtitle="Les rendez-vous ne pourront être pris que pendant ces horaires. Vous pourrez les modifier à tout moment.">
                <WeekScheduleEditor
                  value={hours}
                  onChange={(w) => {
                    setHours(w)
                    setHoursTouched(true)
                  }}
                />
              </StepFrame>
            )}

            {step === 4 && (
              <StepFrame
                title={`Votre ${terms.staff.feminine ? 'première' : 'premier'} ${terms.staff.lower}`}
                subtitle="Vous pourrez ajouter d’autres membres de l’équipe ensuite (DigiPlan Pro pour une équipe illimitée)."
              >
                <div className="space-y-4 rounded-xl border border-border bg-surface p-5 shadow-sm">
                  <div className="grid grid-cols-2 gap-4">
                    <Field label={t.common.name} htmlFor="s-name">
                      <Input
                        id="s-name"
                        value={staff.name}
                        placeholder={form.getValues('ownerName') || 'Ex. Karim Alaoui'}
                        onChange={(e) => setStaff({ ...staff, name: e.target.value })}
                      />
                    </Field>
                    <Field label={t.staff.role} htmlFor="s-role">
                      <Input id="s-role" value={staff.role} onChange={(e) => setStaff({ ...staff, role: e.target.value })} />
                    </Field>
                    <Field label={t.common.phone} htmlFor="s-phone" optional>
                      <Input id="s-phone" value={staff.phone} onChange={(e) => setStaff({ ...staff, phone: e.target.value })} />
                    </Field>
                    <Field label={t.common.email} htmlFor="s-email" optional>
                      <Input id="s-email" value={staff.email} onChange={(e) => setStaff({ ...staff, email: e.target.value })} />
                    </Field>
                  </div>
                  <Field label={t.staff.calendarColor}>
                    <ColorSwatches value={staff.color} onChange={(color) => setStaff({ ...staff, color })} colors={STAFF_COLORS} />
                  </Field>
                </div>
              </StepFrame>
            )}

            {step === 5 && config && (
              <StepFrame
                title={`Vos ${terms.service.lowerPlural}`}
                subtitle={`Nous avons préparé les ${terms.service.lowerPlural} les plus courant${terms.service.feminine ? "e" : ""}s pour votre activité. Ajustez noms, durées et prix.`}
              >
                <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
                  <div className="grid grid-cols-[28px_1fr_140px_110px_130px_32px] items-center gap-3 border-b border-border bg-surface-2/60 px-4 py-2 text-[0.6875rem] font-medium tracking-wide text-subtle-foreground uppercase">
                    <span />
                    <span>{t.common.name}</span>
                    <span>{t.common.category}</span>
                    <span>{t.common.duration}</span>
                    <span>{t.common.price}</span>
                    <span />
                  </div>
                  {services.map((s, i) => (
                    <div key={s.key} className={cn('grid grid-cols-[28px_1fr_140px_110px_130px_32px] items-center gap-3 border-b border-border px-4 py-2 last:border-0', !s.selected && 'opacity-50')}>
                      <Checkbox checked={s.selected} onCheckedChange={(v) => setServices(services.map((x, j) => (j === i ? { ...x, selected: v === true } : x)))} aria-label="Inclure" />
                      <Input value={s.name} onChange={(e) => setServices(services.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className="h-7" />
                      <Input value={s.category} onChange={(e) => setServices(services.map((x, j) => (j === i ? { ...x, category: e.target.value } : x)))} className="h-7" />
                      <div className="relative">
                        <Input
                          type="number"
                          min={5}
                          step={5}
                          value={s.durationMin}
                          onChange={(e) => setServices(services.map((x, j) => (j === i ? { ...x, durationMin: Math.max(5, Number(e.target.value) || 5) } : x)))}
                          className="h-7 pr-9"
                        />
                        <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-subtle-foreground">min</span>
                      </div>
                      <MoneyInput value={s.price} onChange={(price) => setServices(services.map((x, j) => (j === i ? { ...x, price } : x)))} className="[&_input]:h-7" />
                      <button
                        type="button"
                        aria-label="Retirer"
                        onClick={() => setServices(services.filter((_, j) => j !== i))}
                        className="flex size-7 items-center justify-center rounded-md text-subtle-foreground hover:bg-danger-soft hover:text-danger"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))}
                  <div className="px-4 py-2.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setServices([
                          ...services,
                          { key: `custom-${Date.now()}`, selected: true, name: '', category: services[0]?.category ?? '', durationMin: config.defaultAppointmentDurationMin, price: 0 }
                        ])
                      }
                    >
                      <Plus /> {terms.service.newLabel}
                    </Button>
                  </div>
                </div>
                <p className="mt-3 text-xs text-subtle-foreground">
                  {services.filter((s) => s.selected).length} {terms.service.lowerPlural} seront créé{terms.service.feminine ? 'e' : ''}s. Vous pourrez en ajouter ou les modifier à tout moment.
                </p>
              </StepFrame>
            )}

            {step === 6 && (
              <div className="flex min-h-[520px] flex-col items-center justify-center text-center">
                <div className="flex size-16 items-center justify-center rounded-2xl bg-success-soft text-success">
                  <Check className="size-8" strokeWidth={2.5} />
                </div>
                <h1 className="mt-6 text-[1.6rem] font-semibold tracking-tight">Tout est prêt</h1>
                <p className="mt-2 max-w-md text-[0.9rem] text-muted-foreground">
                  <b className="text-foreground">{form.getValues('name')}</b> est configuré. Vous pouvez dès maintenant ajouter vos {terms.client.lowerPlural} et planifier vos premiers rendez-vous.
                </p>
                <div className="mt-6 grid w-full max-w-md grid-cols-3 gap-3 text-left">
                  {[
                    { label: 'Activité', value: config?.label },
                    { label: terms.staff.singular, value: staff.name || form.getValues('ownerName') },
                    { label: terms.service.plural, value: String(services.filter((s) => s.selected).length) }
                  ].map((x) => (
                    <div key={x.label} className="rounded-lg border border-border bg-surface px-3 py-2.5 shadow-sm">
                      <div className="text-[0.6875rem] text-subtle-foreground">{x.label}</div>
                      <div className="truncate text-[0.8125rem] font-semibold">{x.value}</div>
                    </div>
                  ))}
                </div>
                <Button size="lg" variant="primary" className="mt-8 px-6" onClick={finish} data-autofocus>
                  Commencer avec DigiPlan <ArrowRight />
                </Button>
              </div>
            )}
          </div>
        </div>

        {step > 0 && step < 6 ? (
          <footer className="flex shrink-0 items-center justify-between border-t border-border bg-panel px-10 py-3.5">
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={complete.isPending}>
              <ArrowLeft /> {t.common.back}
            </Button>
            <div className="text-xs text-subtle-foreground">
              Étape {step} sur {STEPS.length - 2}
            </div>
            <Button variant="primary" onClick={() => void next()} disabled={step === 1 && !categoryId} loading={complete.isPending}>
              {step === 5 ? 'Terminer la configuration' : t.common.continue} {step < 5 ? <ArrowRight /> : null}
            </Button>
          </footer>
        ) : null}
      </section>
    </div>
  )
}

function StepFrame({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="animate-fade-in">
      <h1 className="text-[1.45rem] font-semibold tracking-tight">{title}</h1>
      {subtitle ? <p className="mt-1.5 mb-6 text-[0.875rem] text-muted-foreground">{subtitle}</p> : <div className="mb-6" />}
      {children}
    </div>
  )
}
