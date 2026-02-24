---
name: verify
description: E2E browser verification using chrome-devtools MCP — visual, behavioral, AND output checks
user_invocable: true
---

# /verify — E2E Browser Verification

Run this skill to verify the app works correctly in the browser. This is NOT just a visual check — you must verify **behavior** and **output correctness** too.

## Prerequisites

- Dev servers running: API (port 3002) + Web (port 5175)
- Chrome browser open and connected via chrome-devtools MCP

## Verification Layers

### 1. Visual Check (Presence)

Verify elements render correctly.

- `mcp__chrome-devtools__navigate_page` to target URL
- `mcp__chrome-devtools__take_snapshot` — verify elements are present
- Check: page structure, component presence, data display, no broken images

**This is necessary but NOT sufficient.** An element being visible doesn't mean it works.

### 2. Behavioral Check (Interaction)

Verify that interactive elements actually DO something when used.

For every new/changed interactive element (button, link, form, dropdown):
- `mcp__chrome-devtools__click` on the element
- `mcp__chrome-devtools__take_snapshot` after click — verify state changed
- `mcp__chrome-devtools__list_network_requests` — verify expected API calls fired
- Check: did clicking produce the expected result? Did the UI update? Did the right API call go out?

**Examples of behavioral verification:**
```
# Verify a button triggers a download
1. click on download button
2. list_network_requests → look for the download URL with correct params
3. If download URL missing → button is broken, FAIL

# Verify a form submits data
1. fill form fields
2. click submit button
3. list_network_requests → verify POST/PUT request with correct body
4. take_snapshot → verify success feedback (toast, redirect, state change)

# Verify navigation
1. click a link
2. take_snapshot → verify new page content loaded, URL changed
```

### 3. Output Verification (Correctness)

For features that produce output (exports, generated content, API responses):

- **File downloads:** Use `evaluate_script` to fetch the API endpoint directly and inspect the response:
  ```javascript
  // Check that a download endpoint returns valid content
  async () => {
    const r = await fetch('/api/invoices/download?ids=1&format=csv');
    const text = await r.text();
    return { status: r.status, contentType: r.headers.get('content-type'), preview: text.substring(0, 500), lineCount: text.split('\n').length };
  }
  ```
- **API responses:** Fetch endpoints directly and verify response shape and content
- **Complex formats:** Download the file, then use your LLM capabilities to read and verify correctness
- Check: does the output contain the expected data? Is the format correct? Are columns/fields present?

### 4. Error State Check

- `mcp__chrome-devtools__list_console_messages` filtered for errors
- No unexpected JavaScript errors
- Network errors for missing data are OK, but 4xx/5xx for expected endpoints are NOT OK
- Test at least one error path if the feature has error handling

### 5. API Health

```javascript
mcp__chrome-devtools__evaluate_script({
  function: "async () => { const r = await fetch('/api/health'); return r.ok ? 'healthy' : 'unhealthy'; }"
})
```

### 6. Write Verify Marker

On pass (ALL layers checked), write marker:
```bash
echo "PASS $(date -u +%Y-%m-%dT%H:%M:%SZ)" > .claude/workflow/verify-marker.txt
```

## Deciding What to Verify

**For each change you made, ask:**

| Question | If YES, do this |
|----------|-----------------|
| Did you add/change a visible element? | Layer 1: Visual snapshot |
| Did you add/change an interactive element? | Layer 2: Click it, verify behavior |
| Does the feature produce output? | Layer 3: Verify output content |
| Does it have error handling? | Layer 4: Test an error path |

**NEVER** write the verify marker after only doing visual checks for a feature that has interactive elements or produces output.

## Bug-Fix Fast Path

For single-file bug fixes:
1. Navigate to the affected page
2. Verify the bug is fixed (visual + behavioral as needed)
3. Check console for errors
4. Write verify-marker

## Failure Protocol

If any check fails:
1. Take a screenshot for evidence: `mcp__chrome-devtools__take_screenshot`
2. Report what failed and why
3. Do NOT write verify-marker
