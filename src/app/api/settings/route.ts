import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { settings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getScheduler } from '@/lib/pipeline/PipelineQueue';

/** Default settings values. */
const DEFAULTS: Record<string, unknown> = {
  tier_concurrency: 2,
  worker_idle_minutes: 5,
};

/** Valid setting keys and their constraints. */
const VALIDATORS: Record<string, (v: unknown) => boolean> = {
  tier_concurrency: (v) => typeof v === 'number' && v >= 1 && v <= 4 && Number.isInteger(v),
  worker_idle_minutes: (v) => typeof v === 'number' && v >= 1 && v <= 30 && Number.isInteger(v),
};

/** GET /api/settings — returns all settings as { key: value }. */
export async function GET() {
  const db = getDb();
  const rows = db.select().from(settings).all();

  const result: Record<string, unknown> = { ...DEFAULTS };
  for (const row of rows) {
    if (row.key in DEFAULTS) {
      result[row.key] = row.value;
    }
  }

  return NextResponse.json(result);
}

/** PUT /api/settings — upserts settings, applies immediately. */
export async function PUT(request: NextRequest) {
  const body = await request.json() as Record<string, unknown>;
  const db = getDb();
  const errors: string[] = [];

  for (const [key, value] of Object.entries(body)) {
    const validator = VALIDATORS[key];
    if (!validator) {
      errors.push(`Unknown setting: ${key}`);
      continue;
    }
    if (!validator(value)) {
      errors.push(`Invalid value for ${key}: ${JSON.stringify(value)}`);
      continue;
    }

    // Upsert: try update, then insert if not found
    const existing = db.select().from(settings).where(eq(settings.key, key)).get();
    if (existing) {
      db.update(settings)
        .set({ value: value as number })
        .where(eq(settings.key, key))
        .run();
    } else {
      db.insert(settings)
        .values({ key, value: value as number })
        .run();
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ errors }, { status: 400 });
  }

  // Apply settings to the running pipeline queue immediately
  try {
    const scheduler = getScheduler();
    if (body.tier_concurrency !== undefined) {
      scheduler.updateConfig(body.tier_concurrency as number);
    }
    if (body.worker_idle_minutes !== undefined) {
      scheduler.updateConfig(undefined, (body.worker_idle_minutes as number) * 60 * 1000);
    }
  } catch {
    // Pipeline queue might not be initialized yet — settings saved for next startup
  }

  return NextResponse.json({ ok: true });
}
