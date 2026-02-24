---
name: test
description: Testing conventions and patterns
user_invocable: true
---

# /test — Testing Conventions

## File Naming
Tests go next to the code they test, in a `__tests__/` directory:
```
packages/api/src/utils/__tests__/displayName.test.ts
packages/web/src/features/invoices/__tests__/InvoiceList.test.tsx
```

## Test Structure
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { myFunction } from '../myModule';

describe('myFunction', () => {
  beforeEach(() => {
    // Reset state between tests
  });

  it('returns expected value for valid input', () => {
    const result = myFunction('input');
    expect(result).toBe('expected');
  });

  it('throws on invalid input', () => {
    expect(() => myFunction(null)).toThrow('specific error');
  });
});
```

## Mocking Patterns

### Module mocks (vitest)
```typescript
vi.mock('../api', () => ({
  fetchInvoices: vi.fn().mockResolvedValue([]),
}));
```

### MSW for API mocking (web tests)
```typescript
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

const server = setupServer(
  http.get('/api/invoices', () => {
    return HttpResponse.json([{ id: 1, status: 'draft' }]);
  }),
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

## Assertion Rules
- **Concrete values:** `expect(total).toBe(72.21)` not `expect(total).toBeTruthy()`
- **Specific strings:** `expect(name).toBe('Acme Corp')` not `expect(name).toBeDefined()`
- **Array lengths:** `expect(items).toHaveLength(4)` not `expect(items.length).toBeGreaterThan(0)`
- **Object equality:** `expect(obj).toEqual({ key: 'value' })` for deep comparison
- **Error messages:** `expect(() => fn()).toThrow('specific message')`

## Running Tests
```bash
# As agent — feature-scoped only:
npm run test --workspace=packages/web -- src/features/invoices/

# As lead — full suite:
npm test

# With marker for hooks:
bash .claude/hooks/run-tests.sh --feature invoices
```
