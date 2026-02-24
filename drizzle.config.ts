import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './packages/api/src/db/schema.ts',
  out: './packages/api/src/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_PATH || './data/invoices.db',
  },
});
