// Requêtes SQL brutes pour les agrégations (plus lisibles et performantes que l'ORM dans ces cas).

import type Database from 'better-sqlite3'
import { getSqlite } from './client'

const cache = new Map<string, Database.Statement>()

function stmt(sql: string): Database.Statement {
  const db = getSqlite()
  let s = cache.get(sql)
  if (!s) {
    s = db.prepare(sql)
    cache.set(sql, s)
  }
  return s
}

export function all<T>(sql: string, params: Record<string, unknown> | unknown[] = {}): T[] {
  return (Array.isArray(params) ? stmt(sql).all(...params) : stmt(sql).all(params)) as T[]
}

export function get<T>(sql: string, params: Record<string, unknown> | unknown[] = {}): T | undefined {
  return (Array.isArray(params) ? stmt(sql).get(...params) : stmt(sql).get(params)) as T | undefined
}

export function run(sql: string, params: Record<string, unknown> | unknown[] = {}): Database.RunResult {
  return Array.isArray(params) ? stmt(sql).run(...params) : stmt(sql).run(params)
}

/** À appeler lorsque la connexion est fermée (restauration). */
export function clearStatementCache(): void {
  cache.clear()
}

/** Construit « ?,?,? » pour une clause IN. */
export function placeholders(n: number): string {
  return Array.from({ length: n }, () => '?').join(',')
}

/** Normalise un texte pour la recherche (minuscules, sans accents). */
export function searchable(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/** Échappe les caractères spéciaux de LIKE. */
export function likePattern(value: string): string {
  return `%${searchable(value).replace(/[\\%_]/g, (m) => `\\${m}`)}%`
}
