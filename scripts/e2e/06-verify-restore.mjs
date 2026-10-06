// Vérifie l'état après restauration.
const invoke = (page, channel, input) => page.evaluate(([c, i]) => window.digiplan.invoke(c, i), [channel, input])

export default async ({ page, shot, log }) => {
  await page.getByText('Rendez-vous aujourd’hui').first().waitFor({ timeout: 30_000 })
  const clients = (await invoke(page, 'clients.list', { filter: 'active', sort: 'name', page: 0, pageSize: 50 })).data
  const names = clients.items.map((c) => `${c.firstName} ${c.lastName}`)
  log('clients après restauration :', names.join(', '))
  log('client temporaire présent :', names.includes('Client Temporaire'))
  const backups = (await invoke(page, 'backup.list')).data
  log('sauvegarde de sécurité :', backups.some((b) => b.kind === 'pre-restore'))
  const boot = (await invoke(page, 'bootstrap.get')).data
  log('édition :', boot.license.edition)
  await shot('after-restore')
}
