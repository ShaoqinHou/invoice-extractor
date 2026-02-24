import { Hono } from 'hono';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq, and, isNull } from 'drizzle-orm';
import { users, inviteTokens, userCompanies, companies } from '../db/schema';
import { hashPassword, verifyPassword } from '../lib/auth/password';
import {
  createSession,
  deleteSession,
  setSessionCookie,
  getSessionCookie,
  clearSessionCookie,
} from '../lib/auth/session';
import { requireAuth } from '../lib/auth/middleware';
import type { AuthUser } from '../lib/auth/middleware';

type AuthEnv = { Variables: { user: AuthUser } };

export function authRoutes(db: BetterSQLite3Database) {
  return new Hono<AuthEnv>()

    // ── POST /api/auth/login ─────────────────────────────────────
    .post('/api/auth/login', async (c) => {
      const body = await c.req.json().catch(() => null);
      if (!body?.email || !body?.password) {
        return c.json({ error: 'Email and password are required' }, 400);
      }

      const user = db
        .select()
        .from(users)
        .where(eq(users.email, body.email.toLowerCase().trim()))
        .get();

      if (!user) {
        return c.json({ error: 'Invalid email or password' }, 401);
      }

      if (!user.is_active) {
        return c.json({ error: 'Account is deactivated' }, 403);
      }

      const valid = await verifyPassword(body.password, user.password_hash);
      if (!valid) {
        return c.json({ error: 'Invalid email or password' }, 401);
      }

      const token = createSession(db, user.id);
      setSessionCookie(c, token);

      return c.json({
        user: {
          id: user.id,
          email: user.email,
          display_name: user.display_name,
          role: user.role,
        },
      });
    })

    // ── POST /api/auth/register ──────────────────────────────────
    .post('/api/auth/register', async (c) => {
      const body = await c.req.json().catch(() => null);
      if (!body?.token || !body?.password) {
        return c.json({ error: 'Invite token and password are required' }, 400);
      }

      const email = body.email?.toLowerCase().trim();
      const displayName = body.display_name?.trim() || null;

      // Validate invite token
      const now = new Date().toISOString();
      const invite = db
        .select()
        .from(inviteTokens)
        .where(and(eq(inviteTokens.token, body.token), isNull(inviteTokens.used_at)))
        .get();

      if (!invite) {
        return c.json({ error: 'Invalid or already used invite' }, 400);
      }

      if (invite.expires_at < now) {
        return c.json({ error: 'Invite has expired' }, 400);
      }

      // If invite is email-locked, verify it matches
      if (invite.email && invite.email !== email) {
        return c.json({ error: 'This invite is for a different email address' }, 400);
      }

      const registerEmail = email || invite.email;
      if (!registerEmail) {
        return c.json({ error: 'Email is required' }, 400);
      }

      // Check if email already taken
      const existing = db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, registerEmail))
        .get();

      if (existing) {
        return c.json({ error: 'An account with this email already exists' }, 409);
      }

      if (body.password.length < 8) {
        return c.json({ error: 'Password must be at least 8 characters' }, 400);
      }

      // Create user
      const passwordHash = await hashPassword(body.password);
      const result = db.insert(users).values({
        email: registerEmail,
        display_name: displayName,
        password_hash: passwordHash,
        role: invite.role,
        is_active: true,
        created_at: now,
        updated_at: now,
      }).returning({ id: users.id }).get();

      // Mark invite as used
      db.update(inviteTokens)
        .set({ used_at: now, used_by: result.id })
        .where(eq(inviteTokens.id, invite.id))
        .run();

      // Auto-join company if invite specifies one
      if (invite.company_id) {
        db.insert(userCompanies).values({
          user_id: result.id,
          company_id: invite.company_id,
          role: invite.role,
          joined_at: now,
        }).run();
      }

      // Auto-login
      const sessionToken = createSession(db, result.id);
      setSessionCookie(c, sessionToken);

      return c.json({
        user: {
          id: result.id,
          email: registerEmail,
          display_name: displayName,
          role: invite.role,
        },
      }, 201);
    })

    // ── POST /api/auth/logout ────────────────────────────────────
    .post('/api/auth/logout', (c) => {
      const token = getSessionCookie(c);
      if (token) {
        deleteSession(db, token);
      }
      clearSessionCookie(c);
      return c.json({ ok: true });
    })

    // ── GET /api/auth/me ─────────────────────────────────────────
    .get('/api/auth/me', requireAuth(db), (c) => {
      const user = c.get('user');

      // Fetch user's companies
      const userComps = db
        .select({
          company_id: userCompanies.company_id,
          company_role: userCompanies.role,
          company_name: companies.name,
          company_slug: companies.slug,
        })
        .from(userCompanies)
        .innerJoin(companies, eq(userCompanies.company_id, companies.id))
        .where(eq(userCompanies.user_id, user.id))
        .all();

      return c.json({
        user: {
          id: user.id,
          email: user.email,
          display_name: user.display_name,
          role: user.role,
        },
        companies: userComps.map((uc) => ({
          id: uc.company_id,
          name: uc.company_name,
          slug: uc.company_slug,
          role: uc.company_role,
        })),
      });
    })

    // ── GET /api/auth/invite/:token — validate invite (public) ───
    .get('/api/auth/invite/:token', (c) => {
      const token = c.req.param('token');
      const now = new Date().toISOString();

      const invite = db
        .select({
          email: inviteTokens.email,
          role: inviteTokens.role,
          expires_at: inviteTokens.expires_at,
          used_at: inviteTokens.used_at,
          company_id: inviteTokens.company_id,
        })
        .from(inviteTokens)
        .where(eq(inviteTokens.token, token))
        .get();

      if (!invite) {
        return c.json({ error: 'Invalid invite' }, 404);
      }

      if (invite.used_at) {
        return c.json({ error: 'Invite already used' }, 410);
      }

      if (invite.expires_at < now) {
        return c.json({ error: 'Invite has expired' }, 410);
      }

      // Get company name if applicable
      let companyName: string | null = null;
      if (invite.company_id) {
        const company = db
          .select({ name: companies.name })
          .from(companies)
          .where(eq(companies.id, invite.company_id))
          .get();
        companyName = company?.name ?? null;
      }

      return c.json({
        valid: true,
        email: invite.email,
        role: invite.role,
        company_name: companyName,
      });
    })

    // ── GET /api/auth/status — check if auth is enabled ──────────
    .get('/api/auth/status', (c) => {
      return c.json({
        auth_enabled: process.env.AUTH_ENABLED === 'true',
      });
    });
}
