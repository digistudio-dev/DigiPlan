// Licence Pro (5 codes), fonctionnalités Pro, paramètres, mode sombre, sauvegarde.
import { readFileSync } from 'node:fs'

const invoke = (page, channel, input) => page.evaluate(([c, i]) => window.digiplan.invoke(c, i), [channel, input])
const codes = JSON.parse(readFileSync('docs/private/activation-codes.json', 'utf8').replace(/^\ufeff/, '')).codes

export default async ({ page, shot, log }) => {
  await page.getByText('Rendez-vous aujourd’hui').first().waitFor({ timeout: 30_000 })
  const nav = page.getByRole('navigation', { name: 'Navigation principale' })

  // --- Free : limite d'équipe ---
  await nav.getByRole('button', { name: 'Barbiers' }).click()
  await page.getByRole('button', { name: /Nouveau barbier/ }).click()
  await page.getByText('Débloquez cette fonctionnalité').waitFor()
  await shot('upgrade-dialog')
  await page.keyboard.press('Escape')

  // --- Licence : code invalide puis valide ---
  await page.getByRole('button', { name: 'Paramètres' }).click()
  await page.getByRole('button', { name: 'Licence' }).click()
  await page.getByPlaceholder('DGP-XXXX-XXXX-XXXX').fill('DGP-AAAA-BBBB-CCCC')
  await page.getByRole('button', { name: 'Activer DigiPlan Pro' }).click()
  await page.getByText("Ce code d'activation n'est pas valide").waitFor()
  await shot('license-invalid')
  await page.getByPlaceholder('DGP-XXXX-XXXX-XXXX').fill(codes[0].toLowerCase())
  await page.getByRole('button', { name: 'Activer DigiPlan Pro' }).click()
  await page.getByText('Licence activée').first().waitFor()
  await page.waitForTimeout(500)
  await shot('license-pro')
  for (const code of codes.slice(1)) {
    const r = await invoke(page, 'license.activate', { code })
    log('code', code.slice(0, 8) + '…', r.ok ? r.data.edition : r.error.message)
  }

  // --- Équipe illimitée ---
  await nav.getByRole('button', { name: 'Barbiers' }).click()
  await page.getByRole('button', { name: /Nouveau barbier/ }).click()
  await page.locator('#st-name').fill('Hamza')
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click()
  await page.getByText('Barbier ajouté').last().waitFor()
  await page.waitForTimeout(500)
  await shot('staff-two')

  // --- Rendez-vous récurrent (Pro) ---
  await page.keyboard.press('Control+N')
  await page.getByPlaceholder(/Rechercher un client/).fill('Salma')
  await page.getByRole('option', { name: /Salma Bennani/ }).click()
  await page.getByRole('button', { name: /Choisir un service/ }).click()
  await page.getByRole('menuitem', { name: /Coupe homme/ }).click()
  const d = new Date(Date.now() + 2 * 86400_000)
  if (d.getDay() === 0) d.setDate(d.getDate() + 1)
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  await page.locator('input[type=date]').first().fill(iso)
  await page.locator('input[type=time]').first().fill('15:00')
  await page.getByRole('combobox').filter({ hasText: 'Ne pas répéter' }).click()
  await page.getByRole('option', { name: 'Chaque semaine' }).click()
  await page.waitForTimeout(300)
  await shot('recurrence-form')
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await page.getByText('4 rendez-vous enregistrés').last().waitFor()
  log('série récurrente créée')

  // --- Rapports Pro ---
  await nav.getByRole('button', { name: 'Rapports' }).click()
  await page.waitForTimeout(1000)
  await shot('reports-pro')

  // --- WhatsApp : QR code ---
  await nav.getByRole('button', { name: 'WhatsApp' }).first().click()
  await page.getByRole('button', { name: 'Connecter WhatsApp' }).click()
  try {
    await page.getByAltText('QR code WhatsApp').waitFor({ timeout: 90_000 })
    await page.waitForTimeout(500)
    await shot('whatsapp-qr')
    log('QR WhatsApp affiché')
  } catch {
    await shot('whatsapp-state')
    log('QR non affiché :', JSON.stringify((await invoke(page, 'whatsapp.state')).data))
  }
  await page.getByRole('button', { name: 'Annuler' }).first().click().catch(() => {})
  await page.waitForTimeout(1000)

  // --- Paramètres : toutes les sections ---
  await page.getByRole('button', { name: 'Paramètres' }).click()
  for (const s of ['Général', 'Entreprise', 'Horaires', 'Rendez-vous', 'Notifications', 'Google Calendar', 'Sauvegardes', 'Apparence', 'À propos']) {
    await page.getByRole('navigation', { name: 'Paramètres' }).getByRole('button', { name: s, exact: true }).click()
    await page.waitForTimeout(600)
    await shot(`settings-${s.replace(/\W+/g, '-')}`)
    if (s === 'Sauvegardes') {
      await page.getByRole('button', { name: 'Sauvegarder maintenant' }).click()
      await page.getByText('Sauvegarde créée').last().waitFor()
      await page.waitForTimeout(500)
      await shot('backup-created')
    }
  }

  // --- Mode sombre ---
  await page.getByRole('navigation', { name: 'Paramètres' }).getByRole('button', { name: 'Apparence', exact: true }).click()
  await page.getByRole('button', { name: 'Sombre' }).click()
  await page.waitForTimeout(700)
  await shot('dark-settings')
  for (const label of ['Tableau de bord', 'Calendrier', 'Clients', 'Rapports']) {
    await nav.getByRole('button', { name: label }).first().click()
    await page.waitForTimeout(1000)
    await shot(`dark-${label.replace(/\W+/g, '-')}`)
  }
  await page.keyboard.press('Control+N')
  await page.waitForTimeout(600)
  await shot('dark-appointment-form')
  await page.keyboard.press('Escape')
  log('pro OK')
}
