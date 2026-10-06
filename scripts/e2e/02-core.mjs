// Flux principaux : client, rendez-vous, conflit, statuts, paiement, reçu, pages.
const invoke = (page, channel, input) => page.evaluate(([c, i]) => window.digiplan.invoke(c, i), [channel, input])

export default async ({ page, shot, log }) => {
  await page.getByText('Rendez-vous aujourd’hui').first().waitFor({ timeout: 30_000 })

  // --- Nouveau client via le raccourci Ctrl+Maj+C ---
  await page.keyboard.press('Control+Shift+C')
  await page.locator('#c-first').fill('Salma')
  await page.locator('#c-last').fill('Bennani')
  await page.locator('#c-phone').fill('0661234567')
  await shot('client-form')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await page.getByText('Client ajouté').last().waitFor()
  log('client créé')

  // --- Nouveau rendez-vous (Ctrl+N) ---
  await page.keyboard.press('Control+N')
  await page.getByPlaceholder(/Rechercher un client/).fill('salma')
  await page.getByRole('option', { name: /Salma Bennani/ }).click()
  await page.getByRole('button', { name: /Choisir un service/ }).click()
  await page.getByRole('menuitem', { name: /Coupe \+ barbe/ }).click()
  const tomorrow = new Date(Date.now() + 86400_000)
  const iso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`
  await page.locator('input[type=date]').first().fill(iso)
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: '10:00', exact: true }).click()
  await page.waitForTimeout(300)
  await shot('appointment-form')
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await page.getByText('Rendez-vous enregistré').last().waitFor()
  log('rendez-vous créé')

  // --- Conflit : même créneau, même barbier ---
  await page.keyboard.press('Control+N')
  await page.getByPlaceholder(/Rechercher un client/).fill('Karim')
  await page.getByRole('option', { name: /Nouveau client/ }).click()
  await page.getByPlaceholder('Nom', { exact: true }).fill('Tazi')
  await page.getByRole('button', { name: /Choisir un service/ }).click()
  await page.getByRole('menuitem', { name: /^Barbe/ }).click()
  await page.locator('input[type=date]').first().fill(iso)
  await page.locator('input[type=time]').first().fill('10:15')
  await page.waitForTimeout(600)
  await shot('conflict-live')
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await page.getByText('Ce créneau n\'est plus disponible.').waitFor()
  await shot('conflict-blocked')
  // Choisit un créneau libre proposé puis enregistre.
  await page.getByRole('button', { name: '11:00', exact: true }).click()
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await page.getByText('Rendez-vous enregistré').last().waitFor()
  log('conflit détecté puis résolu')

  // --- Rendez-vous de passage (walk-in) aujourd'hui, avec encaissement partiel ---
  const appts = await invoke(page, 'appointments.range', { from: Date.now() - 86400_000, to: Date.now() + 3 * 86400_000 })
  log('rendez-vous en base :', appts.ok ? appts.data.length : appts)

  // --- Calendrier ---
  await page.getByRole('button', { name: 'Calendrier' }).first().click()
  await page.waitForTimeout(1200)
  await shot('calendar-week')
  await page.getByRole('radio', { name: 'Jour' }).click()
  await page.getByRole('button', { name: 'Suivant' }).click()
  await page.waitForTimeout(700)
  await shot('calendar-day-tomorrow')
  await page.getByRole('radio', { name: 'Mois' }).click()
  await page.waitForTimeout(700)
  await shot('calendar-month')
  await page.getByRole('radio', { name: 'Agenda' }).click()
  await page.waitForTimeout(700)
  await shot('calendar-agenda')
  await page.getByRole('radio', { name: 'Semaine' }).click()

  // --- Détail du rendez-vous depuis le calendrier ---
  await page.locator('.fc-event', { hasText: 'Salma Bennani' }).first().click()
  await page.getByRole('heading', { name: 'Coupe + barbe' }).waitFor()
  await page.waitForTimeout(400)
  await shot('appointment-drawer')
  await page.getByRole('button', { name: 'Marquer arrivé' }).click()
  await page.getByRole('button', { name: 'Commencer' }).click()
  await page.getByRole('button', { name: 'Terminer' }).click()
  await page.waitForTimeout(500)
  // Encaissement partiel puis solde.
  await page.getByRole('button', { name: 'Encaisser' }).first().click()
  await page.getByRole('dialog', { name: 'Encaisser' }).waitFor()
  const amount = page.getByRole('dialog', { name: 'Encaisser' }).locator('input[inputmode=decimal]')
  await amount.fill('50')
  await page.getByRole('radio', { name: 'Carte' }).click()
  await shot('payment-partial')
  await page.getByRole('dialog', { name: 'Encaisser' }).getByRole('button', { name: 'Encaisser' }).click()
  await page.getByText(/Paiement enregistré/).last().waitFor()
  await page.waitForTimeout(600)
  await shot('drawer-after-partial')
  await page.getByRole('button', { name: 'Encaisser' }).first().click()
  await page.getByRole('dialog', { name: 'Encaisser' }).getByRole('button', { name: 'Encaisser' }).click()
  await page.getByText(/Paiement enregistré/).last().waitFor()
  await page.getByRole('button', { name: 'Voir le reçu' }).last().click()
  await page.getByRole('dialog', { name: 'Reçu' }).waitFor()
  await page.waitForTimeout(800)
  await shot('receipt')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await page.keyboard.press('Escape')
  const after = await invoke(page, 'appointments.get', { id: appts.data.find((a) => a.clientName === 'Salma Bennani').id })
  log('statut/paiement :', after.data.status, after.data.total, after.data.paid, after.data.balance)

  // --- Pages principales ---
  for (const [label, name] of [
    ['Tableau de bord', 'dashboard'],
    ['Clients', 'clients'],
    ['Services', 'services'],
    ['Barbiers', 'staff'],
    ['Paiements', 'payments'],
    ['Rapports', 'reports'],
    ['WhatsApp', 'whatsapp-free']
  ]) {
    await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: label }).first().click()
    await page.waitForTimeout(900)
    await shot(`page-${name}`)
  }

  // Fiche client
  await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: 'Clients' }).click()
  await page.getByRole('cell', { name: /Salma Bennani/ }).click()
  await page.waitForTimeout(700)
  await shot('client-drawer')
  await page.keyboard.press('Escape')

  // Recherche globale
  await page.keyboard.press('Control+K')
  await page.keyboard.type('061')
  await page.waitForTimeout(700)
  await shot('command-palette')
  await page.keyboard.press('Escape')
  log('pages OK')
}
