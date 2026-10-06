// Petit calendrier mensuel pour sauter rapidement à une date.

import { useState } from 'react'
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn, capitalize } from '@/lib/utils'

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

export function MiniMonth({ value, onSelect }: { value: number; onSelect: (date: number) => void }) {
  const [month, setMonth] = useState(() => startOfMonth(value))
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
  })
  return (
    <div className="w-[248px] p-3 select-none">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" aria-label="Mois précédent" onClick={() => setMonth((m) => addMonths(m, -1))} className="rounded-md p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground">
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-[0.8125rem] font-semibold">{capitalize(format(month, 'MMMM yyyy', { locale: fr }))}</span>
        <button type="button" aria-label="Mois suivant" onClick={() => setMonth((m) => addMonths(m, 1))} className="rounded-md p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground">
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAYS.map((d, i) => (
          <span key={i} className="pb-1 text-[0.6875rem] font-medium text-subtle-foreground">
            {d}
          </span>
        ))}
        {days.map((d) => {
          const selected = isSameDay(d, value)
          return (
            <button
              key={d.getTime()}
              type="button"
              onClick={() => onSelect(d.getTime())}
              className={cn(
                'tabular h-8 rounded-md text-xs transition-colors',
                !isSameMonth(d, month) && 'text-subtle-foreground/60',
                selected ? 'bg-primary font-semibold text-white' : 'hover:bg-surface-2',
                !selected && isToday(d) && 'font-semibold text-primary ring-1 ring-primary/40 ring-inset'
              )}
            >
              {format(d, 'd')}
            </button>
          )
        })}
      </div>
      <button type="button" onClick={() => onSelect(Date.now())} className="mt-2 w-full rounded-md py-1.5 text-xs font-medium text-primary hover:bg-primary-soft/60">
        Aujourd’hui
      </button>
    </div>
  )
}
