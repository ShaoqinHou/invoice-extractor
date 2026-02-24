---
name: build
description: Quick reference for dev commands
user_invocable: true
---

# /build — Development Commands

## Start Servers
```bash
npm run dev:all          # Start both API + Web
npm run dev:api          # API only (port 3002)
npm run dev:web          # Web only (port 5175)
```

## URLs
- API: http://localhost:3002
- Web: http://localhost:5175
- API health: http://localhost:3002/api/health

## Testing
```bash
npm test                                                    # Full suite
npm run test --workspace=packages/api                       # API tests only
npm run test --workspace=packages/web                       # Web tests only
npm run test --workspace=packages/web -- src/features/invoices/  # Feature tests
bash .claude/hooks/run-tests.sh                             # Full suite + marker
bash .claude/hooks/run-tests.sh --feature invoices          # Feature + marker
```

## Build
```bash
npm run build            # Build web package (tsc + vite build)
```

## Database
```bash
npm run db:push --workspace=packages/api   # Push schema changes (drizzle-kit)
```
