import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { users } from './schema';
import { hashPassword } from '../lib/auth/password';

/**
 * On first startup with AUTH_ENABLED=true and no users in the DB,
 * create a default admin account.
 */
export async function seedAdminIfNeeded(db: BetterSQLite3Database): Promise<void> {
  if (process.env.AUTH_ENABLED !== 'true') return;

  const existingUsers = db.select({ id: users.id }).from(users).limit(1).all();
  if (existingUsers.length > 0) return;

  const email = process.env.ADMIN_EMAIL || 'admin@localhost';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();

  db.insert(users).values({
    email,
    display_name: 'Admin',
    password_hash: passwordHash,
    role: 'admin',
    is_active: true,
    created_at: now,
    updated_at: now,
  }).run();

  console.log(`[Auth] Created default admin account: ${email}`);
  if (!process.env.ADMIN_PASSWORD) {
    console.log(`[Auth] Default password: admin123 — change this immediately!`);
  }
}
