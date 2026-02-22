import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

type DbInstance = BetterSQLite3Database<typeof schema>;

/**
 * Factory: create a new db instance from a given path.
 * Returns both the Drizzle db and the underlying sqlite instance
 * so the caller can manage the connection lifecycle.
 */
export function createDb(dbPath: string): { db: DbInstance; sqlite: InstanceType<typeof Database> } {
  const resolvedPath = path.resolve(dbPath);
  const sqlite = new Database(resolvedPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}

// ── Singleton for internal use (PipelineQueue, normalizeAttrs, etc.) ──

const DB_PATH = process.env.DATABASE_PATH || path.join(PROJECT_ROOT, 'data', 'invoices.db');

let _db: DbInstance | null = null;

/**
 * Get the process-wide singleton db.
 * Used by PipelineQueue, normalizeAttrs, and other internal modules
 * that need db access without receiving it as a parameter.
 *
 * The singleton is initialised the first time this is called.
 * Call createDb() instead when you need explicit lifecycle control.
 */
export function getDb(): DbInstance {
  if (!_db) {
    const { db } = createDb(DB_PATH);
    _db = db;
  }
  return _db;
}
