# Shared Components

## Component Layers

### `components/ui/` — Primitives
Stateless, generic UI building blocks. No domain logic, no API calls.

Available components:
- **Button** — `Button`, variants: primary, secondary, destructive, ghost, outline
- **Badge** — `Badge`, variants: default, success, warning, error, info, processing, orange
- **Card** — `Card`, `CardHeader`, `CardContent`, `CardFooter`
- **Dialog** — `Dialog` with open/onClose/title/footer props
- **Input** — `Input` with label, error, helperText, start/end icons

Import: `import { Button, Card } from '@web/components/ui'`

### `components/layout/` — Page Shell
App-level layout components.

Available components:
- **RootLayout** — root shell with drag-drop upload, TopBar, Outlet
- **TopBar** — app header with nav links and awaiting count badge
- **PageContainer** — page wrapper with title, description, actions, scrollable body

Import: `import { PageContainer } from '@web/components/layout'`

### `components/patterns/` — Reusable App Patterns
Mid-level patterns between primitives and domain components. Populated as patterns emerge.

## Import Boundaries

**STRICT RULES:**
1. `features/{a}/` CANNOT import from `features/{b}/` — extract to shared first
2. `components/ui/` CANNOT import from `features/`
3. `components/layout/` SHOULD NOT import from `features/` (known tech debt: TopBar imports from features/invoices)
4. `features/` CAN import from `components/ui/`, `components/layout/`, `components/patterns/`

## When to Extract
If a pattern is used in 3+ features, extract it to `components/patterns/`.
Check shared components before creating new ones in feature folders.
