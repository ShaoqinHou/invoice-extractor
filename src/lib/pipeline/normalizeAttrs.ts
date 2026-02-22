import { getDb } from '@/lib/db/client';
import { attrsDictionary } from '@/lib/db/schema';

interface DictEntry {
  key: string;
  column_group: string | null;
  canonical_name: string;
}

let _dictCache: Map<string, DictEntry> | null = null;
let _dictCacheTime = 0;
const CACHE_TTL = 60_000; // 1 minute

function getDictionary(): Map<string, DictEntry> {
  const now = Date.now();
  if (_dictCache && now - _dictCacheTime < CACHE_TTL) return _dictCache;

  const db = getDb();
  const rows = db.select().from(attrsDictionary).all();
  const map = new Map<string, DictEntry>();
  for (const row of rows) {
    map.set(row.key, {
      key: row.key,
      column_group: row.column_group,
      canonical_name: row.canonical_name,
    });
  }
  _dictCache = map;
  _dictCacheTime = now;
  return map;
}

function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Normalize attrs from LLM output to standardized format.
 * Maps known keys to their column_group (unit, unit_amount, unit_price).
 * Unknown keys become extras with auto-discovered dictionary entries.
 */
export function normalizeAttrs(attrs: Record<string, unknown>): Record<string, unknown> {
  if (!attrs || Object.keys(attrs).length === 0) return attrs;

  const dictionary = getDictionary();
  const normalized: Record<string, unknown> = {};
  const extraQueue: Array<{ value: unknown; label: string }> = [];

  // If attrs already uses standardized format (has unit/unit_amount/unit_price or extra1), pass through
  const hasStandardized = 'unit' in attrs || 'unit_amount' in attrs || 'unit_price' in attrs || 'extra1' in attrs;
  if (hasStandardized) {
    // Already in new format — just pass through and auto-discover any unknown keys
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null || value === '') continue;
      normalized[key] = value;

      // Auto-discover unknown keys
      if (!dictionary.has(key) && !key.startsWith('extra') && key !== 'unit' && key !== 'unit_amount' && key !== 'unit_price') {
        autoDiscover(key);
      }
    }
    return normalized;
  }

  // Legacy format — map old keys to standardized columns
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === '') continue;

    const mapping = dictionary.get(key);
    if (mapping) {
      switch (mapping.column_group) {
        case 'unit':
          normalized.unit = value;
          break;
        case 'unit_amount':
          normalized.unit_amount = value;
          // If the key implies a unit (e.g., 'kwh' → 'kWh', 'days' → 'day'), set unit
          if (!normalized.unit) {
            const unitHints: Record<string, string> = {
              kwh: 'kWh', days: 'day', quantity: undefined as unknown as string,
            };
            if (unitHints[key]) normalized.unit = unitHints[key];
          }
          break;
        case 'unit_price':
          normalized.unit_price = value;
          break;
        case 'extra':
          extraQueue.push({ value, label: mapping.canonical_name });
          break;
        default:
          extraQueue.push({ value, label: mapping.canonical_name });
      }
    } else {
      // Unknown key — queue as extra and auto-discover
      extraQueue.push({ value, label: titleCase(key) });
      autoDiscover(key);
    }
  }

  // Assign extras as extra1, extra2, etc.
  extraQueue.forEach((item, i) => {
    const n = i + 1;
    normalized[`extra${n}`] = item.value;
    normalized[`extra${n}_label`] = item.label;
  });

  return normalized;
}

/** Auto-discover an unknown key by inserting it into the attrs_dictionary. */
function autoDiscover(key: string): void {
  try {
    const db = getDb();
    db.insert(attrsDictionary)
      .values({
        key,
        canonical_name: titleCase(key),
        column_group: 'extra',
        description: 'Auto-discovered from LLM output',
        source: 'llm_discovered',
      })
      .onConflictDoNothing()
      .run();

    // Invalidate cache
    _dictCache = null;
  } catch {
    // Ignore — may race with concurrent inserts
  }
}

/**
 * Normalize all entries in an extraction result.
 */
export function normalizeAllEntryAttrs(
  entries: Array<{ label: string; amount?: number | null; type?: string; attrs?: Record<string, unknown> | null }>,
): typeof entries {
  return entries.map(entry => {
    if (!entry.attrs || Object.keys(entry.attrs).length === 0) return entry;
    return { ...entry, attrs: normalizeAttrs(entry.attrs) };
  });
}
