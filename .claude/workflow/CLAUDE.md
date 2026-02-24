# TDD Workflow

## 6-Phase Development Process

### Phase 1: Design
Write a design doc in `.claude/workflow/design/{feature}.md` with:
- Feature description and user stories
- Behavioral specifications (given/when/then)
- API contracts (endpoints, request/response shapes)
- Component hierarchy and data flow

### Phase 2: Scaffold
Create folder structure from the design:
- Route files, component files, hook files
- `__tests__/` directories
- Type definitions

### Phase 3: Tests (Red)
Write failing tests FIRST at the appropriate **testing depth** (see `.claude/rules/testing.md`):

For each change, determine which layers are needed:
- **Layer 1 (Unit):** Business logic, data transformations → unit tests with concrete values
- **Layer 2 (Integration):** UI↔backend wiring → test that clicks trigger correct API calls
- **Layer 3 (Behavioral):** User flows → test in browser that interactions produce results
- **Layer 4 (Output):** Features producing artifacts → verify the output content is correct

Most features need MULTIPLE layers. A button that downloads a file needs all four.
Tests should fail because the implementation doesn't exist yet.

### Phase 4: Implement (Green)
Make the tests pass:
- Write the minimum code to pass each test
- Run tests frequently: `bash .claude/hooks/run-tests.sh`
- Don't over-engineer — just make tests green

### Phase 5: E2E Verify (HARD GATE)
Browser verification with chrome-devtools MCP via `/verify` skill.

**"Visible in snapshot" ≠ "working".** You MUST verify:
- **Visual:** Elements render correctly (snapshot)
- **Behavioral:** Interactive elements do something when clicked (click → check result)
- **Output:** Features that produce artifacts generate correct content (download → inspect)
- **Errors:** No unexpected console errors or failed network requests

A button appearing in a snapshot but doing nothing on click is a **verification failure**.
Verify-marker must NOT be written until all appropriate layers are checked.

### Phase 6: Review
Final quality checks:
- Code quality — no `any`, named exports, clean imports
- Test coverage — all new code has tests
- Security — no injection vulnerabilities, input validation
- Import boundaries respected

## Bug-Fix Fast Path
For small fixes (single file, clear bug):
1. Skip phases 1-2
2. Write a regression test (phase 3)
3. Fix the bug (phase 4)
4. Run `/verify` (phase 5)

## Module Structure
```
packages/web/src/
  components/
    ui/          — shared primitives (Button, Card, etc.)
    layout/      — page shell (RootLayout, TopBar, PageContainer)
    patterns/    — reusable app patterns
  features/
    invoices/
      components/  — domain-specific components
      hooks/       — React Query hooks
      __tests__/   — feature tests
  lib/             — utilities (cn, api client)

packages/api/src/
  db/              — schema, migrations
  lib/
    llm/           — LLM extraction pipeline
    pdf/           — PDF/OCR processing
    pipeline/      — job queue and processing
  routes/          — Hono route handlers
  utils/           — shared utilities
```

## Artifact Locations
- Design docs: `.claude/workflow/design/{feature}.md`
- Test results: `.claude/workflow/test-result.txt`
- Verify marker: `.claude/workflow/verify-marker.txt`
- Issues log: `.claude/workflow/issues.md`
- Status: `.claude/workflow/STATUS.md`
