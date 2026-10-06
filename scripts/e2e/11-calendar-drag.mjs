// Glisser-déposer et redimensionnement déterministes, vérifiés en base.
const invoke = (page, channel, input) => page.evaluate(([c, i]) => window.digiplan.invoke(c, i), [channel, input])

export default async ({ page, shot, log }) => {
  await page.getByText('Prochain rendez-vous').first().waitFor({ timeout: 30_000 })
  const staff = (await invoke(page, 'staff.list')).data
  const { services } = (await invoke(page, 'services.list')).data

  // Rendez-vous de test demain 10:00, sur une journée vide pour ce test.
  const day = new Date()
  day.setDate(day.getDate() + 1)
  if (day.getDay() === 0) day.setDate(day.getDate() + 1)
  const at = (h, m = 0) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m).getTime()
  const existing = (await invoke(page, 'appointments.range', { from: at(0), to: at(23, 59) })).data
  for (const a of existing) await invoke(page, 'appointments.setStatus', { id: a.id, status: 'cancelled' })
  const s = services[0]
  const created = await invoke(page, 'appointments.save', {
    newClient: { firstName: 'Test', lastName: 'Glisser', phone: '', whatsappPhone: '', email: '', birthDate: null, gender: null, address: '', insurance: '', notes: '', tags: [] },
    staffId: staff[0].id,
    startAt: at(10),
    services: [{ serviceId: s.id, name: s.name, durationMin: 30, price: s.price }],
    discount: 0,
    status: 'confirmed',
    notes: '',
    reminderEnabled: false,
    reminderOffsetMin: 1440
  })
  const id = created.data.appointment.id
  log('créé :', new Date(created.data.appointment.startAt).toTimeString().slice(0, 5))

  await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: 'Calendrier' }).click()
  await page.getByRole('radio', { name: 'Jour' }).click()
  await page.getByRole('button', { name: "Aujourd'hui" }).click()
  await page.getByRole('button', { name: 'Suivant' }).click()
  if (new Date().getDay() === 6) await page.getByRole('button', { name: 'Suivant' }).click()
  const ev = page.locator('.fc-timegrid-event', { hasText: 'Test Glisser' })
  await ev.waitFor()
  await ev.scrollIntoViewIfNeeded()
  const slotH = await page.evaluate(() => {
    const a = document.querySelector('.fc-timegrid-slot-lane[data-time="10:00:00"]').getBoundingClientRect()
    const b = document.querySelector('.fc-timegrid-slot-lane[data-time="11:00:00"]').getBoundingClientRect()
    return b.top - a.top
  })

  // 1. Déplacement de +1 h (10:00 → 11:00).
  let box = await ev.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + 10)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y + 10 + slotH / 2, { steps: 8 })
  await page.mouse.move(box.x + box.width / 2, box.y + 10 + slotH, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(1500)
  let a = (await invoke(page, 'appointments.get', { id })).data
  log('après glisser :', new Date(a.startAt).toTimeString().slice(0, 5), '–', new Date(a.endAt).toTimeString().slice(0, 5), '| dialogues ouverts :', await page.getByRole('dialog').count())

  // 2. Redimensionnement : +30 min par la poignée du bas.
  await ev.hover()
  box = await ev.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 3)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 3 + slotH / 2, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(1500)
  a = (await invoke(page, 'appointments.get', { id })).data
  log('après redimensionnement :', new Date(a.startAt).toTimeString().slice(0, 5), '–', new Date(a.endAt).toTimeString().slice(0, 5))
  await shot('drag-resize')

  // 3. Glisser sur un créneau occupé : refusé et remis à sa place.
  const blocker = await invoke(page, 'appointments.save', {
    newClient: { firstName: 'Occupe', lastName: 'Creneau', phone: '', whatsappPhone: '', email: '', birthDate: null, gender: null, address: '', insurance: '', notes: '', tags: [] },
    staffId: staff[0].id,
    startAt: at(15),
    services: [{ serviceId: s.id, name: s.name, durationMin: 60, price: s.price }],
    discount: 0,
    status: 'confirmed',
    notes: '',
    reminderEnabled: false,
    reminderOffsetMin: 1440
  })
  await page.waitForTimeout(800)
  box = await ev.boundingBox()
  const target = await page.locator('.fc-timegrid-slot-lane[data-time="15:00:00"]').boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + 10)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, (box.y + target.y) / 2, { steps: 8 })
  await page.mouse.move(box.x + box.width / 2, target.y + 10, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(1500)
  a = (await invoke(page, 'appointments.get', { id })).data
  const evTop = (await ev.boundingBox()).y
  log('créneau occupé → reste à', new Date(a.startAt).toTimeString().slice(0, 5), '| affiché à sa place :', Math.abs(evTop - box.y) < 4, '| conflit créé :', Boolean(blocker.ok))
  await shot('drag-refused')
}
