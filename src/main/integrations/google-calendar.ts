// Intégration Google Calendar (DigiPlan Pro).
// OAuth 2.0 pour application de bureau : redirection loopback 127.0.0.1 + PKCE, navigateur système.
// Synchronisation fiable à sens unique DigiPlan → Google, via une file d'attente persistée (colonne google_sync_status).
// L'architecture (identifiant DigiPlan dans extendedProperties) permet d'ajouter plus tard la synchro bidirectionnelle.

import { createHash, randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { net, safeStorage, shell } from 'electron'
import type { GoogleCalendarListItem, GoogleCalendarState } from '@shared/types'
import { STATUS_LABELS } from '@shared/status'
import { formatPhone } from '@shared/domain/phone'
import { formatMoney } from '@shared/domain/money'
import { all, get, placeholders, run } from '../db/raw'
import { AppError } from '../errors'
import { createLogger } from '../logger'
import { emit } from '../ipc/registry'
import { isPro } from '../license/service'
import { getAppointment } from '../services/appointments'
import { getBusiness } from '../services/business'
import { deleteValue, getValue, setValue } from '../services/settings'

const log = createLogger('google')

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const API = 'https://www.googleapis.com/calendar/v3'
const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly'
]

const CONFIG_KEY = 'google.config'
const TOKENS_KEY = 'google.tokens'
const CREDENTIALS_KEY = 'google.credentials'

interface GoogleConfig {
  accountEmail: string | null
  calendarId: string | null
  calendarName: string | null
  syncEnabled: boolean
  lastSyncAt: number | null
  lastError: string | null
}

interface StoredTokens {
  encrypted: boolean
  refreshToken: string
}

let accessToken: { token: string; expiresAt: number } | null = null
let pendingAuth: { server: Server; reject: (e: Error) => void } | null = null

// ---------- Identifiants OAuth ----------

function credentials(): { clientId: string; clientSecret: string; source: 'bundled' | 'custom' | 'none' } {
  const custom = getValue<{ clientId: string; clientSecret: string }>(CREDENTIALS_KEY)
  if (custom?.clientId) return { ...custom, source: 'custom' }
  const clientId = import.meta.env.MAIN_VITE_GOOGLE_CLIENT_ID ?? ''
  const clientSecret = import.meta.env.MAIN_VITE_GOOGLE_CLIENT_SECRET ?? ''
  return clientId ? { clientId, clientSecret, source: 'bundled' } : { clientId: '', clientSecret: '', source: 'none' }
}

export function setGoogleCredentials(clientId: string, clientSecret: string): GoogleCalendarState {
  if (clientId.trim()) setValue(CREDENTIALS_KEY, { clientId: clientId.trim(), clientSecret: clientSecret.trim() })
  else deleteValue(CREDENTIALS_KEY)
  return getGoogleState()
}

// ---------- Configuration & jetons ----------

function config(): GoogleConfig {
  return {
    accountEmail: null,
    calendarId: null,
    calendarName: null,
    syncEnabled: false,
    lastSyncAt: null,
    lastError: null,
    ...(getValue<Partial<GoogleConfig>>(CONFIG_KEY) ?? {})
  }
}

function saveConfig(patch: Partial<GoogleConfig>): void {
  setValue(CONFIG_KEY, { ...config(), ...patch })
  emit('google:state', getGoogleState())
}

function storeRefreshToken(token: string): void {
  const encrypted = safeStorage.isEncryptionAvailable()
  const value = encrypted ? safeStorage.encryptString(token).toString('base64') : Buffer.from(token).toString('base64')
  if (!encrypted) log.warn('Chiffrement système indisponible : jeton stocké encodé uniquement')
  setValue(TOKENS_KEY, { encrypted, refreshToken: value } satisfies StoredTokens)
}

function readRefreshToken(): string | null {
  const stored = getValue<StoredTokens>(TOKENS_KEY)
  if (!stored?.refreshToken) return null
  try {
    const buf = Buffer.from(stored.refreshToken, 'base64')
    return stored.encrypted ? safeStorage.decryptString(buf) : buf.toString('utf8')
  } catch (err) {
    log.error('Lecture du jeton Google impossible', err)
    return null
  }
}

function pendingCount(): number {
  return get<{ n: number }>("SELECT COUNT(*) AS n FROM appointments WHERE google_sync_status = 'pending'")?.n ?? 0
}

export function getGoogleState(): GoogleCalendarState {
  const c = config()
  const creds = credentials()
  return {
    configured: creds.source !== 'none',
    connected: Boolean(readRefreshToken()),
    accountEmail: c.accountEmail,
    calendarId: c.calendarId,
    calendarName: c.calendarName,
    syncEnabled: c.syncEnabled,
    lastSyncAt: c.lastSyncAt,
    lastError: c.lastError,
    pendingCount: pendingCount(),
    credentialsSource: creds.source
  }
}

function isActive(): boolean {
  const c = config()
  return isPro() && c.syncEnabled && Boolean(c.calendarId) && Boolean(readRefreshToken())
}

// ---------- OAuth ----------

const b64url = (buf: Buffer) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

async function tokenRequest(params: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString()
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const code = String(json.error ?? res.status)
    const err = new Error(`token_error:${code}`)
    ;(err as Error & { oauthCode?: string }).oauthCode = code
    throw err
  }
  return json
}

function emailFromIdToken(idToken: unknown): string | null {
  if (typeof idToken !== 'string') return null
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64').toString('utf8')) as { email?: string }
    return payload.email ?? null
  } catch {
    return null
  }
}

const CALLBACK_PAGE = (ok: boolean) => `<!doctype html><html lang="fr"><meta charset="utf-8"><title>DigiPlan</title>
<body style="font-family:Segoe UI,system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#f8fafc;color:#0f172a">
<div style="text-align:center;max-width:420px"><h2 style="margin:0 0 8px">${ok ? 'Compte Google connecté' : 'Connexion annulée'}</h2>
<p style="color:#64748b">${ok ? 'Vous pouvez fermer cet onglet et revenir dans DigiPlan.' : 'Aucune modification n’a été effectuée. Vous pouvez fermer cet onglet.'}</p></div></body></html>`

export async function connectGoogle(): Promise<GoogleCalendarState> {
  if (!isPro()) throw new AppError('pro_required', 'Google Calendar est disponible avec DigiPlan Pro.')
  const creds = credentials()
  if (creds.source === 'none') {
    throw new AppError('not_configured', 'Les identifiants OAuth Google ne sont pas configurés. Renseignez-les ci-dessous.')
  }
  if (!net.isOnline()) throw new AppError('offline', 'Une connexion internet est nécessaire pour connecter Google Calendar.')
  cancelGoogleConnect()

  const verifier = b64url(randomBytes(48))
  const challenge = b64url(createHash('sha256').update(verifier).digest())
  const state = b64url(randomBytes(16))

  const { code, redirectUri } = await new Promise<{ code: string; redirectUri: string }>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== '/') {
        res.writeHead(404).end()
        return
      }
      const ok = url.searchParams.get('state') === state && Boolean(url.searchParams.get('code'))
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(CALLBACK_PAGE(ok))
      server.close()
      pendingAuth = null
      clearTimeout(timeout)
      if (ok) resolve({ code: url.searchParams.get('code')!, redirectUri })
      else reject(new AppError('cancelled', 'La connexion Google a été annulée.'))
    })
    let redirectUri = ''
    const timeout = setTimeout(() => {
      server.close()
      pendingAuth = null
      reject(new AppError('timeout', 'Délai de connexion Google dépassé. Réessayez.'))
    }, 5 * 60_000)
    pendingAuth = {
      server,
      reject: (e) => {
        clearTimeout(timeout)
        reject(e)
      }
    }
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      redirectUri = `http://127.0.0.1:${port}`
      const params = new URLSearchParams({
        client_id: creds.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: SCOPES.join(' '),
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
        access_type: 'offline',
        prompt: 'consent'
      })
      void shell.openExternal(`${AUTH_URL}?${params.toString()}`)
    })
  })

  try {
    const tokens = await tokenRequest({
      code,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: verifier
    })
    if (typeof tokens.refresh_token !== 'string') {
      throw new AppError('no_refresh', 'Google n’a pas fourni d’autorisation durable. Réessayez la connexion.')
    }
    storeRefreshToken(tokens.refresh_token)
    accessToken = { token: String(tokens.access_token), expiresAt: Date.now() + (Number(tokens.expires_in) - 60) * 1000 }
    saveConfig({ accountEmail: emailFromIdToken(tokens.id_token), lastError: null })
    log.info('Compte Google connecté')
  } catch (err) {
    if (err instanceof AppError) throw err
    log.error('Échange du code OAuth', err)
    throw new AppError('oauth_failed', 'Impossible de connecter le compte Google.')
  }
  return getGoogleState()
}

export function cancelGoogleConnect(): void {
  if (pendingAuth) {
    pendingAuth.server.close()
    pendingAuth.reject(new AppError('cancelled', 'Connexion Google annulée.'))
    pendingAuth = null
  }
}

export async function disconnectGoogle(): Promise<GoogleCalendarState> {
  const refresh = readRefreshToken()
  if (refresh && net.isOnline()) {
    try {
      await fetch(`${REVOKE_URL}?token=${encodeURIComponent(refresh)}`, { method: 'POST' })
    } catch (err) {
      log.warn('Révocation du jeton Google', err)
    }
  }
  deleteValue(TOKENS_KEY)
  accessToken = null
  saveConfig({ accountEmail: null, calendarId: null, calendarName: null, syncEnabled: false, lastError: null })
  run("UPDATE appointments SET google_sync_status = NULL, google_sync_error = NULL WHERE google_sync_status IN ('pending','error')")
  return getGoogleState()
}

async function getAccessToken(): Promise<string> {
  if (accessToken && accessToken.expiresAt > Date.now()) return accessToken.token
  const refresh = readRefreshToken()
  if (!refresh) throw new AppError('not_connected', 'Le compte Google n’est pas connecté.')
  const creds = credentials()
  try {
    const t = await tokenRequest({
      refresh_token: refresh,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      grant_type: 'refresh_token'
    })
    accessToken = { token: String(t.access_token), expiresAt: Date.now() + (Number(t.expires_in) - 60) * 1000 }
    return accessToken.token
  } catch (err) {
    if ((err as { oauthCode?: string }).oauthCode === 'invalid_grant') {
      deleteValue(TOKENS_KEY)
      saveConfig({ lastError: 'L’accès Google a été révoqué ou a expiré. Reconnectez votre compte.' })
      throw new AppError('revoked', 'L’accès Google a expiré. Reconnectez votre compte.')
    }
    throw err
  }
}

async function api<T>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T | null }> {
  const token = await getAccessToken()
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  })
  if (res.status === 401) accessToken = null
  const text = await res.text()
  const data = text ? (JSON.parse(text) as T) : null
  return { status: res.status, data }
}

// ---------- Calendriers ----------

export async function listGoogleCalendars(): Promise<GoogleCalendarListItem[]> {
  if (!net.isOnline()) throw new AppError('offline', 'Connexion internet requise.')
  const { status, data } = await api<{ items?: Array<{ id: string; summary: string; primary?: boolean; accessRole: string }> }>(
    'GET',
    '/users/me/calendarList?minAccessRole=writer'
  )
  if (status >= 400 || !data) throw new AppError('google_api', 'Impossible de récupérer la liste des agendas Google.')
  return (data.items ?? []).map((c) => ({ id: c.id, summary: c.summary, primary: Boolean(c.primary) }))
}

export function selectGoogleCalendar(id: string, name: string): GoogleCalendarState {
  const previous = config().calendarId
  saveConfig({ calendarId: id, calendarName: name, lastError: null })
  if (previous && previous !== id) {
    // Les événements de l'ancien agenda ne sont pas modifiés ; les rendez-vous seront recréés dans le nouveau.
    run('UPDATE appointments SET google_event_id = NULL')
  }
  if (config().syncEnabled) queueAllUpcoming()
  return getGoogleState()
}

export function setGoogleSync(enabled: boolean): GoogleCalendarState {
  if (enabled && !isPro()) throw new AppError('pro_required', 'Google Calendar est disponible avec DigiPlan Pro.')
  if (enabled && !config().calendarId) throw new AppError('invalid', 'Choisissez d’abord un agenda Google.')
  saveConfig({ syncEnabled: enabled })
  if (enabled) queueAllUpcoming()
  return getGoogleState()
}

// ---------- File de synchronisation ----------

/** Met en file les rendez-vous à venir (et de la semaine passée) lors de l'activation. */
function queueAllUpcoming(): void {
  run(
    `UPDATE appointments SET google_sync_status = 'pending'
     WHERE (deleted_at IS NULL AND start_at >= ?) OR google_event_id IS NOT NULL`,
    [Date.now() - 7 * 24 * 3600_000]
  )
  kickGoogleSync()
}

/** Écouteur des modifications de rendez-vous. */
export function markGooglePending(ids: string[]): void {
  if (!ids.length || !isActive()) return
  run(`UPDATE appointments SET google_sync_status = 'pending' WHERE id IN (${placeholders(ids.length)})`, ids)
  kickGoogleSync()
}

function eventBody(id: string) {
  const a = getAppointment(id)
  const business = getBusiness()
  const services = a.services.map((s) => s.name).join(' + ')
  const description = [
    `${services}`,
    a.staffName ? `Avec : ${a.staffName}` : '',
    a.clientPhone ? `Téléphone : ${formatPhone(a.clientPhone)}` : '',
    `Statut : ${STATUS_LABELS[a.status]}`,
    `Total : ${formatMoney(a.total, business?.currency)}`,
    a.notes ? `\nNotes : ${a.notes}` : '',
    '\n— Synchronisé depuis DigiPlan'
  ]
    .filter(Boolean)
    .join('\n')
  const tz = business?.timezone ?? 'Africa/Casablanca'
  return {
    summary: `${a.clientName} — ${services}`,
    description,
    location: [business?.address, business?.city].filter(Boolean).join(', ') || undefined,
    start: { dateTime: new Date(a.startAt).toISOString(), timeZone: tz },
    end: { dateTime: new Date(a.endAt).toISOString(), timeZone: tz },
    extendedProperties: { private: { digiplanId: a.id } },
    reminders: { useDefault: false, overrides: [] }
  }
}

async function syncOne(row: { id: string; google_event_id: string | null; deleted_at: number | null; status: string }, calendarId: string) {
  const cal = encodeURIComponent(calendarId)
  const remove = row.deleted_at !== null || row.status === 'cancelled'
  if (remove) {
    if (row.google_event_id) {
      const { status } = await api('DELETE', `/calendars/${cal}/events/${encodeURIComponent(row.google_event_id)}`)
      if (status >= 400 && status !== 404 && status !== 410) throw new Error(`HTTP ${status}`)
    }
    run("UPDATE appointments SET google_event_id = NULL, google_sync_status = 'synced', google_sync_error = NULL, google_synced_at = ? WHERE id = ?", [
      Date.now(),
      row.id
    ])
    return
  }
  const body = eventBody(row.id)
  let eventId = row.google_event_id
  if (!eventId) {
    // Anti-doublon : un événement a pu être créé juste avant un arrêt brutal, avant l'enregistrement de son identifiant.
    const found = await api<{ items?: Array<{ id: string }> }>(
      'GET',
      `/calendars/${cal}/events?privateExtendedProperty=${encodeURIComponent(`digiplanId=${row.id}`)}&showDeleted=false&maxResults=1`
    )
    eventId = found.data?.items?.[0]?.id ?? null
  }
  let result = eventId
    ? await api<{ id: string }>('PATCH', `/calendars/${cal}/events/${encodeURIComponent(eventId)}`, body)
    : await api<{ id: string }>('POST', `/calendars/${cal}/events`, body)
  if (eventId && (result.status === 404 || result.status === 410)) {
    result = await api<{ id: string }>('POST', `/calendars/${cal}/events`, body)
  }
  if (result.status >= 400 || !result.data?.id) throw new Error(`HTTP ${result.status}`)
  run(
    "UPDATE appointments SET google_event_id = ?, google_sync_status = 'synced', google_sync_error = NULL, google_synced_at = ? WHERE id = ?",
    [result.data.id, Date.now(), row.id]
  )
}

let syncing = false
let kickTimer: NodeJS.Timeout | null = null
let interval: NodeJS.Timeout | null = null

export async function runGoogleSync(): Promise<GoogleCalendarState> {
  if (syncing || !isActive() || !net.isOnline()) return getGoogleState()
  syncing = true
  const calendarId = config().calendarId!
  let lastError: string | null = null
  try {
    const rows = all<{ id: string; google_event_id: string | null; deleted_at: number | null; status: string }>(
      "SELECT id, google_event_id, deleted_at, status FROM appointments WHERE google_sync_status = 'pending' ORDER BY updated_at LIMIT 25"
    )
    for (const row of rows) {
      try {
        await syncOne(row, calendarId)
      } catch (err) {
        if (err instanceof AppError && err.code === 'revoked') {
          lastError = err.message
          break
        }
        const message = 'Synchronisation impossible pour ce rendez-vous.'
        log.warn(`Synchro Google ${row.id}`, err)
        run("UPDATE appointments SET google_sync_status = 'error', google_sync_error = ? WHERE id = ?", [message, row.id])
        lastError = 'Certains rendez-vous n’ont pas pu être synchronisés avec Google Calendar.'
      }
    }
    saveConfig({ lastSyncAt: Date.now(), lastError })
    if (rows.length === 25) kickGoogleSync()
  } catch (err) {
    log.error('Synchro Google', err)
    saveConfig({ lastError: 'La synchronisation Google Calendar a échoué. Nouvelle tentative automatique.' })
  } finally {
    syncing = false
  }
  return getGoogleState()
}

/** Relance les éléments en erreur puis synchronise. */
export async function syncGoogleNow(): Promise<GoogleCalendarState> {
  if (!isActive()) throw new AppError('invalid', 'Activez d’abord la synchronisation avec un agenda.')
  if (!net.isOnline()) throw new AppError('offline', 'Aucune connexion internet. La synchronisation reprendra automatiquement.')
  run("UPDATE appointments SET google_sync_status = 'pending' WHERE google_sync_status = 'error'")
  return runGoogleSync()
}

export function kickGoogleSync(): void {
  if (kickTimer) return
  kickTimer = setTimeout(() => {
    kickTimer = null
    void runGoogleSync()
  }, 2000)
}

export function startGoogleSyncWorker(): void {
  if (interval) clearInterval(interval)
  interval = setInterval(() => void runGoogleSync(), 2 * 60_000)
  setTimeout(() => void runGoogleSync(), 8000)
}

export function stopGoogleSyncWorker(): void {
  if (interval) clearInterval(interval)
  interval = null
  cancelGoogleConnect()
}
