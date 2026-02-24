import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serve } from '@hono/node-server';
import { createApp } from '../app';
import { createDb } from '../db/client';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Type 5: API E2E test — real HTTP server on a random port, real fetch().
 * Tests the full network stack: TCP → HTTP → Hono → handler → SQLite → response.
 */

let server: ReturnType<typeof serve>;
let baseUrl: string;
let dbPath: string;
let sqlite: ReturnType<typeof createDb>['sqlite'];

beforeAll(async () => {
  dbPath = path.join(os.tmpdir(), `test-e2e-${Date.now()}.db`);
  const created = createDb(dbPath);
  sqlite = created.sqlite;

  // Create tables
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_filename TEXT NOT NULL, display_name TEXT NOT NULL,
      file_path TEXT NOT NULL, upload_date TEXT, invoice_date TEXT,
      supplier_name TEXT, invoice_number TEXT, total_amount REAL,
      gst_amount REAL, currency TEXT DEFAULT 'NZD', notes TEXT,
      raw_extracted_text TEXT, raw_llm_response TEXT,
      status TEXT DEFAULT 'uploading', error_message TEXT,
      gst_number TEXT, due_date TEXT, exception_type TEXT,
      exception_details TEXT, file_hash TEXT UNIQUE,
      ocr_tier INTEGER, approved_date TEXT, company_id INTEGER
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
      password_hash TEXT NOT NULL, role TEXT DEFAULT 'user' NOT NULL,
      is_active INTEGER DEFAULT 1 NOT NULL,
      created_at TEXT, updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, slug TEXT UNIQUE,
      is_active INTEGER DEFAULT 1 NOT NULL,
      created_at TEXT, updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS user_companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL, company_id INTEGER NOT NULL,
      role TEXT DEFAULT 'user' NOT NULL, joined_at TEXT
    );
    CREATE TABLE IF NOT EXISTS invite_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT UNIQUE NOT NULL, email TEXT, role TEXT NOT NULL,
      company_id INTEGER, created_by INTEGER,
      expires_at TEXT NOT NULL, used_at TEXT, used_by INTEGER,
      created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT UNIQUE NOT NULL,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL, created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS supplier_master (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, gst_number TEXT, aliases TEXT,
      created_at TEXT, updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS attrs_dictionary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL, canonical_name TEXT NOT NULL,
      column_group TEXT, description TEXT,
      source TEXT DEFAULT 'system', created_at TEXT
    );
  `);

  const app = createApp(created.db);

  // Start on random available port
  await new Promise<void>((resolve) => {
    server = serve({ fetch: app.fetch, port: 0 }, (info) => {
      baseUrl = `http://localhost:${info.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  server?.close();
  sqlite.close();
  try { fs.unlinkSync(dbPath); } catch {}
});

describe('Real HTTP E2E', () => {
  it('GET /api/health over real HTTP', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('POST /api/auth/login over real HTTP rejects invalid credentials', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'fake@test.com', password: 'wrong' }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it('request/response headers are correct', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    const ct = res.headers.get('content-type');
    expect(ct).toContain('application/json');
  });

  it('404 for unknown routes', async () => {
    const res = await fetch(`${baseUrl}/api/nonexistent`);
    expect(res.status).toBe(404);
  });
});
