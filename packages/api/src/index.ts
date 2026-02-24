import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..', '..');

// Load .env from project root (ZAI_API_KEY, etc.)
// override=false so dotenv v17 auto-loaded vars aren't clobbered
config({ path: path.join(projectRoot, '.env') });

// Resolve relative env paths against project root (not cwd which is packages/api/)
function resolveEnvPath(envVar: string, fallback: string): string {
  const val = process.env[envVar];
  if (!val) return path.join(projectRoot, fallback);
  if (path.isAbsolute(val)) return val;
  return path.resolve(projectRoot, val);
}

const dbPath = resolveEnvPath('DATABASE_PATH', 'data/invoices.db');
const uploadDir = resolveEnvPath('UPLOAD_DIR', 'uploads');
// Re-set env vars so downstream modules (storage/files.ts, etc.) see absolute paths
process.env.DATABASE_PATH = dbPath;
process.env.UPLOAD_DIR = uploadDir;

import { serve } from '@hono/node-server';
import { createApp } from './app';
import { createDb } from './db/client';
import { seedAdminIfNeeded } from './db/seed';

const { db } = createDb(dbPath);
await seedAdminIfNeeded(db);
const app = createApp(db);

const port = parseInt(process.env.PORT || '3002', 10);
const authStatus = process.env.AUTH_ENABLED === 'true' ? 'enabled' : 'disabled';
console.log(`Invoice Extractor API running on http://localhost:${port} (auth: ${authStatus})`);
serve({ fetch: app.fetch, port });

export { app };
export type AppType = typeof app;
