// Pilote l'application Electron réelle (build de développement) pour des scénarios de bout en bout.
// Usage : node scripts/e2e/run.mjs <scenario.mjs> [--data <dossier>] [--shots <dossier>] [--fresh]
// Le scénario exporte `default async ({ app, page, shot, log }) => {}`.

import { _electron as electron } from 'playwright-core'
import { mkdirSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import electronPath from 'electron'

const args = process.argv.slice(2)
const scenarioPath = resolve(args[0])
const opt = (name, def) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : def
}
const dataDir = resolve(opt('--data', join(process.env.TEMP ?? '.', 'digiplan-e2e')))
const shotsDir = resolve(opt('--shots', join(dataDir, 'shots')))
if (args.includes('--fresh')) rmSync(dataDir, { recursive: true, force: true })
mkdirSync(shotsDir, { recursive: true })

// --exe : teste l'application installée (données réelles dans %APPDATA%\DigiPlan).
const packagedExe = opt('--exe', null)
const app = await electron.launch(
  packagedExe
    ? { executablePath: resolve(packagedExe), args: [], timeout: 60_000 }
    : {
        executablePath: electronPath,
        args: ['.', ...(args.includes('--seed') ? ['--seed-dev'] : [])],
        env: { ...process.env, DIGIPLAN_USER_DATA: dataDir, ELECTRON_RENDERER_URL: '' },
        timeout: 60_000
      }
)
const page = await app.firstWindow()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`)
})
await page.waitForLoadState('domcontentloaded')

let n = 0
const shot = async (name) => {
  const file = join(shotsDir, `${String(++n).padStart(2, '0')}-${name}.png`)
  await page.screenshot({ path: file })
  console.log('shot', file)
  return file
}
const log = (...m) => console.log('[e2e]', ...m)

try {
  const { default: scenario } = await import(pathToFileURL(scenarioPath).href)
  await scenario({ app, page, shot, log })
} catch (e) {
  console.error('SCENARIO FAILED', e)
  await shot('failure').catch(() => {})
  process.exitCode = 1
} finally {
  if (errors.length) console.log('Renderer errors:\n' + errors.join('\n'))
  await app.close().catch(() => {})
}
