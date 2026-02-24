# Testing Rules

## The Testing Depth Framework

Every change requires testing at the **appropriate depth**. A visual snapshot is NOT a complete test. You must think about WHAT the change does and test accordingly.

### Layer 1: Unit Tests (Logic)

Tests pure functions, computations, data transformations in isolation.

**When required:** Any change that adds or modifies business logic, utility functions, data processing, or state management.

**What to test:**
- Input → output correctness with concrete values
- Edge cases (empty, null, overflow, unicode)
- Error handling paths

**NOT sufficient alone for:** Anything that connects to the UI, API, or external systems.

```typescript
// GOOD: tests the actual logic
expect(formatCurrency(126.71, 'NZD')).toBe('$126.71');
// BAD: vague assertion
expect(formatCurrency(126.71, 'NZD')).toBeTruthy();
```

### Layer 2: Integration Tests (Wiring)

Tests that components are connected correctly — button → handler → API call → response handling.

**When required:** Any feature that involves UI interacting with backend, navigation, or cross-component communication. This includes: buttons that trigger actions, forms that submit data, links that navigate, downloads, uploads.

**What to test:**
- Clicking a button calls the correct handler with correct arguments
- The handler makes the correct API call (URL, method, params)
- The API route exists, accepts the right params, returns the right shape
- Navigation works (correct route, correct params)
- Error states are handled (API errors show feedback)

**How to test:**
- Component tests with mocked API calls (MSW or vi.mock)
- Verify fetch/XHR calls are made with correct URLs and params
- Test that handlers are wired to the correct DOM elements

```typescript
// GOOD: verifies the button actually triggers the right action
it('calls export API with xlsx format when Excel button clicked', async () => {
  const user = userEvent.setup();
  render(<ExportButton ids={[1,2]} />);
  await user.click(screen.getByText('Excel'));
  // Verify the download was initiated with correct params
  expect(mockDownload).toHaveBeenCalledWith([1,2], 'xlsx');
});
```

### Layer 3: Behavioral E2E Tests (Flow)

Tests actual user flows end-to-end in the browser using chrome-devtools MCP.

**When required:** Any user-facing feature, especially: new pages/routes, CRUD operations, multi-step workflows, features that produce visible output.

**What to test — NOT just "is it visible" but "does it work":**
- Click a button → observe the RESULT (network request fires, UI updates, download starts)
- Submit a form → verify the data was saved (check API response or page content after save)
- Navigate between pages → verify data persists/loads correctly
- Test the **happy path** and at least one **error path**

**How to test with chrome-devtools MCP:**
```
1. navigate_page → take_snapshot (visual check)
2. click on element → take_snapshot (verify state change)
3. list_network_requests → verify API calls fired
4. evaluate_script → check DOM state, run fetch, verify behavior
5. list_console_messages → no unexpected errors
```

**Critical: "visible in snapshot" ≠ "working".** A button can appear in a snapshot but do nothing on click. You MUST test the interaction, not just the presence.

### Layer 4: Output Verification (Correctness)

Tests that the OUTPUT of a feature is correct — the actual content, not just that something was produced.

**When required:** Any feature that produces artifacts: file exports (CSV, Excel, PDF), generated reports, email content, API responses with structured data.

**What to test:**
- Download the generated file → verify its content
- Check that exported data matches the source data
- Verify format is correct (valid CSV, valid XLSX, correct columns)
- For complex outputs, use LLM reading capabilities (read the file as an LLM, describe what it contains, compare against expected)

**How to test:**
- For CSV/text: read the file, parse it, assert specific rows/columns
- For binary formats (XLSX): use API endpoint to generate, read via evaluate_script or download and inspect
- For hard-to-parse formats: use LLM to read the output file and verify correctness
- Test with known data so you can assert exact expected content

```typescript
// GOOD: verifies the actual exported content
it('exports invoice data as valid CSV with correct columns', async () => {
  const csv = await generateCSV([mockInvoice]);
  const rows = csv.split('\n');
  expect(rows[0]).toBe('ID,Supplier,Date,Amount,Status');
  expect(rows[1]).toContain('Acme Corp');
  expect(rows[1]).toContain('126.71');
});
```

## Deciding What Depth You Need

**Ask yourself these questions for every change:**

1. **Does it have logic?** → Layer 1 (unit tests)
2. **Does it connect UI to backend?** → Layer 2 (integration tests)
3. **Can a user interact with it?** → Layer 3 (behavioral E2E)
4. **Does it produce output/artifacts?** → Layer 4 (output verification)

Most features need **multiple layers**. A new "Export Excel" feature needs ALL FOUR:
- L1: data transformation logic
- L2: button → handler → API wiring
- L3: user can click it and a download happens
- L4: the downloaded file contains correct data

A simple CSS fix might only need L3 (verify it looks right in browser).

A backend-only API change needs L1 + L2 (logic + route wiring).

## File Locations

- Unit tests: `packages/{pkg}/src/{module}/__tests__/{Name}.test.ts`
- Example: `packages/api/src/lib/llm/__tests__/schema.test.ts`

## Running Tests

- Feature-scoped (agents): `npm run test --workspace=packages/web -- src/features/{feature}/`
- API workspace: `npm run test --workspace=packages/api`
- Full suite (lead only): `npm test`
- Via hook: `bash .claude/hooks/run-tests.sh` or `bash .claude/hooks/run-tests.sh --feature invoices`

## Test Structure

```typescript
import { describe, it, expect } from 'vitest';

describe('ModuleName', () => {
  it('does specific thing with concrete values', () => {
    const result = myFunction(input);
    expect(result).toBe(expectedValue);
  });
});
```

## Assertion Rules

- Assert concrete values: `expect(x).toBe(5)` not `expect(x).toBeTruthy()`
- Assert specific strings: `expect(name).toBe('Acme Corp')` not `expect(name).toBeDefined()`
- Test error cases explicitly: `expect(() => fn()).toThrow('specific message')`
- Use `toEqual` for objects, `toBe` for primitives

## Mocking

- Use `vi.mock()` for module mocks
- Use MSW for API mocking in web tests
- Mock at boundaries, not internals
