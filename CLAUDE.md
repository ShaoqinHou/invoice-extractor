# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Invoice Extractor is a document processing app that uploads invoices/receipts (PDF, images), extracts structured data via a multi-tier OCR + LLM pipeline, and presents results for human review and approval. Default currency is NZD.

## Monorepo Structure

npm workspaces monorepo with two packages:

- **`packages/api`** — Hono HTTP server (port 3002), SQLite via Drizzle ORM, LLM agentic extraction pipeline
- **`packages/web`** — React SPA (Vite, port 5175), TanStack Router + React Query, Tailwind CSS v4

There is also a legacy Next.js app in the root `src/` directory (with `next.config.ts`, route handlers in `src/app/api/`) — this is **not the active codebase**. The active app is in `packages/`.

## Commands

```bash
# Development (run both from project root)
npm run dev:api          # tsx watch packages/api/src/index.ts
npm run dev:web          # vite --port 5175

# Build
npm run build            # builds web package (tsc && vite build)

# Database
npm run db:push --workspace=packages/api   # drizzle-kit push (SQLite)
```

### Testing

```bash
npm test                                                    # Full suite (API + Web)
npm run test --workspace=packages/api                       # API tests only
npm run test --workspace=packages/web                       # Web tests only
npm run test --workspace=packages/web -- src/features/invoices/  # Feature tests
bash .claude/hooks/run-tests.sh                             # Full suite + writes PASS/FAIL marker
bash .claude/hooks/run-tests.sh --feature invoices          # Feature tests + marker
```

No linter/formatter config exists.

## Architecture

### Processing Pipeline (packages/api/src/lib/pipeline/)

Upload flow: `POST /api/invoices` → `startProcessing()` → `PipelineQueue.enqueue()`.

The `PipelineQueue` is a singleton that processes jobs with concurrency control:
- **Tier semaphore** — limits concurrent invoice processing (default 2, configurable)
- **OCR mutex** — only 1 OCR job at a time (RAM constraint)
- **WorkerManager** — persistent Python child processes communicating via NDJSON over stdin/stdout, with idle timeout auto-shutdown

### OCR Strategy (packages/api/src/lib/pdf/extract.ts)

**PDFs:**
1. **Tier 1: pymupdf4llm** (~1s) — text-layer extraction for clean PDFs
2. **Tier 2: VLM OCR** (~40-60s) — Ghostscript renders pages → PaddleX orient/unwarp → glm-4.6v-flash reads text

Quality gates between tiers: CID garbage detection, replacement char count, minimum text length.

**Images (JPG, PNG):**
- Sent **directly** to glm-4.6v-flash — no preprocessing, no conversion. Raw image quality produces the best OCR results.
- Files >5MB are resized (Pillow LANCZOS) before sending.
- VLM calls include retry on 429/5xx (3 attempts with exponential backoff).

**Images (HEIC, TIFF, BMP, WEBP):**
- Converted to PNG first (`image_to_pages.py`), then preprocessed (orient + unwarp) and sent to VLM.

**Legacy fallback:** PaddleOCR (tier 3) is available via `ENABLE_OCR_FALLBACK=true` but not used by default.
Optional image enhancement (CLAHE + denoise + sharpen) via `VLM_ENHANCE=true` in vlm_preprocess.py — off by default.

### LLM Agentic Extraction (packages/api/src/lib/llm/)

Uses Anthropic SDK with a configurable API proxy (ZAI_BASE_URL). The `agenticExtract()` function runs a tool-use loop (max 10 turns) where the LLM investigates the document and calls `submit_invoice` when done. Result is validated with Zod (`InvoiceExtractionSchema`).

Optional OCR verification step (`verify.ts`) cross-references OCR output against text-layer data.

### Invoice Status Lifecycle

`queued` → `uploading` → `extracting` → `processing` → `verifying` → `draft` → `approved`

Exception states: `exception` (with types: `scan_quality`, `investigate`, `value_mismatch`), `error`.

### Frontend Architecture (packages/web/)

- **Router**: TanStack Router — routes: `/invoices` (list), `/invoices/$id` (review detail)
- **Data fetching**: TanStack React Query with custom hooks in `features/invoices/hooks/`
- **Path alias**: `@web` → `packages/web/src`
- **API proxy**: Vite dev server proxies `/api` → `http://localhost:3002`
- **Components**: `components/ui/` for primitives (Button, Card, Dialog, Badge, Input), `components/layout/` for page shell, `features/invoices/components/` for domain components

### Database Schema (packages/api/src/db/schema.ts)

SQLite with Drizzle ORM. Key tables: `invoices` (with status workflow fields, OCR tier, exception handling), `invoice_entries` (line items with flexible `attrs` JSON column for structured metadata like unit/quantity/rate), `settings`, `supplier_master`, `attrs_dictionary`.

### Python Scripts (scripts/)

Called as child processes from the API. Each script reads input and writes JSON to stdout:
- `pymupdf4llm_extract.py`, `pymupdf_worker.py` — text-layer extraction
- `gs_render.py` — Ghostscript PDF→image rendering
- `image_to_pages.py` — image file conversion
- `vlm_preprocess.py` — PaddleX orientation + UVDoc unwarping + optional enhancement
- `enhance_image.py` — standalone CLAHE + denoise + sharpen (used by vlm_preprocess.py)
- `tesseract_ocr.py`, `ocr_worker.py` — legacy Tesseract OCR (not active by default)
- `paddle_ocr.py` — legacy PaddleOCR (not active by default)

## Environment Variables

Configured via `.env` at project root (see `.env.example`):
- `ZAI_API_KEY`, `ZAI_BASE_URL`, `ZAI_MODEL` — LLM API (z.ai Anthropic-compatible proxy)
- `DATABASE_PATH` — SQLite DB path (default: `./data/invoices.db`)
- `UPLOAD_DIR` — file storage (default: `./uploads`)
- `ENABLE_OCR_FALLBACK` — set `true` to fall back to PaddleOCR when VLM fails
- `VLM_ENHANCE` — set `true` to enable image enhancement in vlm_preprocess.py

Relative paths in env are resolved against project root by `packages/api/src/index.ts`.

## TDD Workflow

See `.claude/workflow/CLAUDE.md` for the full 6-phase TDD process. Summary:

1. **Design** → 2. **Scaffold** → 3. **Tests (Red)** → 4. **Implement (Green)** → 5. **E2E Verify** → 6. **Review**

Bug-fix fast-path: skip phases 1-2, write regression test, fix, verify.

Key skills: `/verify` (E2E browser check), `/build` (dev commands), `/test` (testing conventions), `/improve-workflow` (self-improving feedback loop).

## Component Organization

```
packages/web/src/components/
  ui/          — shared primitives (Button, Badge, Card, Dialog, Input) + barrel index.ts
  layout/      — page shell (RootLayout, TopBar, PageContainer) + barrel index.ts
  patterns/    — reusable app patterns (extracted when used in 3+ features)
```

### Import Boundaries
- `features/{a}/` CANNOT import from `features/{b}/` — use shared components
- `components/ui/` CANNOT import from `features/`
- Import shared components via barrel: `import { Button, Card } from '@web/components/ui'`

## Prerequisites

- Node.js, npm (workspaces support)
- Python (called as `python`, not `python3` — MINGW64 environment)
- Ghostscript, Tesseract OCR, PaddleOCR (for the full OCR pipeline)
