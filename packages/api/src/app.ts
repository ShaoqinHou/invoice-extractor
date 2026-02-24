import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { invoiceRoutes } from './routes/invoices';
import { authRoutes } from './routes/auth';
import { adminRoutes } from './routes/admin';
import { requireAuth } from './lib/auth/middleware';

export function createApp(db: BetterSQLite3Database) {
  const app = new Hono()
    .use('*', cors({
      origin: (origin) => origin || '*',
      credentials: true,
    }))
    .get('/api/health', (c) => c.json({ ok: true, timestamp: Date.now() }));

  // Public auth routes (login, register, invite validation)
  app.route('', authRoutes(db));

  // Admin routes (require admin role)
  app.route('', adminRoutes(db));

  // Protected invoice routes
  app.use('/api/invoices/*', requireAuth(db));
  app.use('/api/settings', requireAuth(db));
  app.route('', invoiceRoutes(db));

  return app;
}
