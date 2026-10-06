// Éditeur d'horaires hebdomadaires (établissement ou membre de l'équipe).

import { CopyCheck, Plus, X } from 'lucide-react'
import type { DaySchedule } from '@shared/types'
import { hhmmToMinutes, minutesToHHMM } from '@shared/domain/time'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'
import { Switch } from './ui/primitives'
import { Button } from './ui/button'

function TimeField({ value, onChange, disabled, label }: { value: number; onChange: (m: number) => void; disabled?: boolean; label: string }) {
  return (
    <input
      type="time"
      step={300}
      aria-label={label}
      disabled={disabled}
      value={minutesToHHMM(Math.min(value, 23 * 60 + 59))}
      onChange={(e) => {
        const m = hhmmToMinutes(e.target.value)
        if (m !== null) onChange(m)
      }}
      className="tabular h-7 w-[84px] rounded-md border border-border bg-surface px-2 text-[0.8125rem] shadow-sm hover:border-border-strong focus:border-primary focus:ring-3 focus:ring-ring/60 focus:outline-none disabled:opacity-40"
    />
  )
}

export function validateWeek(week: DaySchedule[]): string | null {
  for (const d of week) {
    if (!d.open) continue
    const name = t.hours.weekdays[d.weekday - 1]
    if (d.end <= d.start) return `${name} : l'heure de fermeture doit être après l'ouverture.`
    for (const b of d.breaks) {
      if (b.end <= b.start) return `${name} : la pause est invalide.`
      if (b.start < d.start || b.end > d.end) return `${name} : la pause doit être comprise dans les horaires.`
    }
  }
  return null
}

export function WeekScheduleEditor({ value, onChange, compact }: { value: DaySchedule[]; onChange: (w: DaySchedule[]) => void; compact?: boolean }) {
  const update = (weekday: number, patch: Partial<DaySchedule>) => onChange(value.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)))
  const copyToAll = (source: DaySchedule) =>
    onChange(value.map((d) => (d.open && d.weekday !== source.weekday ? { ...d, start: source.start, end: source.end, breaks: source.breaks.map((b) => ({ ...b })) } : d)))

  return (
    <div className="divide-y divide-border rounded-lg border border-border bg-surface">
      {value.map((day) => (
        <div key={day.weekday} className={cn('group flex items-start gap-3 px-3', compact ? 'py-2' : 'py-2.5')}>
          <label className="flex w-[118px] shrink-0 cursor-pointer items-center gap-2.5 pt-1">
            <Switch checked={day.open} onCheckedChange={(open) => update(day.weekday, { open })} aria-label={t.hours.weekdays[day.weekday - 1]} />
            <span className={cn('text-[0.8125rem] font-medium', !day.open && 'text-subtle-foreground')}>{t.hours.weekdays[day.weekday - 1]}</span>
          </label>
          {day.open ? (
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <TimeField label="Ouverture" value={day.start} onChange={(start) => update(day.weekday, { start })} />
                <span className="text-xs text-subtle-foreground">–</span>
                <TimeField label="Fermeture" value={day.end} onChange={(end) => update(day.weekday, { end })} />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="ml-1"
                  onClick={() => update(day.weekday, { breaks: [...day.breaks, { start: 13 * 60, end: 14 * 60 }] })}
                >
                  <Plus /> {t.hours.break}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="ml-auto opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                  onClick={() => copyToAll(day)}
                  title={t.hours.copyToAll}
                >
                  <CopyCheck /> Copier partout
                </Button>
              </div>
              {day.breaks.map((b, i) => (
                <div key={i} className="flex items-center gap-2 pl-0.5">
                  <span className="w-[84px] text-xs text-muted-foreground">{t.hours.break}</span>
                  <TimeField
                    label="Début de pause"
                    value={b.start}
                    onChange={(start) => update(day.weekday, { breaks: day.breaks.map((x, j) => (j === i ? { ...x, start } : x)) })}
                  />
                  <span className="text-xs text-subtle-foreground">–</span>
                  <TimeField
                    label="Fin de pause"
                    value={b.end}
                    onChange={(end) => update(day.weekday, { breaks: day.breaks.map((x, j) => (j === i ? { ...x, end } : x)) })}
                  />
                  <button
                    type="button"
                    aria-label="Retirer la pause"
                    onClick={() => update(day.weekday, { breaks: day.breaks.filter((_, j) => j !== i) })}
                    className="rounded p-1 text-subtle-foreground hover:bg-surface-2 hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <span className="pt-1.5 text-[0.8125rem] text-subtle-foreground">{t.hours.closed}</span>
          )}
        </div>
      ))}
    </div>
  )
}
