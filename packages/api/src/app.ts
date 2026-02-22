import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { invoiceRoutes } from './routes/invoices';

export function createApp(db: BetterSQLite3Database) {
  const app = new Hono()
    .use('*', cors())
    .get('/api/health', (c) => c.json({ ok: true, timestamp: Date.now() }));

  app.route('', invoiceRoutes(db));

  return app;
}
