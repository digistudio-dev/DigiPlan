// Calendrier : vues jour/semaine/mois/agenda, glisser-déposer, redimensionnement, filtres.

import { useEffect, useMemo, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import type { DateSelectArg, DatesSetArg, EventClickArg, EventContentArg, EventDropArg, EventInput } from '@fullcalendar/core'
import type { EventResizeDoneArg } from '@fullcalendar/interaction'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import frLocale from '@fullcalendar/core/locales/fr'
import { useMutation } from '@tanstack/react-query'
import { CalendarDays, ChevronLeft, ChevronRight, Filter, Palette, Plus } from 'lucide-react'
import { toast } from 'sonner'
import type { AppointmentDto, AppointmentStatus, AppSettings, CalendarColorMode } from '@shared/types'
import { APPOINTMENT_STATUSES, STATUS_COLORS, isClosedStatus } from '@shared/status'
import { minutesToHHMM } from '@shared/domain/time'
import { api, errorMessage } from '@/lib/api'
import { useAppointmentsRange, useCatalog, useStaffList } from '@/lib/queries'
import { useApp } from '@/hooks/useApp'
import { useIsDark } from '@/hooks/useTheme'
import { useUi } from '@/stores/ui'
import { capitalize, cn, tint } from '@/lib/utils'
import { t } from '@/i18n'
import { Button } from '@/components/ui/button'
import { Checkbox, Popover, PopoverContent, PopoverTrigger, Segmented, Separator } from '@/components/ui/primitives'
import { confirm } from '@/components/confirm'

type ViewName = AppSettings['defaultCalendarView']

export default function CalendarPage() {
  const { settings, hours, terms } = useApp()
  const ui = useUi()
  const dark = useIsDark()
  const calRef = useRef<FullCalendar>(null)
  const [range, setRange] = useState<{ from: number; to: number; title: string; view: ViewName } | null>(null)
  const [staffFilter, setStaffFilter] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus[]>([])
  const [serviceFilter, setServiceFilter] = useState<string[]>([])
  const [hideCancelled, setHideCancelled] = useState(true)
  const [colorMode, setColorMode] = useState<CalendarColorMode>(settings.calendarColorMode)

  const { data: staff = [] } = useStaffList()
  const { data: catalog } = useCatalog()
  const { data: appointments = [] } = useAppointmentsRange(range?.from ?? 0, range?.to ?? 0, Boolean(range))

  const persist = useMutation({ mutationFn: (patch: Partial<AppSettings>) => api('settings.update', patch) })

  // Navigation demandée depuis une autre page (tableau de bord, détail…).
  const focusDate = useUi((s) => s.calendarFocusDate)
  useEffect(() => {
    if (focusDate && calRef.current) {
      const apiCal = calRef.current.getApi()
      apiCal.changeView('timeGridDay', focusDate)
      useUi.setState({ calendarFocusDate: null })
    }
  }, [focusDate])

  const serviceColor = useMemo(() => new Map((catalog?.services ?? []).map((s) => [s.id, s.color])), [catalog])

  const events: EventInput[] = useMemo(() => {
    return appointments
      .filter((a) => !(hideCancelled && a.status === 'cancelled'))
      .filter((a) => !staffFilter.length || (a.staffId && staffFilter.includes(a.staffId)))
      .filter((a) => !statusFilter.length || statusFilter.includes(a.status))
      .filter((a) => !serviceFilter.length || a.services.some((s) => s.serviceId && serviceFilter.includes(s.serviceId)))
      .map((a) => {
        const base =
          colorMode === 'status'
            ? STATUS_COLORS[a.status]
            : colorMode === 'staff'
              ? (a.staffColor ?? '#64748b')
              : (serviceColor.get(a.services[0]?.serviceId ?? '') ?? a.staffColor ?? '#3b82f6')
        const muted = a.status === 'cancelled' || a.status === 'no_show'
        return {
          id: a.id,
          start: a.startAt,
          end: a.endAt,
          title: a.clientName,
          backgroundColor: tint(base, muted ? 0.08 : dark ? 0.32 : 0.14, dark),
          borderColor: base,
          textColor: dark ? '#eceef2' : '#14161b',
          editable: !isClosedStatus(a.status),
          classNames: ['dp-event', muted ? 'opacity-60' : ''],
          extendedProps: { appointment: a, color: base }
        }
      })
  }, [appointments, hideCancelled, staffFilter, statusFilter, serviceFilter, colorMode, serviceColor, dark])

  const initialScroll = useMemo(() => {
    const open = Math.min(...hours.filter((d) => d.open).map((d) => Math.floor(d.start / 60)), 9)
    const nowH = new Date().getHours()
    const target = nowH > open + 2 && nowH < 17 ? nowH - 1 : open
    return `${String(Math.max(settings.calendarStartHour, target)).padStart(2, '0')}:00:00`
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

  const move = async (arg: EventDropArg | EventResizeDoneArg) => {
    const a = arg.event.extendedProps.appointment as AppointmentDto
    const startAt = arg.event.start!.getTime()
    const endAt = arg.event.end?.getTime() ?? startAt + (a.endAt - a.startAt)
    try {
      let res = await api('appointments.move', { id: a.id, startAt, endAt })
      if (!res.ok && !res.conflicts.some((c) => c.blocking)) {
        const ok = await confirm({
          title: t.appointment.warningsTitle,
          body: res.conflicts.map((c) => c.message).join('\n'),
          tone: 'primary',
          confirmLabel: t.appointment.saveAnyway
        })
        if (ok) res = await api('appointments.move', { id: a.id, startAt, endAt, acknowledgeWarnings: true })
        else return arg.revert()
      }
      if (!res.ok) {
        arg.revert()
        toast.error(t.calendar.moveConflict, { description: res.conflicts.filter((c) => c.blocking)[0]?.message })
        return
      }
      toast.success(t.calendar.moved)
    } catch (e) {
      arg.revert()
      toast.error(errorMessage(e))
    }
  }

  const changeView = (v: ViewName) => {
    calRef.current?.getApi().changeView(v)
    persist.mutate({ defaultCalendarView: v })
  }
  const go = (dir: 'prev' | 'next' | 'today') => calRef.current?.getApi()[dir]()
  const filtersActive = staffFilter.length + statusFilter.length + serviceFilter.length + (hideCancelled ? 0 : 1)
  const visibleCount = events.length

  return (
    <div className="flex h-full flex-col">
      {/* Barre d'outils */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-1">
          <Button size="sm" onClick={() => go('today')}>
            {t.calendar.today}
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Précédent" onClick={() => go('prev')}>
            <ChevronLeft />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Suivant" onClick={() => go('next')}>
            <ChevronRight />
          </Button>
        </div>
        <h1 className="min-w-[160px] text-[0.95rem] font-semibold">{capitalize(range?.title ?? '')}</h1>
        <span className="text-xs text-subtle-foreground">{visibleCount} rendez-vous</span>

        <div className="ml-auto flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant={filtersActive ? 'soft' : 'secondary'}>
                <Filter /> {t.calendar.filters}
                {filtersActive ? <span className="rounded-full bg-primary px-1.5 text-[0.65rem] text-white">{filtersActive}</span> : null}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[300px] p-3">
              <FilterGroup title={terms.staffNavLabel}>
                {staff.map((s) => (
                  <CheckRow key={s.id} checked={staffFilter.includes(s.id)} onChange={(v) => setStaffFilter(v ? [...staffFilter, s.id] : staffFilter.filter((x) => x !== s.id))}>
                    <span className="size-2 rounded-full" style={{ background: s.color }} /> {s.name}
                  </CheckRow>
                ))}
              </FilterGroup>
              <Separator className="my-2.5" />
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
                <div className="max-h-[140px] overflow-y-auto">
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
                    setStaffFilter([])
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
                    persist.mutate({ calendarColorMode: v })
                  }}
                  className={cn('flex h-8 w-full items-center rounded-md px-2.5 text-left text-[0.8125rem] hover:bg-surface-2', colorMode === v && 'font-medium text-primary')}
                >
                  {label}
                </button>
              ))}
            </PopoverContent>
          </Popover>
          <Segmented<ViewName>
            value={range?.view ?? settings.defaultCalendarView}
            onChange={changeView}
            options={[
              { value: 'timeGridDay', label: t.calendar.day },
              { value: 'timeGridWeek', label: t.calendar.week },
              { value: 'dayGridMonth', label: t.calendar.month },
              { value: 'listWeek', label: t.calendar.agenda }
            ]}
          />
          <Button size="sm" variant="primary" onClick={() => ui.openAppointmentForm()}>
            <Plus /> {t.appointment.new}
          </Button>
        </div>
      </div>

      {/* Calendrier */}
      <div className="dp-calendar relative min-h-0 flex-1 bg-surface">
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          locale={frLocale}
          firstDay={1}
          initialView={settings.defaultCalendarView}
          headerToolbar={false}
          height="100%"
          allDaySlot={false}
          nowIndicator
          slotDuration={`00:${String(settings.calendarSlotMin).padStart(2, '0')}:00`}
          slotLabelInterval="01:00"
          slotMinTime={`${String(settings.calendarStartHour).padStart(2, '0')}:00:00`}
          slotMaxTime={`${String(settings.calendarEndHour).padStart(2, '0')}:00:00`}
          scrollTime={initialScroll}
          slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          dayHeaderFormat={range?.view === 'dayGridMonth' ? { weekday: 'short' } : { weekday: 'short', day: '2-digit', month: range?.view === 'timeGridDay' ? 'long' : undefined }}
          businessHours={businessHours}
          selectable
          selectMirror
          editable
          eventDurationEditable
          eventStartEditable
          snapDuration="00:05:00"
          dayMaxEvents={4}
          expandRows
          events={events}
          eventContent={renderEvent}
          select={(arg: DateSelectArg) => {
            const minutes = Math.round((arg.end.getTime() - arg.start.getTime()) / 60000)
            const startAt = arg.allDay ? arg.start.getTime() + 9 * 3600_000 : arg.start.getTime()
            ui.openAppointmentForm({ startAt, durationMin: arg.allDay || minutes <= settings.calendarSlotMin ? undefined : minutes })
            calRef.current?.getApi().unselect()
          }}
          eventClick={(arg: EventClickArg) => ui.openAppointment(arg.event.id)}
          eventDrop={(arg) => void move(arg)}
          eventResize={(arg) => void move(arg)}
          datesSet={(arg: DatesSetArg) => {
            const view = arg.view.type as ViewName
            setRange({ from: arg.start.getTime(), to: arg.end.getTime(), title: arg.view.title, view })
          }}
          noEventsContent={() => (
            <div className="py-10 text-center text-[0.8125rem] text-muted-foreground">
              {t.calendar.emptyRange}
              <div className="mt-3">
                <Button size="sm" variant="primary" onClick={() => ui.openAppointmentForm()}>
                  <Plus /> {t.dashboard.addAppointment}
                </Button>
              </div>
            </div>
          )}
        />
        {range?.view === 'timeGridDay' && visibleCount === 0 ? (
          <div className="pointer-events-none absolute inset-x-0 top-24 flex justify-center">
            <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-border bg-surface px-4 py-2 text-[0.8125rem] shadow-md">
              <CalendarDays className="size-4 text-muted-foreground" />
              {sameDayAsToday(range.from) ? t.calendar.emptyDay : 'Aucun rendez-vous ce jour-là.'}
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

function sameDayAsToday(ms: number) {
  return new Date(ms).toDateString() === new Date().toDateString()
}

function renderEvent(arg: EventContentArg) {
  const a = arg.event.extendedProps.appointment as AppointmentDto
  const color = arg.event.extendedProps.color as string
  const services = a.services.map((s) => s.name).join(' + ')
  if (arg.view.type === 'listWeek') {
    return (
      <div className="flex items-center gap-2">
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
      <div className="flex w-full min-w-0 items-center gap-1 overflow-hidden px-1 text-[0.72rem]">
        <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />
        <span className="tabular shrink-0 text-muted-foreground">{arg.timeText}</span>
        <span className={cn('truncate font-medium', a.status === 'cancelled' && 'line-through')}>{a.clientName}</span>
      </div>
    )
  }
  const short = (a.endAt - a.startAt) / 60000 <= 25
  return (
    <div className="flex h-full min-w-0 overflow-hidden rounded-[5px] border-l-[3px] px-1.5 py-1 leading-tight" style={{ borderColor: color }}>
      <div className="min-w-0 flex-1">
        <div className={cn('flex items-center gap-1 truncate text-[0.75rem] font-semibold', a.status === 'cancelled' && 'line-through')}>
          {short ? <span className="tabular font-normal opacity-70">{arg.timeText.split(' - ')[0]}</span> : null}
          <span className="truncate">{a.clientName}</span>
        </div>
        {!short ? (
          <>
            <div className="truncate text-[0.7rem] opacity-80">{services}</div>
            <div className="tabular truncate text-[0.68rem] opacity-60">
              {arg.timeText}
              {a.staffName ? ` · ${a.staffName}` : ''}
            </div>
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
