// Scénario de diagnostic : appels IPC directs.
const invoke = (page, channel, input) => page.evaluate(([c, i]) => window.digiplan.invoke(c, i), [channel, input])

export default async ({ page, log }) => {
  await page.waitForFunction(() => Boolean(window.digiplan), null, { timeout: 30_000 })
  const all = await invoke(page, 'clients.list', { filter: 'active', sort: 'name', page: 0, pageSize: 10 })
  log('all', JSON.stringify(all).slice(0, 400))
  const s = await invoke(page, 'clients.list', { search: 'salma', filter: 'active', sort: 'name', page: 0, pageSize: 10 })
  log('search', JSON.stringify(s).slice(0, 400))
}
