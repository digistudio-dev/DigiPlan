// Graphiques sobres : une seule teinte, axes discrets, info-bulle au survol.

import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { formatMoney } from '@shared/domain/money'
import { fromIsoDate } from '@shared/format'

const axis = { fontSize: 11, fill: 'var(--subtle-foreground)' }

function ChartTooltip({ active, payload, currency }: { active?: boolean; payload?: Array<{ value: number; payload: { date: string } }>; currency: string }) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  return (
    <div className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs shadow-md">
      <div className="text-muted-foreground capitalize">{format(fromIsoDate(p.payload.date), 'EEEE dd MMMM', { locale: fr })}</div>
      <div className="tabular font-semibold">{formatMoney(p.value, currency)}</div>
    </div>
  )
}

const compact = (cents: number) => {
  const v = cents / 100
  return v >= 1000 ? `${(v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k` : v.toLocaleString('fr-FR')
}

/** Tendance des encaissements (aire). */
export function RevenueArea({ data, currency, height = 140 }: { data: Array<{ date: string; amount: number }>; currency: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
        <defs>
          <linearGradient id="dp-rev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="date"
          tick={axis}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
          tickFormatter={(d: string) => format(fromIsoDate(d), 'dd/MM')}
          minTickGap={24}
        />
        <YAxis hide domain={[0, 'auto']} />
        <Tooltip content={<ChartTooltip currency={currency} />} cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1 }} />
        <Area
          type="monotone"
          dataKey="amount"
          stroke="var(--primary)"
          strokeWidth={2}
          fill="url(#dp-rev)"
          activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

/** Encaissements par jour (barres). */
export function RevenueBars({ data, currency, height = 240 }: { data: Array<{ date: string; amount: number }>; currency: string; height?: number }) {
  const many = data.length > 45
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={many ? 1 : '22%'}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tick={axis}
          tickLine={false}
          axisLine={{ stroke: 'var(--border)' }}
          tickFormatter={(d: string) => format(fromIsoDate(d), data.length > 62 ? 'MMM' : 'dd/MM', { locale: fr })}
          minTickGap={18}
        />
        <YAxis tick={axis} tickLine={false} axisLine={false} width={44} tickFormatter={compact} />
        <Tooltip content={<ChartTooltip currency={currency} />} cursor={{ fill: 'var(--surface-2)' }} />
        <Bar dataKey="amount" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Barres horizontales classées, avec libellés et valeurs en texte. */
export function RankedBars({
  rows,
  formatValue,
  max
}: {
  rows: Array<{ key: string; label: React.ReactNode; value: number; sub?: React.ReactNode }>
  formatValue: (v: number) => string
  max?: number
}) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value))
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key} className="group" title={`${formatValue(r.value)}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[0.8125rem]">
            <span className="min-w-0 truncate">{r.label}</span>
            <span className="tabular shrink-0 font-medium">
              {formatValue(r.value)}
              {r.sub ? <span className="ml-1.5 font-normal text-subtle-foreground">{r.sub}</span> : null}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-primary transition-[width] duration-300 group-hover:brightness-110" style={{ width: `${Math.max(2, (r.value / top) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}
