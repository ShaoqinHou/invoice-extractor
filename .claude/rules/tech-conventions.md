# Tech Conventions

## TypeScript
- Strict mode, no `any` type — use `unknown` + type narrowing
- Named exports only (no default exports)
- ESM only — `import`/`export`, no `require()`

## React (packages/web)
- React 19, functional components only
- Vite + Tailwind CSS v4
- Path alias: `@web` → `packages/web/src`

## API (packages/api)
- Hono HTTP server on port 3002
- Input validation with Zod, typed responses
- Path alias: `@api` → `packages/api/src`

## Data Fetching
- TanStack Query — key factory per feature (`keys.ts`)
- Mutations with toast feedback (success/error)
- TanStack Router — file-based routes in feature folders

## Database
- Drizzle ORM — no raw SQL
- SQLite via better-sqlite3

## Shell Environment
- Windows MINGW64, use forward slashes in paths
- Use `python` not `python3`
- Use `node -e` for JSON parsing (jq may not be available)

## Ports
- API: 3002
- Web: 5175
