// Journal technique local (%APPDATA%\DigiPlan\logs\digiplan.log), avec rotation simple.

import { appendFileSync, existsSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { logsDir } from './paths'

const MAX_SIZE = 5 * 1024 * 1024
type Level = 'INFO' | 'WARN' | 'ERROR'

let logFile: string | null = null

function file(): string {
  if (!logFile) logFile = join(logsDir(), 'digiplan.log')
  return logFile
}

function rotateIfNeeded(path: string) {
  try {
    if (existsSync(path) && statSync(path).size > MAX_SIZE) {
      const old = `${path}.1`
      if (existsSync(old)) rmSync(old)
      renameSync(path, old)
    }
  } catch {
    // La rotation ne doit jamais interrompre l'application.
  }
}

function serialize(detail: unknown): string {
  if (detail === undefined) return ''
  if (detail instanceof Error) return ` | ${detail.name}: ${detail.message}${detail.stack ? `\n${detail.stack}` : ''}`
  try {
    return ` | ${JSON.stringify(detail)}`
  } catch {
    return ` | ${String(detail)}`
  }
}

function write(level: Level, scope: string, message: string, detail?: unknown) {
  const line = `${new Date().toISOString()} [${level}] [${scope}] ${message}${serialize(detail)}\n`
  try {
    const path = file()
    rotateIfNeeded(path)
    appendFileSync(path, line, 'utf8')
  } catch {
    // ignore
  }
  if (level === 'ERROR') console.error(line.trim())
  else if (level === 'WARN') console.warn(line.trim())
}

export function createLogger(scope: string) {
  return {
    info: (message: string, detail?: unknown) => write('INFO', scope, message, detail),
    warn: (message: string, detail?: unknown) => write('WARN', scope, message, detail),
    error: (message: string, detail?: unknown) => write('ERROR', scope, message, detail)
  }
}

export type Logger = ReturnType<typeof createLogger>
