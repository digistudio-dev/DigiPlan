// Persistance après redémarrage, puis restauration d'une sauvegarde (l'application redémarre).
const invoke = (page, channel, input) => page.evaluate(([c, i]) => window.digiplan.invoke(c, i), [channel, input])

export default async ({ page, shot, log }) => {
  await page.getByText('Rendez-vous aujourd’hui').first().waitFor({ timeout: 30_000 })
  const boot = (await invoke(page, 'bootstrap.get')).data
  const clients = (await invoke(page, 'clients.list', { filter: 'active', sort: 'name', page: 0, pageSize: 50 })).data
  const payments = (await invoke(page, 'payments.list', { page: 0, pageSize: 50 })).data
  log('après redémarrage — édition :', boot.license.edition, '| thème :', boot.settings.theme, '| clients :', clients.total, '| paiements :', payments.total)

  const backups = (await invoke(page, 'backup.list')).data
  const manual = backups.find((b) => b.kind === 'manual')
  log('sauvegardes :', backups.map((b) => `${b.kind}:${b.fileName}`).join(', '))

  // Donnée créée APRÈS la sauvegarde : elle doit disparaître après restauration.
  await invoke(page, 'clients.save', {
    firstName: 'Client',
    lastName: 'Temporaire',
    phone: '0700000000',
    whatsappPhone: '',
    email: '',
    birthDate: null,
    gender: null,
    address: '',
    insurance: '',
    notes: '',
    tags: []
  })
  log('client temporaire créé')

  await page.getByRole('button', { name: 'Paramètres' }).click()
  await page.getByRole('navigation', { name: 'Paramètres' }).getByRole('button', { name: 'Sauvegardes', exact: true }).click()
  await page.waitForTimeout(600)
  const row = page.locator('li', { hasText: 'Manuelle' }).first()
  await row.getByRole('button', { name: 'Restaurer' }).click()
  await page.getByText('Restaurer cette sauvegarde ?').waitFor()
  await shot('restore-confirm')
  const confirmBtn = page.getByRole('dialog').getByRole('button', { name: 'Restaurer' })
  log('bouton désactivé avant la case :', await confirmBtn.isDisabled())
  await page.getByRole('dialog').getByRole('checkbox').click()
  log('restauration de', manual.fileName)
  await confirmBtn.click()
  await page.waitForTimeout(4000).catch(() => {})
}
