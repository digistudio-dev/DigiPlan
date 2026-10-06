// Tableau de bord et rapports : agrégations SQL locales.

import { addDays, differenceInCalendarDays, endOfDay, startOfDay, startOfISOWeek, startOfMonth, subDays } from 'date-fns'
import type { DashboardData, PaymentMethod, ReportData } from '@shared/types'
import { commissionAmount } from '@shared/domain/pricing'
import { DAY } from '@shared/domain/time'
import { fromIsoDate, toIsoDate } from '@shared/format'
import { PAYMENT_METHODS } from '@shared/status'
import { all, get } from '../db/raw'
import { isPro } from '../license/service'
import { loadAppointments } from './appointments'
import { DUE_STATUSES_SQL } from './clients'

function revenueBetween(from: number, to: number, staffId?: string | null): number {
  if (staffId) {
    return (
      get<{ s: number }>(
        `SELECT COALESCE(SUM(p.amount), 0) AS s FROM payments p JOIN appointments a ON a.id = p.appointment_id
         WHERE p.voided_at IS NULL AND p.paid_at >= ? AND p.paid_at < ? AND a.staff_id = ?`,
        [from, to, staffId]
      )?.s ?? 0
    )
  }
  return (
    get<{ s: number }>('SELECT COALESCE(SUM(amount), 0) AS s FROM payments WHERE voided_at IS NULL AND paid_at >= ? AND paid_at < ?', [
      from,
      to
    ])?.s ?? 0
  )
}

function dailyRevenue(from: number, to: number, staffId?: string | null): Array<{ date: string; amount: number }> {
  const rows = staffId
    ? all<{ paid_at: number; amount: number }>(
        `SELECT p.paid_at, p.amount FROM payments p JOIN appointments a ON a.id = p.appointment_id
         WHERE p.voided_at IS NULL AND p.paid_at >= ? AND p.paid_at < ? AND a.staff_id = ?`,
        [from, to, staffId]
      )
    : all<{ paid_at: number; amount: number }>(
        'SELECT paid_at, amount FROM payments WHERE voided_at IS NULL AND paid_at >= ? AND paid_at < ?',
        [from, to]
      )
  const buckets = new Map<string, number>()
  for (let d = from; d < to; d = addDays(d, 1).getTime()) buckets.set(toIsoDate(d), 0)
  for (const r of rows) {
    const key = toIsoDate(r.paid_at)
    buckets.set(key, (buckets.get(key) ?? 0) + r.amount)
  }
  return [...buckets.entries()].map(([date, amount]) => ({ date, amount }))
}

function outstanding(): { total: number; count: number } {
  const r = get<{ total: number; count: number }>(
    `SELECT COALESCE(SUM(bal), 0) AS total, COUNT(*) AS count FROM (
       SELECT a.total - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.appointment_id = a.id AND p.voided_at IS NULL), 0) AS bal
       FROM appointments a WHERE a.deleted_at IS NULL AND a.status IN ${DUE_STATUSES_SQL}
     ) WHERE bal > 0`
  )
  return { total: r?.total ?? 0, count: r?.count ?? 0 }
}

export function getDashboard(): DashboardData {
  const now = Date.now()
  const dayStart = startOfDay(now).getTime()
  const dayEnd = endOfDay(now).getTime() + 1
  const today = loadAppointments('a.start_at >= @from AND a.start_at < @to', { from: dayStart, to: dayEnd })
  const [next] = loadAppointments(
    "a.end_at > @now AND a.status IN ('pending','confirmed')",
    { now },
    'ORDER BY a.start_at LIMIT 1'
  )
  const d30 = subDays(dayStart, 30).getTime()

  const noShow = get<{ ns: number; done: number }>(
    `SELECT SUM(status = 'no_show') AS ns, SUM(status IN ('completed','no_show')) AS done
     FROM appointments WHERE deleted_at IS NULL AND start_at >= ? AND start_at < ?`,
    [d30, dayEnd]
  )
  const topService = get<{ name: string; n: number }>(
    `SELECT s.name, COUNT(*) AS n FROM appointment_services s JOIN appointments a ON a.id = s.appointment_id
     WHERE a.deleted_at IS NULL AND a.status NOT IN ('cancelled','no_show') AND a.start_at >= ? AND a.start_at < ?
     GROUP BY s.name ORDER BY n DESC LIMIT 1`,
    [d30, dayEnd]
  )
  const topStaff = get<{ name: string; color: string; n: number }>(
    `SELECT st.name, st.color, COUNT(*) AS n FROM appointments a JOIN staff st ON st.id = a.staff_id
     WHERE a.deleted_at IS NULL AND a.status = 'completed' AND a.start_at >= ? AND a.start_at < ?
     GROUP BY st.id ORDER BY n DESC LIMIT 1`,
    [d30, dayEnd]
  )
  const out = outstanding()
  const active = today.filter((a) => a.status !== 'cancelled')

  return {
    now,
    todayAppointments: today,
    nextAppointment: next ?? null,
    kpis: {
      todayCount: active.filter((a) => a.status !== 'no_show').length,
      todayCompleted: today.filter((a) => a.status === 'completed').length,
      todayUpcoming: today.filter((a) => (a.status === 'pending' || a.status === 'confirmed') && a.startAt > now).length,
      todayCancelled: today.filter((a) => a.status === 'cancelled').length,
      todayNoShow: today.filter((a) => a.status === 'no_show').length,
      todayRevenue: revenueBetween(dayStart, dayEnd),
      waitingCount: today.filter((a) => a.status === 'arrived').length,
      outstandingBalance: out.total,
      outstandingCount: out.count,
      noShowRate30d: noShow && noShow.done ? noShow.ns / noShow.done : null,
      weekRevenue: revenueBetween(startOfISOWeek(now).getTime(), dayEnd),
      monthRevenue: revenueBetween(startOfMonth(now).getTime(), dayEnd),
      newClients30d: get<{ n: number }>('SELECT COUNT(*) AS n FROM clients WHERE created_at >= ?', [d30])?.n ?? 0
    },
    topService: topService ? { name: topService.name, count: topService.n } : null,
    topStaff: topStaff ? { name: topStaff.name, count: topStaff.n, color: topStaff.color } : null,
    revenueTrend: dailyRevenue(subDays(dayStart, 13).getTime(), dayEnd)
  }
}

export function getReport(input: { from: string; to: string; staffId?: string | null }): ReportData {
  const from = fromIsoDate(input.from)
  const to = endOfDay(fromIsoDate(input.to)).getTime() + 1
  const days = Math.max(1, differenceInCalendarDays(to - 1, from) + 1)
  const prevFrom = from - days * DAY
  const staffId = input.staffId ?? null
  const pro = isPro()
  const staffClause = staffId ? 'AND a.staff_id = @staff' : ''
  const params = { from, to, staff: staffId }

  const counts = get<{ total: number; completed: number; cancelled: number; noshow: number; completed_value: number }>(
    `SELECT COUNT(*) AS total, COALESCE(SUM(status = 'completed'), 0) AS completed, COALESCE(SUM(status = 'cancelled'), 0) AS cancelled,
       COALESCE(SUM(status = 'no_show'), 0) AS noshow, COALESCE(SUM(CASE WHEN status = 'completed' THEN total END), 0) AS completed_value
     FROM appointments a WHERE a.deleted_at IS NULL AND a.start_at >= @from AND a.start_at < @to ${staffClause}`,
    params
  ) ?? { total: 0, completed: 0, cancelled: 0, noshow: 0, completed_value: 0 }

  const revenue = revenueBetween(from, to, staffId)
  const methods = all<{ method: PaymentMethod; amount: number; n: number }>(
    staffId
      ? `SELECT p.method, SUM(p.amount) AS amount, COUNT(*) AS n FROM payments p JOIN appointments a ON a.id = p.appointment_id
         WHERE p.voided_at IS NULL AND p.paid_at >= @from AND p.paid_at < @to AND a.staff_id = @staff GROUP BY p.method`
      : `SELECT method, SUM(amount) AS amount, COUNT(*) AS n FROM payments
         WHERE voided_at IS NULL AND paid_at >= @from AND paid_at < @to GROUP BY method`,
    params
  )

  const byStaff = all<{ id: string | null; name: string | null; color: string | null; rate: number | null; n: number; value: number }>(
    `SELECT st.id, st.name, st.color, st.commission_rate AS rate, COUNT(*) AS n, COALESCE(SUM(a.total), 0) AS value
     FROM appointments a LEFT JOIN staff st ON st.id = a.staff_id
     WHERE a.deleted_at IS NULL AND a.status = 'completed' AND a.start_at >= @from AND a.start_at < @to ${staffClause}
     GROUP BY st.id ORDER BY value DESC`,
    params
  )
  const byService = all<{ name: string; n: number; value: number }>(
    `SELECT s.name, COUNT(*) AS n, COALESCE(SUM(s.price), 0) AS value
     FROM appointment_services s JOIN appointments a ON a.id = s.appointment_id
     WHERE a.deleted_at IS NULL AND a.status = 'completed' AND a.start_at >= @from AND a.start_at < @to ${staffClause}
     GROUP BY s.name ORDER BY n DESC, value DESC LIMIT 20`,
    params
  )
  const recurring =
    get<{ n: number }>(
      `SELECT COUNT(DISTINCT a.client_id) AS n FROM appointments a
       WHERE a.deleted_at IS NULL AND a.status = 'completed' AND a.start_at >= @from AND a.start_at < @to ${staffClause}
         AND EXISTS (SELECT 1 FROM appointments b WHERE b.client_id = a.client_id AND b.deleted_at IS NULL
                     AND b.status = 'completed' AND b.start_at < @from)`,
      params
    )?.n ?? 0
  const newClients = get<{ n: number }>('SELECT COUNT(*) AS n FROM clients WHERE created_at >= @from AND created_at < @to', params)?.n ?? 0

  const unpaidRows = all<{ id: string; name: string; start_at: number; total: number; bal: number }>(
    `SELECT * FROM (
       SELECT a.id, TRIM(c.first_name || ' ' || c.last_name) AS name, a.start_at, a.total,
         a.total - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.appointment_id = a.id AND p.voided_at IS NULL), 0) AS bal
       FROM appointments a JOIN clients c ON c.id = a.client_id
       WHERE a.deleted_at IS NULL AND a.status IN ${DUE_STATUSES_SQL} AND a.start_at >= @from AND a.start_at < @to ${staffClause}
     ) WHERE bal > 0 ORDER BY start_at DESC`,
    params
  )
  const expenses = all<{ category: string; amount: number }>(
    `SELECT category, SUM(amount) AS amount FROM expenses WHERE deleted_at IS NULL AND date >= ? AND date <= ?
     GROUP BY category ORDER BY amount DESC`,
    [input.from, input.to]
  )
  const expensesTotal = staffId ? 0 : expenses.reduce((s, e) => s + e.amount, 0)
  const noShowBase = counts.completed + counts.noshow

  return {
    range: { from: input.from, to: input.to },
    revenue,
    previousRevenue: revenueBetween(prevFrom, from, staffId),
    appointmentCount: counts.total,
    completedCount: counts.completed,
    cancelledCount: counts.cancelled,
    noShowCount: counts.noshow,
    averageTicket: counts.completed ? Math.round(counts.completed_value / counts.completed) : 0,
    noShowRate: noShowBase ? counts.noshow / noShowBase : null,
    revenueByDay: dailyRevenue(from, to, staffId),
    paymentMethods: PAYMENT_METHODS.map((m) => {
      const r = methods.find((x) => x.method === m)
      return { method: m, amount: r?.amount ?? 0, count: r?.n ?? 0 }
    }),
    byStaff: pro
      ? byStaff.map((s) => ({
          staffId: s.id,
          name: s.name ?? 'Non assigné',
          color: s.color ?? '#94a3b8',
          count: s.n,
          value: s.value,
          commission: commissionAmount(s.value, s.rate)
        }))
      : [],
    byService: pro ? byService.map((s) => ({ name: s.name, count: s.n, value: s.value })) : [],
    recurringClients: pro ? recurring : 0,
    newClients,
    unpaid: pro
      ? unpaidRows.slice(0, 100).map((u) => ({ appointmentId: u.id, clientName: u.name, startAt: u.start_at, total: u.total, balance: u.bal }))
      : [],
    unpaidTotal: unpaidRows.reduce((s, u) => s + u.bal, 0),
    expensesTotal: pro ? expensesTotal : 0,
    expensesByCategory: pro && !staffId ? expenses : [],
    net: revenue - (pro ? expensesTotal : 0)
  }
}
