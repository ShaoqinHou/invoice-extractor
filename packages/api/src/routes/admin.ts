import { Hono } from 'hono';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq, desc, and } from 'drizzle-orm';
import { users, companies, userCompanies, inviteTokens, ROLES } from '../db/schema';
import { requireAuth, requireRole } from '../lib/auth/middleware';
import type { AuthUser } from '../lib/auth/middleware';
import { hashPassword } from '../lib/auth/password';
import { generateToken, deleteUserSessions } from '../lib/auth/session';

type AdminEnv = { Variables: { user: AuthUser } };

export function adminRoutes(db: BetterSQLite3Database) {
  const app = new Hono<AdminEnv>();

  // All admin routes require admin role
  app.use('*', requireAuth(db), requireRole('admin'));

  // ── Users ─────────────────────────────────────────────────────

  app.get('/api/admin/users', (c) => {
    const rows = db
      .select({
        id: users.id,
        email: users.email,
        display_name: users.display_name,
        role: users.role,
        is_active: users.is_active,
        created_at: users.created_at,
      })
      .from(users)
      .orderBy(desc(users.id))
      .all();

    return c.json(rows);
  });

  app.put('/api/admin/users/:id', async (c) => {
    const userId = parseInt(c.req.param('id'), 10);
    if (isNaN(userId)) return c.json({ error: 'Invalid ID' }, 400);

    const body = await c.req.json();
    const updates: Record<string, unknown> = {};

    if (body.display_name !== undefined) updates.display_name = body.display_name;
    if (body.role !== undefined) {
      if (!ROLES.includes(body.role)) return c.json({ error: 'Invalid role' }, 400);
      updates.role = body.role;
    }
    if (body.is_active !== undefined) {
      updates.is_active = body.is_active;
      // Deactivating a user kills their sessions
      if (!body.is_active) {
        deleteUserSessions(db, userId);
      }
    }
    if (body.password) {
      if (body.password.length < 8) return c.json({ error: 'Password must be at least 8 characters' }, 400);
      updates.password_hash = await hashPassword(body.password);
    }

    if (Object.keys(updates).length === 0) {
      return c.json({ error: 'No fields to update' }, 400);
    }

    updates.updated_at = new Date().toISOString();
    db.update(users).set(updates).where(eq(users.id, userId)).run();

    const updated = db
      .select({
        id: users.id,
        email: users.email,
        display_name: users.display_name,
        role: users.role,
        is_active: users.is_active,
      })
      .from(users)
      .where(eq(users.id, userId))
      .get();

    return c.json(updated);
  });

  // ── Companies ─────────────────────────────────────────────────

  app.get('/api/admin/companies', (c) => {
    const rows = db
      .select()
      .from(companies)
      .orderBy(desc(companies.id))
      .all();

    return c.json(rows);
  });

  app.post('/api/admin/companies', async (c) => {
    const body = await c.req.json();
    if (!body.name?.trim()) return c.json({ error: 'Company name is required' }, 400);

    const slug = body.slug?.trim() || body.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const now = new Date().toISOString();

    const result = db.insert(companies).values({
      name: body.name.trim(),
      slug,
      is_active: true,
      created_at: now,
      updated_at: now,
    }).returning({ id: companies.id }).get();

    return c.json({ id: result.id, name: body.name.trim(), slug }, 201);
  });

  app.put('/api/admin/companies/:id', async (c) => {
    const companyId = parseInt(c.req.param('id'), 10);
    if (isNaN(companyId)) return c.json({ error: 'Invalid ID' }, 400);

    const body = await c.req.json();
    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.slug !== undefined) updates.slug = body.slug.trim();
    if (body.is_active !== undefined) updates.is_active = body.is_active;

    if (Object.keys(updates).length === 0) {
      return c.json({ error: 'No fields to update' }, 400);
    }

    updates.updated_at = new Date().toISOString();
    db.update(companies).set(updates).where(eq(companies.id, companyId)).run();

    const updated = db.select().from(companies).where(eq(companies.id, companyId)).get();
    return c.json(updated);
  });

  // ── Company Members ───────────────────────────────────────────

  app.get('/api/admin/companies/:id/members', (c) => {
    const companyId = parseInt(c.req.param('id'), 10);
    if (isNaN(companyId)) return c.json({ error: 'Invalid ID' }, 400);

    const members = db
      .select({
        user_id: userCompanies.user_id,
        company_role: userCompanies.role,
        joined_at: userCompanies.joined_at,
        email: users.email,
        display_name: users.display_name,
        global_role: users.role,
      })
      .from(userCompanies)
      .innerJoin(users, eq(userCompanies.user_id, users.id))
      .where(eq(userCompanies.company_id, companyId))
      .all();

    return c.json(members);
  });

  app.post('/api/admin/companies/:id/members', async (c) => {
    const companyId = parseInt(c.req.param('id'), 10);
    if (isNaN(companyId)) return c.json({ error: 'Invalid ID' }, 400);

    const body = await c.req.json();
    if (!body.user_id) return c.json({ error: 'user_id is required' }, 400);

    const role = body.role || 'user';
    if (!ROLES.includes(role)) return c.json({ error: 'Invalid role' }, 400);

    try {
      db.insert(userCompanies).values({
        user_id: body.user_id,
        company_id: companyId,
        role,
        joined_at: new Date().toISOString(),
      }).run();
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('UNIQUE')) {
        return c.json({ error: 'User is already a member of this company' }, 409);
      }
      throw err;
    }

    return c.json({ ok: true }, 201);
  });

  app.delete('/api/admin/companies/:id/members/:userId', (c) => {
    const companyId = parseInt(c.req.param('id'), 10);
    const userId = parseInt(c.req.param('userId'), 10);
    if (isNaN(companyId) || isNaN(userId)) return c.json({ error: 'Invalid ID' }, 400);

    db.delete(userCompanies)
      .where(and(
        eq(userCompanies.company_id, companyId),
        eq(userCompanies.user_id, userId),
      ))
      .run();

    return c.json({ ok: true });
  });

  // ── Invites ───────────────────────────────────────────────────

  app.get('/api/admin/invites', (c) => {
    const rows = db
      .select({
        id: inviteTokens.id,
        token: inviteTokens.token,
        email: inviteTokens.email,
        role: inviteTokens.role,
        company_id: inviteTokens.company_id,
        created_by: inviteTokens.created_by,
        expires_at: inviteTokens.expires_at,
        used_at: inviteTokens.used_at,
        used_by: inviteTokens.used_by,
        created_at: inviteTokens.created_at,
      })
      .from(inviteTokens)
      .orderBy(desc(inviteTokens.id))
      .all();

    return c.json(rows);
  });

  app.post('/api/admin/invites', async (c) => {
    const body = await c.req.json();
    const authUser = c.get('user');

    const role = body.role || 'user';
    if (!ROLES.includes(role)) return c.json({ error: 'Invalid role' }, 400);

    const expiresInHours = body.expires_in_hours ?? 168; // default 7 days
    if (expiresInHours < 1 || expiresInHours > 720) {
      return c.json({ error: 'Expiry must be between 1 and 720 hours' }, 400);
    }

    const token = generateToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiresInHours * 60 * 60 * 1000).toISOString();

    const result = db.insert(inviteTokens).values({
      token,
      email: body.email?.toLowerCase().trim() || null,
      role,
      company_id: body.company_id || null,
      created_by: authUser.id,
      expires_at: expiresAt,
      created_at: now.toISOString(),
    }).returning({ id: inviteTokens.id }).get();

    return c.json({
      id: result.id,
      token,
      expires_at: expiresAt,
      role,
    }, 201);
  });

  app.delete('/api/admin/invites/:id', (c) => {
    const inviteId = parseInt(c.req.param('id'), 10);
    if (isNaN(inviteId)) return c.json({ error: 'Invalid ID' }, 400);

    db.delete(inviteTokens).where(eq(inviteTokens.id, inviteId)).run();
    return c.json({ ok: true });
  });

  return app;
}
