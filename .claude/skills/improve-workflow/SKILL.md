---
name: improve-workflow
description: Self-improving workflow — analyzes issues log and proposes improvements
user_invocable: true
---

# /improve-workflow — Self-Improving Workflow

Analyzes recurring issues from `.claude/workflow/issues.md` and proposes improvements to rules, hooks, and skills.

## Process

### 1. Read Issues Log
Read `.claude/workflow/issues.md` and group entries by category:
- `cross-feature-import` — import boundary violations
- `command_failure` — bash command failures
- `test_failure` — test failures
- Other categories as they emerge

### 2. Identify Patterns
For each category, count occurrences. Focus on patterns with 3+ occurrences.

### 3. Draft Improvements
For recurring patterns, draft one or more of:
- **New rules** (`.claude/rules/`) to prevent the issue
- **Hook improvements** to catch it earlier
- **Skill updates** if a workflow step is missing

### 4. Write Draft
Write proposed changes to `.claude/workflow/improvements-draft.md` with:
- Issue category and frequency
- Proposed fix (new rule, hook change, or skill update)
- Exact file paths and content to add/modify

### 5. User Review
Present the draft to the user for review. Do NOT apply changes automatically.
User approves → apply changes. User rejects → discard or revise.

## Example Output
```markdown
## Proposed Improvements

### 1. Cross-Feature Import (5 occurrences)
**Pattern:** features/invoices/ repeatedly imports from features/settings/
**Proposed fix:** Extract shared utility to components/patterns/
**Files to create:** packages/web/src/components/patterns/SettingsContext.tsx

### 2. Command Failure (3 occurrences)
**Pattern:** `python3` command not found on MINGW64
**Proposed fix:** Update rule to emphasize `python` not `python3`
**Files to update:** .claude/rules/tech-conventions.md
```
