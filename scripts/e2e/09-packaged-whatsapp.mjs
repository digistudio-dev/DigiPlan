// Application installée : activation Pro puis génération du QR WhatsApp (Puppeteer depuis l'archive asar).
import { readFileSync } from 'node:fs'

const invoke = (page, channel, input) => page.evaluate(([c, i]) => window.digiplan.invoke(c, i), [channel, input])
const codes = JSON.parse(readFileSync('docs/private/activation-codes.json', 'utf8').replace(/^\ufeff/, '')).codes

export default async ({ page, shot, log }) => {
  await page.getByText('Prochain rendez-vous').first().waitFor({ timeout: 60_000 })
  const lic = await invoke(page, 'license.activate', { code: codes[2] })
  log('licence :', lic.ok ? lic.data.edition : lic.error.message)
  await invoke(page, 'whatsapp.connect')
  let state = null
  for (let i = 0; i < 60; i++) {
    state = (await invoke(page, 'whatsapp.state')).data
    if (state.status === 'qr' || state.status === 'error') break
    await page.waitForTimeout(2000)
  }
  log('whatsapp :', state.status, state.qrDataUrl ? '(QR généré)' : '', state.error ?? '')
  await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: 'WhatsApp' }).first().click()
  await page.waitForTimeout(1200)
  await shot('installed-whatsapp-qr')
  await invoke(page, 'whatsapp.disconnect')
}
