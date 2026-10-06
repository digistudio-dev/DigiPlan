// Connexion SQLite (better-sqlite3) + Drizzle, application des migrations.

import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema'
import { databasePath, migrationsDir } from '../paths'
import { createLogger } from '../logger'

const log = createLogger('db')

export type Db = BetterSQLite3Database<typeof schema>

let sqlite: Database.Database | null = null
let db: Db | null = null

export function openDatabase(path = databasePath()): Db {
  if (db) return db
  sqlite = new Database(path)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('synchronous = NORMAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('busy_timeout = 5000')
  db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: migrationsDir() })
  const fk = sqlite.pragma('foreign_keys', { simple: true })
  log.info(`Base ouverte : ${path} (foreign_keys=${fk})`)
  return db
}

export function getDb(): Db {
  if (!db) throw new Error('Database not opened')
  return db
}

export function getSqlite(): Database.Database {
  if (!sqlite) throw new Error('Database not opened')
  return sqlite
}

/** Exécute une fonction dans une transaction SQLite synchrone. */
export function tx<T>(fn: () => T): T {
  return getSqlite().transaction(fn)()
}

export function closeDatabase(): void {
  if (sqlite) {
    try {
      sqlite.pragma('wal_checkpoint(TRUNCATE)')
    } catch {
      // ignore
    }
    sqlite.close()
    log.info('Base fermée')
  }
  sqlite = null
  db = null
}
