// Connexion WhatsApp : affichage du QR code (le scan nécessite un téléphone réel).
const invoke = (page, channel, input) => page.evaluate(([c, i]) => window.digiplan.invoke(c, i), [channel, input])

export default async ({ page, shot, log }) => {
  await page.getByText('Rendez-vous aujourd’hui').first().waitFor({ timeout: 30_000 })
  await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: 'WhatsApp' }).first().click()
  const connect = page.getByRole('button', { name: /Connecter WhatsApp|Reconnecter/ })
  if (await connect.isVisible().catch(() => false)) await connect.click()
  await page.waitForTimeout(1500)
  await shot('whatsapp-initializing')
  try {
    await page.getByAltText('QR code WhatsApp').waitFor({ timeout: 120_000 })
    await page.waitForTimeout(500)
    await shot('whatsapp-qr')
    log('QR WhatsApp affiché')
  } catch {
    await shot('whatsapp-state')
    log('QR non affiché :', JSON.stringify((await invoke(page, 'whatsapp.state')).data))
  }
  const r = await invoke(page, 'whatsapp.disconnect')
  log('déconnexion :', r.ok ? r.data.status : r.error.message)
}
