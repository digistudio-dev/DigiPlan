// Paramètres : navigation par sections.

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import {
  Bell,
  Building2,
  CalendarCog,
  Clock,
  Cloud,
  DatabaseBackup,
  ImagePlus,
  Info,
  KeyRound,
  MessageCircle,
  Monitor,
  Moon,
  Palette,
  SlidersHorizontal,
  Sun,
  UsersRound,
  Plus,
  Trash2,
  AlertTriangle
} from 'lucide-react'
import { toast } from 'sonner'
import type { CategoryId, DaySchedule, ThemePreference } from '@shared/types'
import { CATEGORIES, CATEGORY_ORDER, getCategoryConfig } from '@shared/categories'
import { REMINDER_OFFSETS } from '@shared/domain/reminders'
import { formatPhone } from '@shared/domain/phone'
import { api, errorMessage } from '@/lib/api'
import { queryClient, useResources } from '@/lib/queries'
import { useApp, useProGate } from '@/hooks/useApp'
import { useUi, type SettingsSection } from '@/stores/ui'
import { cn } from '@/lib/utils'
import { optionalEmail, optionalPhone, requiredText } from '@/lib/validation'
import { t } from '@/i18n'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Card, ColorSwatches, ProBadge, SettingRow, Switch } from '@/components/ui/primitives'
import { FormSection, Select } from '@/components/common'
import { confirm } from '@/components/confirm'
import { CategoryIcon } from '@/components/CategoryIcon'
import { WeekScheduleEditor, validateWeek } from '@/components/WeekScheduleEditor'
import { SectionTitle, useUpdateSettings } from './shared'
import { GoogleSection, WhatsAppSection } from './IntegrationsSections'
import { AboutSection, BackupsSection, LicenseSection } from './SystemSections'

const NAV: Array<{ group: string; items: Array<{ id: SettingsSection | 'team'; icon: typeof Info; pro?: boolean }> }> = [
  { group: t.settings.groups.business, items: [{ id: 'general', icon: SlidersHorizontal }, { id: 'business', icon: Building2 }, { id: 'hours', icon: Clock }, { id: 'team', icon: UsersRound }, { id: 'appointments', icon: CalendarCog }, { id: 'notifications', icon: Bell }] },
  { group: t.settings.groups.integrations, items: [{ id: 'whatsapp', icon: MessageCircle, pro: true }, { id: 'google', icon: Cloud, pro: true }] },
  { group: t.settings.groups.system, items: [{ id: 'backups', icon: DatabaseBackup }, { id: 'appearance', icon: Palette }, { id: 'license', icon: KeyRound }, { id: 'about', icon: Info }] }
]

export default function SettingsPage() {
  const section = useUi((s) => s.settingsSection)
  const navigate = useUi((s) => s.navigate)
  const { isPro, terms } = useApp()

  return (
    <div className="flex h-full">
      <nav aria-label={t.settings.title} className="w-[220px] shrink-0 overflow-y-auto border-r border-border px-3 py-5">
        <h1 className="mb-4 px-2.5 text-[1.05rem] font-semibold tracking-tight">{t.settings.title}</h1>
        {NAV.map((g) => (
          <div key={g.group} className="mb-4">
            <div className="mb-1 px-2.5 text-[0.6875rem] font-medium tracking-wide text-subtle-foreground uppercase">{g.group}</div>
            {g.items.map((item) => {
              const active = section === item.id
              const label = item.id === 'team' ? terms.staffNavLabel : t.settings.sections[item.id]
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => (item.id === 'team' ? navigate('staff') : navigate('settings', item.id))}
                  className={cn(
                    'flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[0.8125rem] transition-colors',
                    active ? 'bg-surface font-medium text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'
                  )}
                >
                  <item.icon className={cn('size-4', active ? 'text-primary' : 'text-subtle-foreground')} />
                  {label}
                  {item.pro && !isPro ? <ProBadge className="ml-auto" /> : null}
                </button>
              )
            })}
          </div>
        ))}
      </nav>
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[760px] px-8 py-7">
          {section === 'general' && <GeneralSection />}
          {section === 'business' && <BusinessSection />}
          {section === 'hours' && <HoursSection />}
          {section === 'appointments' && <AppointmentsSection />}
          {section === 'notifications' && <NotificationsSection />}
          {section === 'whatsapp' && <WhatsAppSection />}
          {section === 'google' && <GoogleSection />}
          {section === 'backups' && <BackupsSection />}
          {section === 'appearance' && <AppearanceSection />}
          {section === 'license' && <LicenseSection />}
          {section === 'about' && <AboutSection />}
        </div>
      </div>
    </div>
  )
}

// ---------- Général : activité & terminologie ----------
function GeneralSection() {
  const { business, category, terms } = useApp()
  const [o, setO] = useState(business?.terminology ?? {})
  const update = useMutation({
    mutationFn: (patch: Parameters<typeof api<'business.update'>>[1]) => api('business.update', patch),
    onSuccess: (b) => {
      queryClient.setQueryData(['bootstrap'], (old: object | undefined) => (old ? { ...old, business: b } : old))
      toast.success(t.common.saved)
    },
    onError: (e) => toast.error(errorMessage(e))
  })

  const changeCategory = async (id: CategoryId) => {
    if (id === category.id) return
    const next = getCategoryConfig(id)
    const ok = await confirm({
      title: `Passer en « ${next.label} » ?`,
      body: 'Le vocabulaire, le tableau de bord et les options proposées seront adaptés. Vos données (clients, rendez-vous, prestations) ne sont pas modifiées.',
      tone: 'primary',
      confirmLabel: 'Changer d’activité'
    })
    if (ok) update.mutate({ categoryId: id })
  }

  const termField = (key: keyof typeof o, label: string, placeholder: string) => (
    <Field label={label}>
      <Input value={(o[key] as string | undefined) ?? ''} placeholder={placeholder} onChange={(e) => setO({ ...o, [key]: e.target.value })} />
    </Field>
  )

  return (
    <>
      <SectionTitle title={t.settings.sections.general} description="Activité de l’établissement et vocabulaire utilisé dans DigiPlan." />
      <div className="space-y-5">
        <FormSection title="Activité" description="Détermine les libellés, le tableau de bord et les fonctionnalités recommandées.">
          <div className="grid grid-cols-5 gap-2">
            {CATEGORY_ORDER.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => void changeCategory(id)}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-center text-xs font-medium transition-colors',
                  category.id === id ? 'border-primary bg-primary-soft/40 text-primary-soft-foreground' : 'border-border text-muted-foreground hover:bg-surface-2'
                )}
              >
                <CategoryIcon name={CATEGORIES[id].icon} className="size-4" />
                {CATEGORIES[id].label}
              </button>
            ))}
          </div>
        </FormSection>
        <FormSection title="Vocabulaire" description="Personnalisez les termes affichés. Laissez vide pour utiliser les termes par défaut de votre activité.">
          <div className="grid grid-cols-2 gap-3">
            {termField('clientSingular', 'Client (singulier)', category.client.singular)}
            {termField('clientPlural', 'Clients (pluriel)', category.client.plural)}
            {termField('staffSingular', 'Équipe (singulier)', category.staff.singular)}
            {termField('staffPlural', 'Équipe (pluriel)', category.staff.plural)}
            {termField('serviceSingular', 'Prestation (singulier)', category.service.singular)}
            {termField('servicePlural', 'Prestations (pluriel)', category.service.plural)}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Aperçu : « {terms.client.newLabel} », « {terms.staffNavLabel} », « {terms.service.plural} »
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => { setO({}); update.mutate({ terminology: {} }) }}>
                Réinitialiser
              </Button>
              <Button size="sm" variant="primary" loading={update.isPending} onClick={() => update.mutate({ terminology: o })}>
                {t.common.save}
              </Button>
            </div>
          </div>
        </FormSection>
        <FormSection title="Langue et région">
          <SettingRow title="Langue de l’interface" description="L’arabe et l’anglais pourront être ajoutés dans une prochaine version.">
            <span className="text-[0.8125rem] font-medium">Français</span>
          </SettingRow>
          <SettingRow title="Devise" description="Modifiable dans la section Entreprise.">
            <span className="text-[0.8125rem] font-medium">{business?.currency}</span>
          </SettingRow>
          <SettingRow title="Fuseau horaire">
            <span className="text-[0.8125rem] font-medium">{business?.timezone}</span>
          </SettingRow>
        </FormSection>
      </div>
    </>
  )
}

// ---------- Entreprise ----------
const businessSchema = z.object({
  name: requiredText(120),
  ownerName: z.string().trim().max(120),
  phone: optionalPhone,
  whatsapp: optionalPhone,
  email: optionalEmail,
  address: z.string().trim().max(300),
  city: z.string().trim().max(80),
  currency: z.string().trim().min(1).max(8),
  timezone: z.string().trim().min(1)
})
type BusinessForm = z.infer<typeof businessSchema>

function BusinessSection() {
  const { business } = useApp()
  const [logo, setLogo] = useState<string | null>(business?.logoDataUrl ?? null)
  const form = useForm<BusinessForm>({
    resolver: zodResolver(businessSchema),
    defaultValues: {
      name: business?.name ?? '',
      ownerName: business?.ownerName ?? '',
      phone: formatPhone(business?.phone ?? ''),
      whatsapp: formatPhone(business?.whatsapp ?? ''),
      email: business?.email ?? '',
      address: business?.address ?? '',
      city: business?.city ?? '',
      currency: business?.currency ?? 'MAD',
      timezone: business?.timezone ?? 'Africa/Casablanca'
    }
  })
  const e = form.formState.errors
  const save = useMutation({
    mutationFn: (v: BusinessForm) => api('business.update', { ...v, logoDataUrl: logo }),
    onSuccess: (b) => {
      queryClient.setQueryData(['bootstrap'], (old: object | undefined) => (old ? { ...old, business: b } : old))
      toast.success(t.common.saved)
    },
    onError: (err) => toast.error(errorMessage(err, t.errors.save))
  })
  const pickLogo = async () => {
    try {
      const d = await api('logo.pick')
      if (d) setLogo(d)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }
  return (
    <>
      <SectionTitle title={t.settings.sections.business} description="Coordonnées affichées sur vos reçus et dans vos messages." />
      <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-5">
        <FormSection title="Identité">
          <div className="mb-4 flex items-center gap-4">
            <button type="button" onClick={pickLogo} className="flex size-16 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border-strong bg-surface-2 text-subtle-foreground hover:border-primary hover:text-primary" aria-label="Logo">
              {logo ? <img src={logo} alt="" className="size-full object-contain" /> : <ImagePlus className="size-5" />}
            </button>
            <div className="text-xs text-muted-foreground">
              Logo utilisé sur les reçus.
              {logo ? (
                <button type="button" className="ml-2 text-danger hover:underline" onClick={() => setLogo(null)}>
                  Retirer
                </button>
              ) : null}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nom de l’établissement" error={e.name?.message}>
              <Input {...form.register('name')} aria-invalid={Boolean(e.name)} />
            </Field>
            <Field label="Responsable">
              <Input {...form.register('ownerName')} />
            </Field>
          </div>
        </FormSection>
        <FormSection title="Coordonnées">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.common.phone} error={e.phone?.message}>
              <Input {...form.register('phone')} aria-invalid={Boolean(e.phone)} />
            </Field>
            <Field label={t.common.whatsapp} error={e.whatsapp?.message}>
              <Input {...form.register('whatsapp')} aria-invalid={Boolean(e.whatsapp)} />
            </Field>
            <Field label={t.common.email} error={e.email?.message} className="col-span-2">
              <Input {...form.register('email')} aria-invalid={Boolean(e.email)} />
            </Field>
            <Field label={t.common.address} className="col-span-2">
              <Input {...form.register('address')} />
            </Field>
            <Field label={t.common.city}>
              <Input {...form.register('city')} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Devise">
                <Input {...form.register('currency')} />
              </Field>
              <Field label="Fuseau horaire">
                <Input {...form.register('timezone')} />
              </Field>
            </div>
          </div>
        </FormSection>
        <div className="flex justify-end">
          <Button type="submit" variant="primary" loading={save.isPending}>
            {t.common.save}
          </Button>
        </div>
      </form>
    </>
  )
}

// ---------- Horaires ----------
function HoursSection() {
  const { hours } = useApp()
  const [week, setWeek] = useState<DaySchedule[]>(hours)
  const save = useMutation({
    mutationFn: () => {
      const err = validateWeek(week)
      if (err) throw new Error(err)
      return api('business.setHours', week)
    },
    onSuccess: (h) => {
      queryClient.setQueryData(['bootstrap'], (old: object | undefined) => (old ? { ...old, hours: h } : old))
      toast.success(t.common.saved)
    },
    onError: (e) => toast.error(e instanceof Error && !('code' in e) ? e.message : errorMessage(e))
  })
  return (
    <>
      <SectionTitle title={t.settings.sections.hours} description="Horaires d’ouverture et pauses de l’établissement. Les membres de l’équipe peuvent avoir leurs propres horaires." />
      <WeekScheduleEditor value={week} onChange={setWeek} />
      <div className="mt-4 flex justify-end">
        <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
          {t.common.save}
        </Button>
      </div>
    </>
  )
}

// ---------- Rendez-vous ----------
function AppointmentsSection() {
  const { settings, isPro, terms } = useApp()
  const update = useUpdateSettings()
  const gate = useProGate()
  const hoursOptions = Array.from({ length: 25 }, (_, h) => ({ value: String(h), label: `${String(h).padStart(2, '0')}:00` }))
  return (
    <>
      <SectionTitle title={t.settings.sections.appointments} description="Comportement par défaut de l’agenda et de la prise de rendez-vous." />
      <div className="space-y-5">
        <FormSection title="Prise de rendez-vous">
          <div className="divide-y divide-border">
            <SettingRow title="Statut par défaut" description="Statut appliqué aux nouveaux rendez-vous.">
              <Select className="w-[160px]" value={settings.defaultAppointmentStatus} onChange={(v) => update.mutate({ defaultAppointmentStatus: v as 'pending' | 'confirmed' })} options={[{ value: 'confirmed', label: t.status.confirmed }, { value: 'pending', label: t.status.pending }]} />
            </SettingRow>
            <SettingRow title="Autoriser les chevauchements" description="Permet d’enregistrer deux rendez-vous simultanés pour un même membre, après confirmation.">
              <Switch checked={settings.allowOverlap} onCheckedChange={(v) => update.mutate({ allowOverlap: v })} />
            </SettingRow>
          </div>
        </FormSection>
        <FormSection title="Calendrier">
          <div className="divide-y divide-border">
            <SettingRow title="Durée d’un créneau">
              <Select className="w-[160px]" value={String(settings.calendarSlotMin)} onChange={(v) => update.mutate({ calendarSlotMin: Number(v) })} options={[10, 15, 20, 30, 60].map((m) => ({ value: String(m), label: `${m} minutes` }))} />
            </SettingRow>
            <SettingRow title="Plage horaire affichée">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Select className="w-[90px]" value={String(settings.calendarStartHour)} onChange={(v) => update.mutate({ calendarStartHour: Number(v) })} options={hoursOptions.slice(0, 24)} />
                à
                <Select className="w-[90px]" value={String(settings.calendarEndHour)} onChange={(v) => update.mutate({ calendarEndHour: Number(v) })} options={hoursOptions.slice(1)} />
              </div>
            </SettingRow>
            <SettingRow title="Vue par défaut">
              <Select
                className="w-[160px]"
                value={settings.defaultCalendarView}
                onChange={(v) => update.mutate({ defaultCalendarView: v as typeof settings.defaultCalendarView })}
                options={[
                  { value: 'timeGridDay', label: t.calendar.day },
                  { value: 'timeGridWeek', label: t.calendar.week },
                  { value: 'dayGridMonth', label: t.calendar.month },
                  { value: 'listWeek', label: t.calendar.agenda }
                ]}
              />
            </SettingRow>
          </div>
        </FormSection>
        <FormSection title={<span className="flex items-center gap-2">{terms.resource.plural} {!isPro ? <ProBadge /> : null}</span>} description={`Réservez un ${terms.resource.lower} (fauteuil, cabine, salle…) avec chaque rendez-vous et évitez les doubles réservations.`}>
          <SettingRow title={`Activer la gestion des ${terms.resource.lowerPlural}`}>
            <Switch checked={isPro && settings.resourcesEnabled} onCheckedChange={(v) => gate('resources', () => update.mutate({ resourcesEnabled: v }))} />
          </SettingRow>
          {isPro && settings.resourcesEnabled ? <ResourcesEditor /> : null}
        </FormSection>
      </div>
    </>
  )
}

function ResourcesEditor() {
  const { terms, category } = useApp()
  const { data = [] } = useResources()
  const [name, setName] = useState('')
  const save = useMutation({
    mutationFn: (v: { id?: string; name: string; active: boolean }) => api('resources.save', v),
    onSuccess: () => setName(''),
    onError: (e) => toast.error(errorMessage(e))
  })
  const remove = useMutation({ mutationFn: (id: string) => api('resources.delete', { id }), onError: (e) => toast.error(errorMessage(e)) })
  return (
    <div className="mt-2 space-y-2">
      <ul className="divide-y divide-border rounded-lg border border-border">
        {data.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-[0.8125rem]">
            <span className={cn('flex-1', !r.active && 'text-subtle-foreground line-through')}>{r.name}</span>
            <Switch checked={r.active} onCheckedChange={(active) => save.mutate({ id: r.id, name: r.name, active })} />
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t.common.delete}
              onClick={async () => {
                if (await confirm({ title: `Supprimer « ${r.name} » ?`, body: 'Si elle a déjà été utilisée, elle sera archivée.', confirmLabel: t.common.delete })) remove.mutate(r.id)
              }}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
        {data.length === 0 ? <li className="px-3 py-2 text-xs text-subtle-foreground">Suggestions : {category.suggestedResources.join(', ')}</li> : null}
      </ul>
      <form className="flex gap-2" onSubmit={(e) => (e.preventDefault(), name.trim() && save.mutate({ name: name.trim(), active: true }))}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`Nom ${terms.resource.feminine ? 'de la' : 'du'} ${terms.resource.lower} (ex. ${category.suggestedResources[0]})`} />
        <Button type="submit" disabled={!name.trim()}>
          <Plus /> {t.common.add}
        </Button>
      </form>
    </div>
  )
}

// ---------- Notifications ----------
function NotificationsSection() {
  const { settings, isPro } = useApp()
  const update = useUpdateSettings()
  const gate = useProGate()
  return (
    <>
      <SectionTitle title={t.settings.sections.notifications} description="Alertes internes et rappels automatiques envoyés aux clients." />
      <div className="space-y-5">
        <FormSection title="Centre de notifications">
          <SettingRow title="Signaler les rendez-vous imminents" description="Délai avant le début d’un rendez-vous pour l’afficher dans les notifications.">
            <Select className="w-[150px]" value={String(settings.notifyUpcomingMinutes)} onChange={(v) => update.mutate({ notifyUpcomingMinutes: Number(v) })} options={[15, 30, 60, 120].map((m) => ({ value: String(m), label: m < 60 ? `${m} minutes` : `${m / 60} heure${m > 60 ? 's' : ''}` }))} />
          </SettingRow>
        </FormSection>
        <FormSection title={<span className="flex items-center gap-2">Rappels WhatsApp {!isPro ? <ProBadge /> : null}</span>}>
          <div className="divide-y divide-border">
            <SettingRow title="Activer le rappel par défaut" description="Le rappel automatique est coché à la création d’un rendez-vous.">
              <Switch checked={isPro && settings.remindersEnabledByDefault} onCheckedChange={(v) => gate('whatsappReminders', () => update.mutate({ remindersEnabledByDefault: v }))} />
            </SettingRow>
            <SettingRow title="Délai par défaut">
              <Select className="w-[170px]" disabled={!isPro} value={String(settings.defaultReminderOffsetMin)} onChange={(v) => update.mutate({ defaultReminderOffsetMin: Number(v) })} options={REMINDER_OFFSETS.map((o) => ({ value: String(o.minutes), label: o.label }))} />
            </SettingRow>
            <SettingRow
              title="Rappels en retard"
              description="Si DigiPlan était fermé à l’heure prévue, le rappel est envoyé à la réouverture seulement s’il reste au moins ce délai avant le rendez-vous."
            >
              <Select className="w-[170px]" disabled={!isPro} value={String(settings.lateReminderMinLeadMin)} onChange={(v) => update.mutate({ lateReminderMinLeadMin: Number(v) })} options={[30, 60, 120, 180].map((m) => ({ value: String(m), label: m < 60 ? `${m} minutes` : `${m / 60} heure${m > 60 ? 's' : ''}` }))} />
            </SettingRow>
          </div>
        </FormSection>
      </div>
    </>
  )
}

// ---------- Apparence ----------
function AppearanceSection() {
  const { settings, isPro } = useApp()
  const update = useUpdateSettings()
  const gate = useProGate()
  const [footer, setFooter] = useState(settings.receiptFooter)
  const themes: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
    { value: 'light', label: t.topbar.themeLight, icon: Sun },
    { value: 'dark', label: t.topbar.themeDark, icon: Moon },
    { value: 'system', label: t.topbar.themeSystem, icon: Monitor }
  ]
  return (
    <>
      <SectionTitle title={t.settings.sections.appearance} />
      <div className="space-y-5">
        <FormSection title={t.topbar.theme}>
          <div className="grid grid-cols-3 gap-3">
            {themes.map((th) => (
              <button
                key={th.value}
                type="button"
                onClick={() => update.mutate({ theme: th.value })}
                className={cn('overflow-hidden rounded-xl border text-left transition-colors', settings.theme === th.value ? 'border-primary ring-3 ring-primary/15' : 'border-border hover:border-border-strong')}
              >
                <div className={cn('flex h-20 gap-1.5 p-2.5', th.value === 'dark' ? 'bg-[#0d0e12]' : th.value === 'light' ? 'bg-[#f7f7f8]' : 'bg-gradient-to-r from-[#f7f7f8] from-50% to-[#0d0e12] to-50%')}>
                  <div className={cn('w-1/4 rounded', th.value === 'dark' ? 'bg-[#16181d]' : 'bg-white')} />
                  <div className={cn('flex-1 rounded', th.value === 'light' ? 'bg-white' : 'bg-[#16181d]')} />
                </div>
                <div className="flex items-center gap-2 px-3 py-2 text-[0.8125rem] font-medium">
                  <th.icon className="size-4 text-muted-foreground" /> {th.label}
                </div>
              </button>
            ))}
          </div>
        </FormSection>
        <FormSection title={<span className="flex items-center gap-2">Personnalisation des reçus {!isPro ? <ProBadge /> : null}</span>}>
          <div className="divide-y divide-border">
            <SettingRow title="Afficher le logo">
              <Switch checked={settings.receiptShowLogo} onCheckedChange={(v) => gate('customReceipt', () => update.mutate({ receiptShowLogo: v }))} />
            </SettingRow>
            <SettingRow title="Couleur d’accent">
              <ColorSwatches value={settings.receiptAccentColor} onChange={(c) => gate('customReceipt', () => update.mutate({ receiptAccentColor: c }))} colors={['#0e6be6', '#0f766e', '#7c3aed', '#be185d', '#b45309', '#111827']} />
            </SettingRow>
            <div className="py-3">
              <Field label="Message de bas de reçu">
                <div className="flex gap-2">
                  <Input value={footer} onChange={(e) => setFooter(e.target.value)} disabled={!isPro} />
                  <Button disabled={!isPro || footer === settings.receiptFooter} onClick={() => update.mutate({ receiptFooter: footer })}>
                    {t.common.save}
                  </Button>
                </div>
              </Field>
            </div>
          </div>
          {!isPro ? (
            <Card className="mt-2 flex items-center gap-2 bg-surface-2/60 px-3 py-2 text-xs text-muted-foreground">
              <AlertTriangle className="size-3.5" /> En édition Free, les reçus utilisent la mise en page DigiPlan standard.
            </Card>
          ) : null}
        </FormSection>
      </div>
    </>
  )
}
