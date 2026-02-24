# Project Status

## Current State
- **Phase:** Active development
- **Last verified:** 2026-02-23 (all 58 tests pass, E2E verified)
- **Active feature:** Excel-like cell selection in ReviewForm

## Completed
- [x] Test infrastructure (Vitest) configured — 29 API + 29 Web tests
- [x] TDD workflow established with 6-phase process
- [x] **Testing depth framework** — 4-layer model (Unit → Integration → Behavioral → Output)
- [x] Hook system configured (session-start, check-edited-file, inject-rules, task-completed, stop-nudge, log-bash-failure)
- [x] Rules and skills documented (tech-conventions, shared-components, testing, verify, build, test, improve-workflow)
- [x] Component organization (barrel exports, patterns dir)
- [x] SplitPane drag cursor steal fix (pointer-events:none during drag)
- [x] Compact status badges in sidebar (exception-specific codes)
- [x] Excel/CSV export buttons + fix ESM dynamic import bug
- [x] Image preview fix for non-ASCII filenames (RFC 5987 Content-Disposition)
- [x] Expanded ExceptionType system (6 types)

## Workflow Improvements
- Testing rules now require depth analysis for every feature
- Verify skill checks behavior + output, not just visual presence
- Subagent inject-rules hook includes testing depth context
