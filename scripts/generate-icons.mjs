// Génère les icônes de l'application (PNG, ICO) à partir des logos sources DigiPlan.
// Usage : npm run icons
import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const SRC_ICON = 'resources/brand/source-icon.webp'
const SRC_WORDMARK = 'resources/brand/source-wordmark.webp'

// Zone de la tuile arrondie dans l'image source (mesurée sur l'asset fourni).
const TILE = { left: 158, top: 158, size: 940 }
const RADIUS_RATIO = 0.225

async function out(path, buffer) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, buffer)
  console.log('✓', path)
}

async function tile(size) {
  const r = Math.round(size * RADIUS_RATIO)
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><rect x="0" y="0" width="${size}" height="${size}" rx="${r}" ry="${r}" fill="#fff"/></svg>`
  )
  return sharp(SRC_ICON)
    .extract({ left: TILE.left, top: TILE.top, width: TILE.size, height: TILE.size })
    .resize(size, size, { kernel: 'lanczos3' })
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer()
}

/** Logo complet avec fond blanc rendu transparent (« color to alpha »), bords lissés préservés. */
async function wordmarkTransparent() {
  const { data, info } = await sharp(SRC_WORDMARK)
    .extract({ left: 170, top: 275, width: 1355, height: 377 })
    .resize({ width: 900 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const a = Math.max(255 - r, 255 - g, 255 - b) / 255
    if (a < 0.02) {
      data[i + 3] = 0
      continue
    }
    data[i] = Math.round((r - 255 * (1 - a)) / a)
    data[i + 1] = Math.round((g - 255 * (1 - a)) / a)
    data[i + 2] = Math.round((b - 255 * (1 - a)) / a)
    data[i + 3] = Math.round(a * 255)
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer()
}

async function main() {
  // Icône principale avec une petite marge transparente (rendu Windows plus propre).
  const master = 1024
  const inner = Math.round(master * 0.92)
  const pad = Math.round((master - inner) / 2)
  const masterPng = await sharp({
    create: { width: master, height: master, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
    .composite([{ input: await tile(inner), left: pad, top: pad }])
    .png()
    .toBuffer()

  await out('resources/icon.png', await sharp(masterPng).resize(512, 512).png().toBuffer())
  await out('build/icon.png', await sharp(masterPng).resize(1024, 1024).png().toBuffer())

  const icoSizes = [16, 24, 32, 48, 64, 128, 256]
  const icoPngs = await Promise.all(
    icoSizes.map((s) => sharp(masterPng).resize(s, s, { kernel: 'lanczos3' }).png().toBuffer())
  )
  await out('build/icon.ico', await pngToIco(icoPngs))

  // Assets pour l'interface.
  await out('src/renderer/src/assets/brand/digiplan-mark.png', await tile(256))
  await out('src/renderer/src/assets/brand/digiplan-wordmark.png', await wordmarkTransparent())
  // Favicon de la fenêtre.
  await out('src/renderer/public/favicon.png', await tile(64))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
