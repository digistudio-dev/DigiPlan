// Application installée : premier lancement propre, assistant, rendez-vous, emplacements des données.
const invoke = (page, channel, input) => page.evaluate(([c, i]) => window.digiplan.invoke(c, i), [channel, input])

export default async ({ page, shot, log }) => {
  await page.getByText('Bienvenue sur DigiPlan').waitFor({ timeout: 60_000 })
  await shot('installed-welcome')
  await page.getByRole('button', { name: /Commencer la configuration/ }).click()
  await page.getByRole('button', { name: /Salon de coiffure/ }).click()
  await page.getByRole('button', { name: /Continuer/ }).click()
  await page.locator('#b-name').fill('Salon Atlas')
  await page.getByRole('button', { name: /Continuer/ }).click()
  await page.getByRole('button', { name: /Continuer/ }).click()
  await page.locator('#s-name').fill('Nadia')
  await page.getByRole('button', { name: /Continuer/ }).click()
  await page.getByRole('button', { name: /Terminer la configuration/ }).click()
  await page.getByRole('button', { name: /Commencer avec DigiPlan/ }).click()
  await page.getByText('Prochain rendez-vous').first().waitFor({ timeout: 20_000 })

  const info = (await invoke(page, 'app.info')).data
  log('version', info.version, '| dev :', info.isDev)
  log('données :', info.databasePath)

  const staff = (await invoke(page, 'staff.list')).data
  const { services } = (await invoke(page, 'services.list')).data
  const start = new Date()
  start.setDate(start.getDate() + 1)
  start.setHours(11, 0, 0, 0)
  if (start.getDay() === 0) start.setDate(start.getDate() + 1)
  const res = await invoke(page, 'appointments.save', {
    newClient: { firstName: 'Leila', lastName: 'Amrani', phone: '0612345678', whatsappPhone: '', email: '', birthDate: null, gender: null, address: '', insurance: '', notes: '', tags: [] },
    staffId: staff[0].id,
    startAt: start.getTime(),
    services: [{ serviceId: services[0].id, name: services[0].name, durationMin: services[0].durationMin, price: services[0].price }],
    discount: 0,
    status: 'confirmed',
    notes: '',
    reminderEnabled: false,
    reminderOffsetMin: 1440
  })
  log('rendez-vous :', res.ok && res.data.ok ? 'créé' : JSON.stringify(res))
  // Glisser-déposer simulé : déplacement d'une heure via le canal utilisé par le calendrier.
  const moved = await invoke(page, 'appointments.move', { id: res.data.appointment.id, startAt: start.getTime() + 3600_000, endAt: res.data.appointment.endAt + 3600_000 })
  log('déplacement :', moved.ok && moved.data.ok ? 'OK' : JSON.stringify(moved))
  const backup = await invoke(page, 'backup.create')
  log('sauvegarde :', backup.ok ? backup.data.filePath : backup.error.message)
  await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: 'Calendrier' }).click()
  await page.waitForTimeout(1200)
  await shot('installed-calendar')
}
