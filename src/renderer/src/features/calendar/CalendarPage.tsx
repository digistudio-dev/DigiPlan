// Calendrier : vues jour/semaine/mois/agenda, glisser-déposer, redimensionnement, filtres.
//
// Performance : FullCalendar réinitialise ses options dès qu'une prop change de référence, ce qui
// est coûteux et peut interrompre un glisser-déposer en cours. Toutes les options passées ici sont
// donc stables (constantes de module, useMemo, ou callbacks qui lisent l'état courant via des refs).

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import type { DateSelectArg, DatesSetArg, EventClickArg, EventContentArg, EventDropArg, EventInput, CalendarOptions } from '@fullcalendar/core'
import type { EventResizeDoneArg } from '@fullcalendar/interaction'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import frLocale from '@fullcalendar/core/locales/fr'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Filter, Palette, Plus } from 'lucide-react'
import { toast } from 'sonner'
import type { AppointmentDto, AppointmentStatus, AppSettings, CalendarColorMode } from '@shared/types'
import { APPOINTMENT_STATUSES, STATUS_COLORS, STATUS_LABELS, isClosedStatus } from '@shared/status'
import { minutesToHHMM } from '@shared/domain/time'
import { formatMoney } from '@shared/domain/money'
import { api, errorMessage } from '@/lib/api'
import { queryClient, useAppointmentsRange, useCatalog, useStaffList } from '@/lib/queries'
import { useApp } from '@/hooks/useApp'
import { useIsDark } from '@/hooks/useTheme'
import { useUi, useUiActions } from '@/stores/ui'
import { capitalize, cn, tint } from '@/lib/utils'
import { t } from '@/i18n'
import { Button } from '@/components/ui/button'
import { Checkbox, Kbd, Popover, PopoverContent, PopoverTrigger, Segmented, Separator, Tooltip } from '@/components/ui/primitives'
import { MiniMonth } from '@/components/MiniMonth'
import { confirm } from '@/components/confirm'

type ViewName = AppSettings['defaultCalendarView']

// ---------- Options constantes (références stables) ----------

const PLUGINS = [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]
const SLOT_LABEL_FORMAT = { hour: '2-digit', minute: '2-digit', hour12: false } as const
const EVENT_TIME_FORMAT = { hour: '2-digit', minute: '2-digit', hour12: false } as const
const VIEWS: CalendarOptions['views'] = {
  timeGridDay: { dayHeaderFormat: { weekday: 'long', day: '2-digit', month: 'long' } },
  timeGridWeek: { dayHeaderFormat: { weekday: 'short', day: '2-digit' } },
  dayGridMonth: { dayHeaderFormat: { weekday: 'short' } },
  listWeek: {}
}
const VIEW_KEYS: Record<string, ViewName> = { j: 'timeGridDay', s: 'timeGridWeek', m: 'dayGridMonth', a: 'listWeek' }

interface Range {
  from: number
  to: number
  title: string
  view: ViewName
  date: number
}

/** Enregistre une préférence d'affichage sans recharger l'application. */
function savePreference(patch: Partial<AppSettings>) {
  queryClient.setQueryData(['bootstrap'], (old: { settings: AppSettings } | undefined) => (old ? { ...old, settings: { ...old.settings, ...patch } } : old))
  void api('settings.update', patch).catch(() => undefined)
}

function prefetchRange(from: number, to: number) {
  void queryClient.prefetchQuery({
    queryKey: ['appointments', from, to],
    queryFn: () => api('appointments.range', { from, to }),
    staleTime: 30_000
  })
}

export default function CalendarPage() {
  const { settings, hours, terms, currency } = useApp()
  const ui = useUiActions()
  const dark = useIsDark()
  const calRef = useRef<FullCalendar>(null)

  // La vue et la date initiales sont figées au montage : un changement de paramètres ne réinitialise jamais le calendrier.
  const [initial] = useState(() => {
    const focus = useUi.getState().calendarFocusDate
    if (focus) useUi.setState({ calendarFocusDate: null })
    return { view: focus ? ('timeGridDay' as ViewName) : settings.defaultCalendarView, date: focus ?? Date.now() }
  })
  const [range, setRange] = useState<Range | null>(null)
  const [staffFilter, setStaffFilter] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus[]>([])
  const [serviceFilter, setServiceFilter] = useState<string[]>([])
  const [hideCancelled, setHideCancelled] = useState(true)
  const [colorMode, setColorMode] = useState<CalendarColorMode>(settings.calendarColorMode)
  const [saving, setSaving] = useState<Set<string>>(() => new Set())
  const [datePickerOpen, setDatePickerOpen] = useState(false)

  const { data: staff = [] } = useStaffList()
  const { data: catalog } = useCatalog()
  const { data: appointments = [], isFetching } = useAppointmentsRange(range?.from ?? 0, range?.to ?? 0, Boolean(range))

  // Préchargement des périodes voisines : navigation précédent/suivant instantanée.
  useEffect(() => {
    if (!range || range.view === 'dayGridMonth') return
    const span = range.to - range.from
    const id = window.setTimeout(() => {
      prefetchRange(range.from + span, range.to + span)
      prefetchRange(range.from - span, range.from)
    }, 250)
    return () => window.clearTimeout(id)
  }, [range])

  // Navigation demandée depuis une autre page alors que le calendrier est déjà ouvert.
  const focusDate = useUi((s) => s.calendarFocusDate)
  useEffect(() => {
    if (focusDate && calRef.current) {
      calRef.current.getApi().changeView('timeGridDay', focusDate)
      useUi.setState({ calendarFocusDate: null })
    }
  }, [focusDate])

  const serviceColor = useMemo(() => new Map((catalog?.services ?? []).map((s) => [s.id, s.color])), [catalog])

  const events: EventInput[] = useMemo(() => {
    const out: EventInput[] = []
    for (const a of appointments) {
      if (hideCancelled && a.status === 'cancelled') continue
      if (staffFilter.length && !(a.staffId && staffFilter.includes(a.staffId))) continue
      if (statusFilter.length && !statusFilter.includes(a.status)) continue
      if (serviceFilter.length && !a.services.some((s) => s.serviceId && serviceFilter.includes(s.serviceId))) continue
      const base =
        colorMode === 'status'
          ? STATUS_COLORS[a.status]
          : colorMode === 'staff'
            ? (a.staffColor ?? '#64748b')
            : (serviceColor.get(a.services[0]?.serviceId ?? '') ?? a.staffColor ?? '#3b82f6')
      const muted = a.status === 'cancelled' || a.status === 'no_show'
      const isSaving = saving.has(a.id)
      out.push({
        id: a.id,
        start: a.startAt,
        end: a.endAt,
        title: a.clientName,
        backgroundColor: tint(base, muted ? 0.08 : dark ? 0.32 : 0.14, dark),
        borderColor: base,
        textColor: dark ? '#eceef2' : '#14161b',
        editable: !isClosedStatus(a.status) && !isSaving,
        classNames: ['dp-event', muted ? 'dp-muted' : '', isSaving ? 'dp-saving' : ''],
        extendedProps: { appointment: a, color: base, currency }
      })
    }
    return out
  }, [appointments, hideCancelled, staffFilter, statusFilter, serviceFilter, colorMode, serviceColor, dark, saving, currency])

  const initialScroll = useMemo(() => {
    const open = Math.min(...hours.filter((d) => d.open).map((d) => Math.floor(d.start / 60)), 9)
    const nowH = new Date().getHours()
    const target = nowH > open + 2 && nowH < 17 ? nowH - 1 : open
    return `${String(Math.max(settings.calendarStartHour, target)).padStart(2, '0')}:00:00`
    // Calculé une seule fois : la position de défilement ne doit pas sauter pendant l'utilisation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const businessHours = useMemo(
    () =>
      hours
        .filter((d) => d.open)
        .flatMap((d) => {
          const dow = d.weekday % 7
          const segments: Array<[number, number]> = []
          let cursor = d.start
          for (const b of [...d.breaks].sort((x, y) => x.start - y.start)) {
            if (b.start > cursor) segments.push([cursor, b.start])
            cursor = Math.max(cursor, b.end)
          }
          if (d.end > cursor) segments.push([cursor, d.end])
          return segments.map(([s, e]) => ({ daysOfWeek: [dow], startTime: minutesToHHMM(s), endTime: minutesToHHMM(e) }))
        }),
    [hours]
  )

  // ---------- Callbacks stables ----------

  const slotMinRef = useRef(settings.calendarSlotMin)
  slotMinRef.current = settings.calendarSlotMin

  const onSelect = useCallback(
    (arg: DateSelectArg) => {
      const minutes = Math.round((arg.end.getTime() - arg.start.getTime()) / 60000)
      const startAt = arg.allDay ? arg.start.getTime() + 9 * 3600_000 : arg.start.getTime()
      ui.openAppointmentForm({ startAt, durationMin: arg.allDay || minutes <= slotMinRef.current ? undefined : minutes })
      calRef.current?.getApi().unselect()
    },
    [ui]
  )

  const onEventClick = useCallback((arg: EventClickArg) => ui.openAppointment(arg.event.id), [ui])

  const onDatesSet = useCallback((arg: DatesSetArg) => {
    const next: Range = {
      from: arg.start.getTime(),
      to: arg.end.getTime(),
      title: arg.view.title,
      view: arg.view.type as ViewName,
      date: arg.view.calendar.getDate().getTime()
    }
    // Évite un rendu inutile si FullCalendar signale la même période.
    setRange((prev) => (prev && prev.from === next.from && prev.to === next.to && prev.view === next.view && prev.title === next.title ? prev : next))
  }, [])

  const onMove = useCallback(async (arg: EventDropArg | EventResizeDoneArg) => {
    const a = arg.event.extendedProps.appointment as AppointmentDto
    const startAt = arg.event.start!.getTime()
    const endAt = arg.event.end?.getTime() ?? startAt + (a.endAt - a.startAt)
    const done = () =>
      setSaving((s) => {
        const n = new Set(s)
        n.delete(a.id)
        return n
      })
    setSaving((s) => new Set(s).add(a.id))
    try {
      let res = await api('appointments.move', { id: a.id, startAt, endAt })
      if (!res.ok && !res.conflicts.some((c) => c.blocking)) {
        const ok = await confirm({
          title: t.appointment.warningsTitle,
          body: res.conflicts.map((c) => c.message).join('\n'),
          tone: 'primary',
          confirmLabel: t.appointment.saveAnyway
        })
        if (!ok) {
          arg.revert()
          return
        }
        res = await api('appointments.move', { id: a.id, startAt, endAt, acknowledgeWarnings: true })
      }
      if (!res.ok) {
        arg.revert()
        toast.error(t.calendar.moveConflict, { description: res.conflicts.find((c) => c.blocking)?.message })
        return
      }
      // Mise à jour immédiate du cache : pas d'attente du rechargement pour voir l'heure à jour.
      queryClient.setQueriesData<AppointmentDto[]>({ queryKey: ['appointments'] }, (old) =>
        Array.isArray(old) ? old.map((x) => (x.id === a.id ? res.appointment : x)) : old
      )
      toast.success(t.calendar.moved, { description: `${a.clientName} · ${arg.event.start!.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` })
    } catch (e) {
      arg.revert()
      toast.error(errorMessage(e))
    } finally {
      done()
    }
  }, [])

  const noEventsContent = useCallback(
    () => (
      <div className="py-10 text-center text-[0.8125rem] text-muted-foreground">
        {t.calendar.emptyRange}
        <div className="mt-3">
          <Button size="sm" variant="primary" onClick={() => ui.openAppointmentForm()}>
            <Plus /> {t.dashboard.addAppointment}
          </Button>
        </div>
      </div>
    ),
    [ui]
  )

  // ---------- Actions de la barre d'outils ----------

  const changeView = useCallback((v: ViewName) => {
    calRef.current?.getApi().changeView(v)
    savePreference({ defaultCalendarView: v })
  }, [])
  const go = useCallback((dir: 'prev' | 'next' | 'today') => calRef.current?.getApi()[dir](), [])
  const gotoDate = (date: number) => {
    calRef.current?.getApi().gotoDate(date)
    setDatePickerOpen(false)
  }

  // Raccourcis clavier : ← → navigation, T aujourd'hui, J/S/M/A vues.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return
      const target = e.target as HTMLElement | null
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return
      if (document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')) return
      const key = e.key.toLowerCase()
      if (e.key === 'ArrowLeft') go('prev')
      else if (e.key === 'ArrowRight') go('next')
      else if (key === 't') go('today')
      else if (VIEW_KEYS[key]) changeView(VIEW_KEYS[key])
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, changeView])

  const filtersActive = statusFilter.length + serviceFilter.length + (hideCancelled ? 0 : 1)
  const visibleCount = events.length
  const isToday = range ? Date.now() >= range.from && Date.now() < range.to : true
  const toggleStaff = (id: string) => setStaffFilter((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]))

  return (
    <div className="flex h-full flex-col">
      {/* Barre d'outils */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-1">
          <Tooltip content={<span className="flex items-center gap-1.5">Aujourd’hui <Kbd>T</Kbd></span>} side="bottom">
            <Button size="sm" variant={isToday ? 'secondary' : 'soft'} onClick={() => go('today')}>
              {t.calendar.today}
            </Button>
          </Tooltip>
          <Tooltip content={<span className="flex items-center gap-1.5">Précédent <Kbd>←</Kbd></span>} side="bottom">
            <Button size="icon-sm" variant="ghost" aria-label="Précédent" onClick={() => go('prev')}>
              <ChevronLeft />
            </Button>
          </Tooltip>
          <Tooltip content={<span className="flex items-center gap-1.5">Suivant <Kbd>→</Kbd></span>} side="bottom">
            <Button size="icon-sm" variant="ghost" aria-label="Suivant" onClick={() => go('next')}>
              <ChevronRight />
            </Button>
          </Tooltip>
        </div>
        <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
          <PopoverTrigger asChild>
            <button type="button" className="flex min-w-[170px] items-center gap-1.5 rounded-md px-2 py-1 text-left transition-colors hover:bg-surface-2" aria-label="Choisir une date">
              <h1 className="text-[0.95rem] font-semibold">{capitalize(range?.title ?? '')}</h1>
              <ChevronDown className="size-3.5 text-subtle-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="p-0">{datePickerOpen ? <MiniMonth value={range?.date ?? Date.now()} onSelect={gotoDate} /> : null}</PopoverContent>
        </Popover>
        <span className="text-xs text-subtle-foreground">
          {visibleCount} rendez-vous
        </span>

        <div className="ml-auto flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant={filtersActive ? 'soft' : 'secondary'}>
                <Filter /> {t.calendar.filters}
                {filtersActive ? <span className="rounded-full bg-primary px-1.5 text-[0.65rem] text-white">{filtersActive}</span> : null}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[300px] p-3">
              <FilterGroup title={t.common.status}>
                <div className="grid grid-cols-2">
                  {APPOINTMENT_STATUSES.map((s) => (
                    <CheckRow key={s} checked={statusFilter.includes(s)} onChange={(v) => setStatusFilter(v ? [...statusFilter, s] : statusFilter.filter((x) => x !== s))}>
                      <span className="size-2 rounded-full" style={{ background: STATUS_COLORS[s] }} /> {t.status[s]}
                    </CheckRow>
                  ))}
                </div>
              </FilterGroup>
              <Separator className="my-2.5" />
              <FilterGroup title={terms.service.plural}>
                <div className="max-h-[160px] overflow-y-auto">
                  {(catalog?.services ?? []).map((s) => (
                    <CheckRow key={s.id} checked={serviceFilter.includes(s.id)} onChange={(v) => setServiceFilter(v ? [...serviceFilter, s.id] : serviceFilter.filter((x) => x !== s.id))}>
                      {s.name}
                    </CheckRow>
                  ))}
                </div>
              </FilterGroup>
              <Separator className="my-2.5" />
              <CheckRow checked={hideCancelled} onChange={setHideCancelled}>
                {t.calendar.hideCancelled}
              </CheckRow>
              {filtersActive ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-2 w-full"
                  onClick={() => {
                    setStatusFilter([])
                    setServiceFilter([])
                    setHideCancelled(true)
                  }}
                >
                  {t.calendar.resetFilters}
                </Button>
              ) : null}
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" aria-label={t.calendar.colorBy}>
                <Palette /> {t.calendar.colorBy}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[220px] p-1">
              {(
                [
                  ['status', t.calendar.colorByStatus],
                  ['service', t.calendar.colorByService],
                  ['staff', t.calendar.colorByStaff]
                ] as Array<[CalendarColorMode, string]>
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    setColorMode(v)
                    savePreference({ calendarColorMode: v })
                  }}
                  className={cn('flex h-8 w-full items-center rounded-md px-2.5 text-left text-[0.8125rem] hover:bg-surface-2', colorMode === v && 'font-medium text-primary')}
                >
                  {label}
                </button>
              ))}
            </PopoverContent>
          </Popover>
          <Segmented<ViewName>
            value={range?.view ?? initial.view}
            onChange={changeView}
            options={[
              { value: 'timeGridDay', label: t.calendar.day, title: 'Jour (J)' },
              { value: 'timeGridWeek', label: t.calendar.week, title: 'Semaine (S)' },
              { value: 'dayGridMonth', label: t.calendar.month, title: 'Mois (M)' },
              { value: 'listWeek', label: t.calendar.agenda, title: 'Agenda (A)' }
            ]}
          />
          <Button size="sm" variant="primary" onClick={() => ui.openAppointmentForm()}>
            <Plus /> {t.appointment.new}
          </Button>
        </div>

        {/* Équipe : filtre en un clic, visible en permanence */}
        {staff.length > 1 ? (
          <div className="flex w-full flex-wrap items-center gap-1.5 pt-0.5">
            <button
              type="button"
              onClick={() => setStaffFilter([])}
              className={cn(
                'h-7 rounded-full border px-3 text-xs font-medium transition-colors',
                staffFilter.length === 0 ? 'border-primary bg-primary-soft text-primary-soft-foreground' : 'border-border text-muted-foreground hover:bg-surface-2'
              )}
            >
              {t.calendar.allStaff}
            </button>
            {staff.map((s) => {
              const on = staffFilter.includes(s.id)
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleStaff(s.id)}
                  className={cn(
                    'flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
                    on ? 'text-foreground' : 'border-border text-muted-foreground hover:bg-surface-2'
                  )}
                  style={on ? { borderColor: s.color, background: `color-mix(in srgb, ${s.color} 12%, transparent)` } : undefined}
                >
                  <span className="size-2 rounded-full" style={{ background: s.color }} />
                  {s.name}
                </button>
              )
            })}
          </div>
        ) : null}
      </div>

      {/* Calendrier */}
      <div className="dp-calendar relative min-h-0 flex-1 bg-surface">
        <div className={cn('pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden transition-opacity duration-200', isFetching ? 'opacity-100' : 'opacity-0')}>
          <div className="dp-loading-bar h-full w-1/3 bg-primary" />
        </div>
        <CalendarCore
          calRef={calRef}
          initialView={initial.view}
          initialDate={initial.date}
          events={events}
          businessHours={businessHours}
          slotMin={settings.calendarSlotMin}
          startHour={settings.calendarStartHour}
          endHour={settings.calendarEndHour}
          scrollTime={initialScroll}
          onSelect={onSelect}
          onEventClick={onEventClick}
          onMove={onMove}
          onDatesSet={onDatesSet}
          noEventsContent={noEventsContent}
        />
        {range?.view === 'timeGridDay' && visibleCount === 0 && !isFetching ? (
          <div className="pointer-events-none absolute inset-x-0 top-24 z-10 flex justify-center">
            <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-border bg-surface px-4 py-2 text-[0.8125rem] shadow-md">
              <CalendarDays className="size-4 text-muted-foreground" />
              {isToday ? t.calendar.emptyDay : 'Aucun rendez-vous ce jour-là.'}
              <Button size="sm" variant="soft" onClick={() => ui.openAppointmentForm({ startAt: Math.max(range.from + 9 * 3600_000, Date.now()) })}>
                {t.dashboard.addAppointment}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/**
 * FullCalendar isolé et mémoïsé : il ne se re-rend que si ses entrées changent réellement
 * (pas lors de l'ouverture d'un filtre, d'un panneau ou d'un dialogue).
 */
const CalendarCore = memo(function CalendarCore(p: {
  calRef: React.RefObject<FullCalendar | null>
  initialView: ViewName
  initialDate: number
  events: EventInput[]
  businessHours: Array<{ daysOfWeek: number[]; startTime: string; endTime: string }>
  slotMin: number
  startHour: number
  endHour: number
  scrollTime: string
  onSelect: (arg: DateSelectArg) => void
  onEventClick: (arg: EventClickArg) => void
  onMove: (arg: EventDropArg | EventResizeDoneArg) => void
  onDatesSet: (arg: DatesSetArg) => void
  noEventsContent: () => React.ReactNode
}) {
  return (
    <FullCalendar
      ref={p.calRef}
      plugins={PLUGINS}
      locale={frLocale}
      firstDay={1}
      initialView={p.initialView}
      initialDate={p.initialDate}
      views={VIEWS}
      headerToolbar={false}
      height="100%"
      allDaySlot={false}
      nowIndicator
      slotDuration={`${minutesToHHMM(p.slotMin)}:00`}
      slotLabelInterval="01:00"
      slotMinTime={`${String(p.startHour).padStart(2, '0')}:00:00`}
      slotMaxTime={`${String(p.endHour).padStart(2, '0')}:00:00`}
      scrollTime={p.scrollTime}
      scrollTimeReset={false}
      slotLabelFormat={SLOT_LABEL_FORMAT}
      eventTimeFormat={EVENT_TIME_FORMAT}
      businessHours={p.businessHours}
      selectable
      selectMirror
      editable
      eventDurationEditable
      eventStartEditable
      snapDuration={`${minutesToHHMM(Math.min(p.slotMin, 15))}:00`}
      dayMaxEvents={4}
      expandRows
      eventDisplay="block"
      rerenderDelay={10}
      events={p.events}
      eventContent={renderEvent}
      select={p.onSelect}
      eventClick={p.onEventClick}
      eventDrop={p.onMove}
      eventResize={p.onMove}
      datesSet={p.onDatesSet}
      noEventsContent={p.noEventsContent}
    />
  )
})

function describe(a: AppointmentDto, currency: string): string {
  return [
    a.clientName,
    a.services.map((s) => s.name).join(' + '),
    a.staffName ?? '',
    STATUS_LABELS[a.status],
    formatMoney(a.total, currency) + (a.balance > 0 && a.status !== 'cancelled' ? ` (reste ${formatMoney(a.balance, currency)})` : '')
  ]
    .filter(Boolean)
    .join('\n')
}

function renderEvent(arg: EventContentArg) {
  const a = arg.event.extendedProps.appointment as AppointmentDto
  const color = arg.event.extendedProps.color as string
  const currency = arg.event.extendedProps.currency as string
  const services = a.services.map((s) => s.name).join(' + ')
  const tip = describe(a, currency)
  if (arg.view.type === 'listWeek') {
    return (
      <div className="flex items-center gap-2" title={tip}>
        <span className="font-medium">{a.clientName}</span>
        <span className="text-muted-foreground">· {services}</span>
        {a.staffName ? <span className="text-subtle-foreground">· {a.staffName}</span> : null}
        <span className="ml-auto rounded-full px-2 text-[0.6875rem] font-medium" style={{ color: STATUS_COLORS[a.status], background: `color-mix(in srgb, ${STATUS_COLORS[a.status]} 14%, transparent)` }}>
          {t.status[a.status]}
        </span>
      </div>
    )
  }
  if (arg.view.type === 'dayGridMonth') {
    return (
      <div className="flex w-full min-w-0 items-center gap-1 overflow-hidden px-1 text-[0.72rem]" title={tip}>
        <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />
        <span className="tabular shrink-0 opacity-70">{arg.timeText}</span>
        <span className={cn('truncate font-medium', a.status === 'cancelled' && 'line-through')}>{a.clientName}</span>
      </div>
    )
  }
  const minutes = (a.endAt - a.startAt) / 60000
  const short = minutes <= 25
  return (
    <div className="flex h-full min-w-0 overflow-hidden rounded-[5px] border-l-[3px] px-1.5 py-1 leading-tight" style={{ borderColor: color }} title={tip}>
      <div className="min-w-0 flex-1">
        <div className={cn('flex items-center gap-1 truncate text-[0.75rem] font-semibold', a.status === 'cancelled' && 'line-through')}>
          {short ? <span className="tabular font-normal opacity-70">{arg.timeText.split(' - ')[0]}</span> : null}
          <span className="truncate">{a.clientName}</span>
        </div>
        {!short ? (
          <>
            <div className="truncate text-[0.7rem] opacity-80">{services}</div>
            {minutes >= 40 ? (
              <div className="tabular truncate text-[0.68rem] opacity-60">
                {arg.timeText}
                {a.staffName ? ` · ${a.staffName}` : ''}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
      {a.balance > 0 && a.status === 'completed' ? <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-amber-500" title="Solde restant" /> : null}
    </div>
  )
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[0.6875rem] font-medium tracking-wide text-subtle-foreground uppercase">{title}</div>
      {children}
    </div>
  )
}

function CheckRow({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex h-7 cursor-pointer items-center gap-2 rounded px-1 text-[0.8125rem] hover:bg-surface-2">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      <span className="flex min-w-0 items-center gap-1.5 truncate">{children}</span>
    </label>
  )
}
