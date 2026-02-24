import { sqliteTable, text, integer, real, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const invoices = sqliteTable('invoices', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  original_filename: text('original_filename').notNull(),
  display_name: text('display_name').notNull(),
  file_path: text('file_path').notNull(),
  upload_date: text('upload_date').default("datetime('now')"),

  // Minimal fixed identity fields — truly universal across all invoices
  invoice_date: text('invoice_date'),
  supplier_name: text('supplier_name'),
  invoice_number: text('invoice_number'),
  total_amount: real('total_amount'),
  gst_amount: real('gst_amount'),
  currency: text('currency').default('NZD'),

  // LLM notes — free-form observations about the document
  notes: text('notes'),

  // Raw data for debugging / reprocessing
  raw_extracted_text: text('raw_extracted_text'),
  raw_llm_response: text('raw_llm_response'),
  status: text('status').default('uploading'),
  error_message: text('error_message'),

  // Supplier tax registration
  gst_number: text('gst_number'),

  // Payment due date (YYYY-MM-DD)
  due_date: text('due_date'),

  // Exception handling
  exception_type: text('exception_type'), // null for normal, or: 'scan_quality', 'investigate', 'value_mismatch'
  exception_details: text('exception_details'), // JSON details about the exception

  // Three-stage workflow fields
  file_hash: text('file_hash').unique(),
  ocr_tier: integer('ocr_tier'),
  approved_date: text('approved_date'),

  // Multi-tenant: nullable for backwards compatibility
  company_id: integer('company_id'),
});

export const invoiceEntries = sqliteTable('invoice_entries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  invoice_id: integer('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  amount: real('amount'),
  entry_type: text('entry_type'), // charge, discount, tax, total, due, subtotal, adjustment, info
  attrs: text('attrs', { mode: 'json' }), // flexible key-value pairs
  sort_order: integer('sort_order').default(0),
});

export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').unique().notNull(),
  value: text('value', { mode: 'json' }),
});

// ── Auth tables ─────────────────────────────────────────────────────────

export const ROLES = ['admin', 'manager', 'user', 'viewer'] as const;
export type Role = typeof ROLES[number];

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').unique().notNull(),
  display_name: text('display_name'),
  password_hash: text('password_hash').notNull(),
  role: text('role').default('user').notNull(), // global role: admin | manager | user | viewer
  is_active: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
  created_at: text('created_at').default("datetime('now')"),
  updated_at: text('updated_at').default("datetime('now')"),
});

export const companies = sqliteTable('companies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  slug: text('slug').unique(),
  is_active: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
  created_at: text('created_at').default("datetime('now')"),
  updated_at: text('updated_at').default("datetime('now')"),
});

export const userCompanies = sqliteTable('user_companies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  company_id: integer('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  role: text('role').default('user').notNull(), // per-company role override
  joined_at: text('joined_at').default("datetime('now')"),
}, (table) => [
  uniqueIndex('user_company_unique').on(table.user_id, table.company_id),
]);

export const inviteTokens = sqliteTable('invite_tokens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  token: text('token').unique().notNull(),
  email: text('email'), // if set, only this email can use the invite
  role: text('role').notNull(), // role granted on registration
  company_id: integer('company_id').references(() => companies.id),
  created_by: integer('created_by').references(() => users.id),
  expires_at: text('expires_at').notNull(),
  used_at: text('used_at'),
  used_by: integer('used_by').references(() => users.id),
  created_at: text('created_at').default("datetime('now')"),
});

export const sessions = sqliteTable('sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  token: text('token').unique().notNull(),
  user_id: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires_at: text('expires_at').notNull(),
  created_at: text('created_at').default("datetime('now')"),
});

export const supplierMaster = sqliteTable('supplier_master', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  gst_number: text('gst_number'),
  aliases: text('aliases', { mode: 'json' }), // string[] of alternate names
  created_at: text('created_at').default("datetime('now')"),
  updated_at: text('updated_at').default("datetime('now')"),
});

export const attrsDictionary = sqliteTable('attrs_dictionary', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull(), // e.g. "kwh", "unit_rate", "period"
  canonical_name: text('canonical_name').notNull(), // display name e.g. "kWh", "Unit Rate"
  column_group: text('column_group'), // one of: 'amount', 'unit', 'unit_amount', 'unit_price', 'extra'
  description: text('description'), // what this field means
  source: text('source').default('system'), // 'system' or 'llm_discovered'
  created_at: text('created_at').default("datetime('now')"),
});
