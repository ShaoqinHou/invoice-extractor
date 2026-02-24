import { createMiddleware } from 'hono/factory';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { validateSession, getSessionCookie } from './session';
import type { Role } from '../../db/schema';
import { ROLES } from '../../db/schema';

export interface AuthUser {
  id: number;
  email: string;
  display_name: string | null;
  role: string;
  is_active: boolean;
}

// Synthetic admin user when AUTH_ENABLED=false
const DEV_USER: AuthUser = {
  id: 0,
  email: 'dev@localhost',
  display_name: 'Dev User',
  role: 'admin',
  is_active: true,
};

type AuthEnv = { Variables: { user: AuthUser } };

const ROLE_LEVEL: Record<string, number> = {
  viewer: 0,
  user: 1,
  manager: 2,
  admin: 3,
};

function isAuthEnabled(): boolean {
  return process.env.AUTH_ENABLED === 'true';
}

/**
 * Attaches user to context if authenticated, passes through if not.
 * When AUTH_ENABLED=false, always attaches dev user.
 */
export function optionalAuth(db: BetterSQLite3Database) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    if (!isAuthEnabled()) {
      c.set('user', DEV_USER);
      return next();
    }

    const token = getSessionCookie(c);
    if (token) {
      const user = validateSession(db, token);
      if (user) {
        c.set('user', user as AuthUser);
      }
    }
    return next();
  });
}

/**
 * Requires a valid session. Returns 401 if not authenticated.
 * When AUTH_ENABLED=false, always passes with dev user.
 */
export function requireAuth(db: BetterSQLite3Database) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    if (!isAuthEnabled()) {
      c.set('user', DEV_USER);
      return next();
    }

    const token = getSessionCookie(c);
    if (!token) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const user = validateSession(db, token);
    if (!user) {
      return c.json({ error: 'Invalid or expired session' }, 401);
    }

    c.set('user', user as AuthUser);
    return next();
  });
}

/**
 * Requires the user to have at least the specified role level.
 * Must be used after requireAuth.
 */
export function requireRole(minRole: Role) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    if (!isAuthEnabled()) {
      return next();
    }

    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const userLevel = ROLE_LEVEL[user.role] ?? 0;
    const requiredLevel = ROLE_LEVEL[minRole] ?? 0;

    if (userLevel < requiredLevel) {
      return c.json({ error: 'Insufficient permissions' }, 403);
    }

    return next();
  });
}
