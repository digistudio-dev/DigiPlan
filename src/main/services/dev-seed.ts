// Données de démonstration — UNIQUEMENT en développement (`npm run seed:dev`).
// Jamais exécuté dans une version installée.

import { app } from 'electron'
import { addDays, setHours, setMinutes, startOfDay } from 'date-fns'
import { get } from '../db/raw'
import { createLogger } from '../logger'
import { listCatalog } from './catalog'
import { saveClient } from './clients'
import { listStaff } from './staff'
import { saveAppointment, setAppointmentStatus } from './appointments'
import { createPayment } from './payments'

const log = createLogger('seed')

const FIRST = ['Youssef', 'Fatima Zahra', 'Mehdi', 'Salma', 'Omar', 'Imane', 'Hamza', 'Kawtar', 'Anas', 'Nour', 'Rachid', 'Sara', 'Karim', 'Hiba', 'Ayoub', 'Meryem']
const LAST = ['El Amrani', 'Benjelloun', 'Alaoui', 'Bennani', 'Tazi', 'Idrissi', 'Chraibi', 'Berrada', 'Fassi', 'Lahlou', 'Ouazzani', 'Sqalli']

export function seedDevData(): void {
  if (app.isPackaged) return
  const onboarded = get<{ n: number }>('SELECT COUNT(*) AS n FROM business_settings WHERE onboarded_at IS NOT NULL')?.n
  if (!onboarded) {
    log.warn('Seed ignoré : terminez d’abord l’assistant de configuration.')
    return
  }
  if ((get<{ n: number }>('SELECT COUNT(*) AS n FROM clients')?.n ?? 0) > 5) {
    log.info('Seed ignoré : des clients existent déjà.')
    return
  }
  const staff = listStaff()
  const { services } = listCatalog()
  if (!staff.length || !services.length) return

  const clientIds: string[] = []
  for (let i = 0; i < 24; i++) {
    const c = saveClient({
      firstName: FIRST[i % FIRST.length],
      lastName: LAST[(i * 7) % LAST.length],
      phone: `06${String(10000000 + i * 734521).slice(0, 8)}`,
      whatsappPhone: '',
      email: '',
      birthDate: null,
      gender: null,
      address: '',
      insurance: '',
      notes: '',
      tags: i % 5 === 0 ? ['Fidèle'] : []
    })
    clientIds.push(c.id)
  }

  const today = startOfDay(Date.now())
  let n = 0
  for (let d = -10; d <= 6; d++) {
    const day = addDays(today, d)
    if (day.getDay() === 0) continue
    for (const hour of [9, 10.5, 12, 14.5, 16, 17.5]) {
      if ((d + hour) % 3 === 0) continue
      const s = services[n % services.length]
      const start = setMinutes(setHours(day, Math.floor(hour)), (hour % 1) * 60).getTime()
      const res = saveAppointment({
        clientId: clientIds[n % clientIds.length],
        staffId: staff[n % staff.length].id,
        startAt: start,
        services: [{ serviceId: s.id, name: s.name, durationMin: s.durationMin, price: s.price }],
        discount: 0,
        status: 'confirmed',
        notes: '',
        reminderEnabled: false,
        reminderOffsetMin: 1440,
        acknowledgeWarnings: true
      })
      n++
      if (!res.ok) continue
      if (d < 0) {
        const status = n % 9 === 0 ? 'no_show' : n % 11 === 0 ? 'cancelled' : 'completed'
        setAppointmentStatus(res.appointment.id, status)
        if (status === 'completed' && n % 4 !== 0) {
          createPayment({
            appointmentId: res.appointment.id,
            amount: res.appointment.total,
            method: n % 3 === 0 ? 'card' : 'cash',
            paidAt: res.appointment.endAt,
            note: ''
          })
        }
      }
    }
  }
  log.info(`Seed terminé : ${clientIds.length} clients, ${n} rendez-vous`)
}
