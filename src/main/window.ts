// Fenêtre principale : sécurité stricte, barre de titre intégrée au thème.

import { app, BrowserWindow, nativeTheme, screen, shell, session } from 'electron'
import { join } from 'node:path'
import type { ThemePreference } from '@shared/types'
import { createLogger } from './logger'
import { getValue, setValue } from './services/settings'

const log = createLogger('window')

let mainWindow: BrowserWindow | null = null

const OVERLAY = {
  light: { color: '#f7f7f8', symbolColor: '#3f3f46' },
  dark: { color: '#0d0e12', symbolColor: '#d4d4d8' }
}
export const TITLEBAR_HEIGHT = 44

let themePref: ThemePreference = 'system'

function effectiveDark(pref: ThemePreference): boolean {
  return pref === 'dark' || (pref === 'system' && nativeTheme.shouldUseDarkColors)
}

export function applyTitleBarTheme(pref: ThemePreference): void {
  themePref = pref
  nativeTheme.themeSource = pref
  const dark = effectiveDark(pref)
  const win = mainWindow
  if (!win || win.isDestroyed()) return
  try {
    win.setTitleBarOverlay({ ...(dark ? OVERLAY.dark : OVERLAY.light), height: TITLEBAR_HEIGHT })
    win.setBackgroundColor(dark ? OVERLAY.dark.color : OVERLAY.light.color)
  } catch {
    // setTitleBarOverlay n'est pas disponible sur toutes les plateformes.
  }
}

nativeTheme.on('updated', () => {
  if (themePref === 'system') applyTitleBarTheme('system')
})

interface Bounds {
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
}

function restoreBounds(): Bounds {
  const saved = getValue<Bounds>('window.bounds')
  const fallback: Bounds = { width: 1360, height: 860, maximized: false }
  if (!saved) return fallback
  // Vérifie que la fenêtre reste visible (écran débranché, etc.).
  const visible = screen.getAllDisplays().some((d) => {
    const a = d.workArea
    return saved.x !== undefined && saved.y !== undefined && saved.x >= a.x - 50 && saved.y >= a.y - 50 && saved.x < a.x + a.width && saved.y < a.y + a.height
  })
  return visible ? saved : { ...fallback, maximized: saved.maximized }
}

export function hardenSession(): void {
  const ses = session.defaultSession
  // Aucune permission web (caméra, micro, notifications web, géolocalisation…) n'est nécessaire.
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  ses.setPermissionCheckHandler(() => false)
  if (app.isPackaged) {
    ses.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self' blob: data:; object-src 'none'; base-uri 'none'"
          ]
        }
      })
    })
  }
}

export function createMainWindow(theme: ThemePreference): BrowserWindow {
  themePref = theme
  nativeTheme.themeSource = theme
  const dark = effectiveDark(theme)
  const bounds = restoreBounds()

  const win = new BrowserWindow({
    ...bounds,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    title: 'DigiPlan',
    backgroundColor: dark ? OVERLAY.dark.color : OVERLAY.light.color,
    titleBarStyle: 'hidden',
    titleBarOverlay: { ...(dark ? OVERLAY.dark : OVERLAY.light), height: TITLEBAR_HEIGHT },
    icon: join(__dirname, '../../resources/icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: true,
      devTools: !app.isPackaged
    }
  })
  mainWindow = win
  if (bounds.maximized) win.maximize()

  win.once('ready-to-show', () => win.show())

  const persist = () => {
    if (win.isDestroyed()) return
    const b = win.getNormalBounds()
    setValue('window.bounds', { ...b, maximized: win.isMaximized() })
  }
  win.on('close', persist)

  // Aucune navigation hors de l'application ; les liens externes s'ouvrent dans le navigateur.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (!(devUrl && url.startsWith(devUrl)) && !url.startsWith('file://')) {
      event.preventDefault()
      log.warn(`Navigation bloquée vers ${url}`)
    }
  })
  win.webContents.on('render-process-gone', (_e, details) => log.error('Processus de rendu arrêté', details))

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
}
