import { randomBytes } from 'crypto';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq, and, gt } from 'drizzle-orm';
import { sessions, users } from '../../db/schema';
import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';

const SESSION_COOKIE = 'session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export function createSession(db: BetterSQLite3Database, userId: number): string {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.insert(sessions).values({
    token,
    user_id: userId,
    expires_at: expiresAt,
    created_at: new Date().toISOString(),
  }).run();
  return token;
}

export function validateSession(db: BetterSQLite3Database, token: string) {
  const now = new Date().toISOString();
  const session = db
    .select({
      sessionId: sessions.id,
      userId: sessions.user_id,
      expiresAt: sessions.expires_at,
    })
    .from(sessions)
    .where(and(eq(sessions.token, token), gt(sessions.expires_at, now)))
    .get();

  if (!session) return null;

  const user = db
    .select({
      id: users.id,
      email: users.email,
      display_name: users.display_name,
      role: users.role,
      is_active: users.is_active,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .get();

  if (!user || !user.is_active) return null;

  return user;
}

export function deleteSession(db: BetterSQLite3Database, token: string): void {
  db.delete(sessions).where(eq(sessions.token, token)).run();
}

export function deleteUserSessions(db: BetterSQLite3Database, userId: number): void {
  db.delete(sessions).where(eq(sessions.user_id, userId)).run();
}

export function setSessionCookie(c: Context, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
    secure: process.env.NODE_ENV === 'production',
  });
}

export function getSessionCookie(c: Context): string | undefined {
  return getCookie(c, SESSION_COOKIE);
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

export function cleanExpiredSessions(db: BetterSQLite3Database): void {
  const now = new Date().toISOString();
  db.delete(sessions).where(gt(now, sessions.expires_at)).run();
}
