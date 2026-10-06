// Mesure de la réactivité du calendrier (navigation, changement de vue, glisser-déposer, ouverture de panneaux).

export default async ({ page, shot, log }) => {
  await page.getByText('Prochain rendez-vous').first().waitFor({ timeout: 30_000 })
  const nav = page.getByRole('navigation', { name: 'Navigation principale' })

  // Compte les appels IPC « appointments.range » et « bootstrap.get » (rechargements inutiles).
  await page.evaluate(() => {
    const w = window
    w.__calls = {}
    const orig = w.digiplan.invoke
    w.digiplan = { ...w.digiplan, invoke: (c, i) => ((w.__calls[c] = (w.__calls[c] ?? 0) + 1), orig(c, i)) }
  }).catch(() => log('instrumentation impossible (pont figé)'))

  const t0 = Date.now()
  await nav.getByRole('button', { name: 'Calendrier' }).click()
  await page.locator('.fc-timegrid, .fc-daygrid, .fc-list').first().waitFor()
  log('ouverture calendrier (ms):', Date.now() - t0)

  // Mesure dans la page : du clic jusqu'au rendu affiché (2 images), sans le surcoût de Playwright.
  const inPage = (selector) =>
    page.evaluate(async (sel) => {
      const el = document.querySelector(sel)
      const t = performance.now()
      el.click()
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      return Math.round(performance.now() - t)
    }, selector)
  const samples = { nav: [], view: [] }
  for (let i = 0; i < 6; i++) {
    samples.nav.push(await inPage('button[aria-label="Suivant"]'))
    await page.waitForTimeout(250)
  }
  for (const v of ['Jour', 'Mois', 'Agenda', 'Semaine', 'Jour', 'Semaine']) {
    samples.view.push(await page.evaluate(async (label) => {
      const el = [...document.querySelectorAll('[role=radio]')].find((x) => x.textContent === label)
      const t = performance.now()
      el.click()
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      return Math.round(performance.now() - t)
    }, v))
    await page.waitForTimeout(250)
  }
  log('rendu navigation (ms, dans la page) :', samples.nav.join(', '))
  log('rendu changement de vue (ms, dans la page) :', samples.view.join(', '))
  await page.getByRole('button', { name: "Aujourd'hui" }).click()

  const time = async (label, fn) => {
    const s = Date.now()
    await fn()
    await page.waitForTimeout(50)
    log(label, Date.now() - s, 'ms')
  }
  for (let i = 0; i < 4; i++) await time(`suivant #${i + 1}`, () => page.getByRole('button', { name: 'Suivant' }).click())
  await time('aujourd’hui', () => page.getByRole('button', { name: "Aujourd'hui" }).click())
  for (const v of ['Jour', 'Mois', 'Agenda', 'Semaine', 'Jour', 'Semaine']) {
    await time(`vue ${v}`, async () => {
      await page.getByRole('radio', { name: v }).click()
      await page.waitForTimeout(150)
    })
  }
  const title1 = await page.locator('h1').first().innerText()
  await page.getByRole('button', { name: 'Suivant' }).click()
  await page.getByRole('radio', { name: 'Jour' }).click()
  await page.waitForTimeout(1500)
  const title2 = await page.locator('h1').first().innerText()
  log('titre avant/après changement de vue :', title1, '→', title2)
  await page.getByRole('radio', { name: 'Semaine' }).click()
  await page.getByRole('button', { name: "Aujourd'hui" }).click()
  await page.waitForTimeout(800)

  // Ouverture/fermeture d'un rendez-vous.
  const ev = page.locator('.fc-event').first()
  const count = await page.locator('.fc-event').count()
  log('événements visibles :', count)
  if (count) {
    await time('ouverture panneau', async () => {
      await ev.click()
      await page.getByRole('dialog').waitFor()
    })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
  }
  // Glisser-déposer réel à la souris : +1 h (déplacement vertical d'une heure de grille).
  const movable = page.locator('.fc-timegrid-col.fc-day-future .fc-timegrid-event.fc-event-draggable').first()
  if (await movable.count()) {
    const before = await movable.innerText()
    const box = await movable.boundingBox()
    const hourPx = await page.evaluate(() => {
      const slots = document.querySelectorAll('.fc-timegrid-slot-lane')
      const a = slots[0]?.getBoundingClientRect()
      const b = slots[1]?.getBoundingClientRect()
      return a && b ? (b.top - a.top) * (60 / 15) : 160
    })
    const s = Date.now()
    await page.mouse.move(box.x + box.width / 2, box.y + 8)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2, box.y + 8 + hourPx / 2, { steps: 6 })
    await page.mouse.move(box.x + box.width / 2, box.y + 8 + hourPx * 4, { steps: 8 })
    await page.mouse.up()
    const toastOk = await page.getByText('Rendez-vous déplacé').last().waitFor({ timeout: 5000 }).then(() => true).catch(async () => { log('toast :', await page.locator('[data-sonner-toast]').last().innerText().catch(() => '—')); return false })
    log('glisser-déposer :', toastOk ? 'enregistré' : 'NON enregistré', Date.now() - s, 'ms')
    await page.waitForTimeout(600)
    log('avant :', before.replace(/\s+/g, ' '))
    await shot('after-drag')
  }

  // Sélection d'un créneau vide → formulaire de rendez-vous.
  const col = await page.locator('.fc-timegrid-col.fc-day-future').nth(1).boundingBox()
  const row = await page.locator('.fc-timegrid-slot-lane[data-time="13:30:00"]').boundingBox()
  const lb = col && row ? { x: col.x, width: col.width, y: row.y, height: row.height } : null
  if (lb) {
    await page.mouse.click(lb.x + lb.width / 2, lb.y + lb.height / 2)
    const opened = await page.getByRole('dialog', { name: /Nouveau rendez-vous/ }).waitFor({ timeout: 3000 }).then(() => true).catch(() => false)
    log('clic sur créneau vide → formulaire :', opened)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(150)
    if (await page.getByRole('dialog').count()) await page.keyboard.press('Escape')
  }
  // Raccourcis clavier.
  await page.waitForTimeout(400)
  await page.keyboard.press('m')
  await page.waitForTimeout(500)
  log('raccourci M → vue :', await page.getByRole('radio', { checked: true }).first().innerText())
  await page.keyboard.press('s')
  await page.waitForTimeout(300)
  await shot('calendar-perf')
}
