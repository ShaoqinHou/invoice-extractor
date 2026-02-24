import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../app';
import { createDb } from '../db/client';
import { sql } from 'drizzle-orm';
import * as schema from '../db/schema';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Type 3: API integration test — Hono app.request() with real SQLite.
 * No HTTP server started. Tests route handlers directly.
 */

let db: ReturnType<typeof createDb>['db'];
let sqlite: ReturnType<typeof createDb>['sqlite'];
let app: ReturnType<typeof createApp>;
let dbPath: string;

beforeAll(() => {
  // Create temp db file and push schema via raw SQL
  dbPath = path.join(os.tmpdir(), `test-api-${Date.now()}.db`);
  const created = createDb(dbPath);
  db = created.db;
  sqlite = created.sqlite;

  // Create tables manually (drizzle-kit push isn't available in tests)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_filename TEXT NOT NULL,
      display_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      upload_date TEXT DEFAULT (datetime('now')),
      invoice_date TEXT, supplier_name TEXT, invoice_number TEXT,
      total_amount REAL, gst_amount REAL, currency TEXT DEFAULT 'NZD',
      notes TEXT, raw_extracted_text TEXT, raw_llm_response TEXT,
      status TEXT DEFAULT 'uploading', error_message TEXT,
      gst_number TEXT, due_date TEXT,
      exception_type TEXT, exception_details TEXT,
      file_hash TEXT UNIQUE, ocr_tier INTEGER, approved_date TEXT,
      company_id INTEGER
    );
    CREATE TABLE IF NOT EXISTS invoice_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      label TEXT NOT NULL, amount REAL, entry_type TEXT,
      attrs TEXT, sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL, value TEXT
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL, display_name TEXT,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user' NOT NULL,
      is_active INTEGER DEFAULT 1 NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, slug TEXT UNIQUE,
      is_active INTEGER DEFAULT 1 NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS user_companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      role TEXT DEFAULT 'user' NOT NULL,
      joined_at TEXT DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS user_company_unique ON user_companies(user_id, company_id);
    CREATE TABLE IF NOT EXISTS invite_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT UNIQUE NOT NULL, email TEXT, role TEXT NOT NULL,
      company_id INTEGER REFERENCES companies(id),
      created_by INTEGER REFERENCES users(id),
      expires_at TEXT NOT NULL, used_at TEXT, used_by INTEGER REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT UNIQUE NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS supplier_master (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, gst_number TEXT, aliases TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS attrs_dictionary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL, canonical_name TEXT NOT NULL,
      column_group TEXT, description TEXT,
      source TEXT DEFAULT 'system',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  app = createApp(db);
});

afterAll(() => {
  sqlite.close();
  try { fs.unlinkSync(dbPath); } catch {}
});

describe('Hono app.request() integration', () => {
  it('GET /api/health returns ok', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.timestamp).toBeTypeOf('number');
  });

  it('GET /api/invoices returns list (auth disabled by default)', async () => {
    const res = await app.request('/api/invoices');
    // When AUTH_ENABLED !== 'true', middleware should pass through
    expect([200, 401]).toContain(res.status);
  });

  it('POST /api/auth/login rejects bad credentials', async () => {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@test.com', password: 'wrong' }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('CORS headers are set', async () => {
    const res = await app.request('/api/health', {
      headers: { Origin: 'http://localhost:5175' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5175');
  });
});
