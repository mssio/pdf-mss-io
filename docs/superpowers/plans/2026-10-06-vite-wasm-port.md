# PDF Toolbox (static Vite + WASM) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Summary

| # | Task | Deliverable | Model | Effort |
|---|---|---|---|---|
| 1 | Toolchain, Node 24 and app shell | App boots with header, theme toggle, empty home grid, new favicon; build + lint pass | Sonnet 5.5 | ~30 min |
| 2 | Pure helpers (TDD) | `filename`, `format`, `limits`, `pdf-files`, `page-ranges`, `passwords` with unit tests | Sonnet 5.5 | ~25 min |
| 3 | qpdf core | `getQpdf`, `ensureNoOpenPassword`, `describeQpdfError`, `assertOutput`, PDF fixture builder, integration harness | Opus 5.5 | ~30 min |
| 4 | Shared tool UI + Decrypt | Dropzone, `ToolPage`, `ResultCard`, `ErrorBox`, `SizeNotice`, `useQpdfJob`, `useBlobUrl`; Decrypt works end to end | Opus 5.5 | ~45 min |
| 5 | Encrypt | `/encrypt` with permissions, generated owner password | Sonnet 5.5 | ~20 min |
| 6 | Merge | `merge-list` reducer (TDD) and `/merge` with reorder/remove | Opus 5.5 | ~35 min |
| 7 | Extract pages | `/extract` with page-range input | Sonnet 5.5 | ~20 min |
| 8 | Compress | `/compress` with before/after sizes | Sonnet 5.5 | ~15 min |
| 9 | Info | `pdf-info` parser (TDD) and `/info` details card | Opus 5.5 | ~40 min |
| 10 | PWA and offline | Manifest, generated icons, service worker precaching the wasm | Sonnet 5.5 | ~20 min |
| 11 | Docs | README rewrite, AGENTS.md, CLAUDE.md | Sonnet 5.5 | ~20 min |
| 12 | Final verification | All checks green; manual desktop, offline and phone pass | Opus 5.5 + owner | ~20 min agent, ~20 min owner |
| 13 | Playwright setup, shell + offline tests | `npm run test:e2e`; fixtures, helpers; route error screen fixed for lazy pages | Sonnet 5.5 | ~30 min |
| 14 | Never-saved password fields | `SecretInput` in Decrypt/Encrypt, password-fields spec | Haiku 4.5 | ~15 min |
| 15 | Tool specs + screenshots | 39 Playwright tests across six tools; 28 screenshots | Haiku 4.5 | ~25 min |
| 16 | Docs + owner checklist | todo split into automated table + 10 owner boxes; README/AGENTS | Haiku 4.5 | ~15 min |
| 17 | Release 1.0.0 | CHANGELOG, PR to `main`, tag `v1.0.0`, GitHub release with `dist` zip | Sonnet 5.5 + owner approvals | ~15 min agent, ~5 min owner |

**Total:** about 7.25 hours of agent time (Tasks 1–12 are done; Tasks 13–17 add about 1.6 hours). Subagent-driven execution adds a reviewer pass per task
(about 10 minutes each, Opus 5.5). Model choice: Opus 5.5 for tasks that define interfaces other
tasks consume or parse untrusted structure (3, 4, 6, 9, 12); Sonnet 5.5 for tasks that follow an
established pattern.

**Goal:** Rebuild the Bun PDF Toolbox as a static Vite + React Router + WASM app with six
client-side tools, installable and offline-capable, covered by Playwright browser tests, and release it as version 1.0.0.

**Architecture:** A static SPA. React Router 8 data router with one lazy route per tool, all driven
by a registry in `src/tools.ts`. PDF work goes through `@mssio/qpdf-wasm` (qpdf in a Web Worker),
reached only via `src/lib/qpdf.ts`. Logic that can run without React lives in `src/lib/*` and is
unit-tested in Node; pages are thin.

**Tech Stack:** Node 24 LTS, Vite 8.3, React 19.3, React Router 8.4, TypeScript 6.0.3, Tailwind 4.3,
shadcn (new-york) on Radix, `@mssio/qpdf-wasm` 1.0.0, `vite-plugin-pwa` 2.0, Vitest 5.0, Playwright 1.63 (Chromium + WebKit).

**Spec:** `docs/superpowers/specs/2026-10-06-vite-wasm-port-design.md`

## Global Constraints

- Node 24 LTS: `.nvmrc` contains `24`; `package.json` `engines.node` is `">=24"`. Run every command under Node 24 (`nvm use`). Vitest 5 does not run on Node 25.
- Versions are the latest stable ones listed in spec section 1. TypeScript stays `~6.0.3` (typescript-eslint 8.71.1 supports TypeScript < 6.1). `@types/node` stays `^24`.
- The app is version **1.0.0** (`package.json` `"version": "1.0.0"`) and depends on `@mssio/qpdf-wasm` **`^1.0.0`** (1.0.0 has the same API as 0.1.0 and requires Node ≥ 24). Never install 0.x.
- Static output only: no server code, no API calls, no analytics. Files and passwords never leave the browser.
- All PDF work goes through `src/lib/qpdf.ts` (`getQpdf()`); never import `@mssio/qpdf-wasm` with a static value import in app code (type-only imports are fine). Tests may import it directly.
- Pass `File` objects to qpdf. If you pass a `Uint8Array` you still need afterwards, pass `bytes.slice()`, because the worker takes ownership of byte inputs.
- Every tool except Decrypt calls `ensureNoOpenPassword(qpdf, file)` for each input before doing any work. Only PDFs that need a password to open are rejected; restriction-only PDFs are accepted. No password fields outside Decrypt.
- Every qpdf output that becomes a download goes through `assertOutput()` first.
- Size policy: `MAX_TOTAL_BYTES = 250 * 1024 * 1024` (exactly 250 MB allowed), `PHONE_WARN_BYTES = 100 * 1024 * 1024`; constants live only in `src/lib/limits.ts`.
- UI: shadcn only. Ported files keep the old app's classes. New UI uses existing tokens (`bg-muted`, `text-muted-foreground`, `border-destructive/50` …), never raw hex colors.
- Code style in `src/`: double quotes, semicolons, 2-space indent (matches the ported old app). Root config files (`vite.config.ts`, `eslint.config.js`, `pwa-assets.config.ts`) keep the scaffold's single quotes and no semicolons.
- Import alias `@/` → `src/`. Imports from React Router use `react-router` (and `react-router/dom` for `RouterProvider`), never `react-router-dom`.
- User-facing copy is exactly as written in the spec and this plan.
- `docs/todo.md` lists the owner's manual checks. Until Task 16 rewrites it, the controller marks a finished task's section `(ready)`; after Task 16 it is an automated-checks table plus owner boxes. Release (Task 17) needs `npm run test:e2e` to pass and every owner box ticked.
- E2E (Tasks 13–16): `@playwright/test` `^1.63.0`; tests run against the production build (`vite preview` on port 4173); `chromium` runs every spec, `webkit` only `e2e/offline.spec.ts`; service workers blocked except in the offline spec; no CI. E2E files follow the `src/` style (double quotes, semicolons); `playwright.config.ts` follows the root-config style (single quotes, no semicolons).
- No `<input type="password">` anywhere: password fields use `SecretInput` (Task 14).
- Commit after every task and push immediately (`git push`); the branch is `port-vite-wasm`. End every commit message with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01NvYC5VwsQMEVA9j9Scdfc1
  ```
- Before each commit: `npm run lint && npm test && npm run build` must pass.

## Review Focus

1. **Retrying Decrypt with the same file after a wrong password.** The `File` must still work on the second attempt (inputs must not be detached). Pinned in Task 3 (integration test "retries with the same File").
2. **Dropping a mix of PDFs and other files, or several files on a single-file drop zone.** PDFs are kept, others are reported, single mode keeps only the first PDF. Pinned in Task 2 (`pickPdfFiles` tests).
3. **Page ranges typed loosely**: spaces, uppercase `Z`, trailing comma, page `0`, double separators. Normalized or rejected client-side, never sent malformed to qpdf. Pinned in Task 2 (`normalizePageRanges` tests).
4. **Reordering edge cases in Merge**: moving the first item up, the last down, the same file added twice, removing then re-adding. List order and identity stay correct. Pinned in Task 6 (`mergeListReducer` tests).
5. **Unusual file names**: Unicode, no extension, uppercase `.PDF`, leading dot, Windows/Unix paths, whitespace-only. Output names stay sensible. Pinned in Task 2 (`outputFilename` tests).
6. **A tool page's code fails to load** (flaky network before the service worker is installed, or a stale tab after a redeploy): the user sees the error screen with Reload, inside the normal header and footer, not a blank page. Pinned in Task 13 (`shell.spec.ts`, error-screen test; it is RED before the router fix).
7. **Re-uploading a file the app just produced** (downloaded names have no `.pdf` until saved; the app must accept the real `.pdf` file and handle a second Compress pass). Pinned in Task 15 (`compress.spec.ts` second pass).

---

### Task 1: Toolchain, Node 24 and app shell

**Files:**
- Create: `.nvmrc`, `src/router.ts`, `src/tools.ts`, `src/lib/theme.ts`, `src/lib/use-theme.ts`, `src/lib/utils.ts`, `src/styles/globals.css`, `src/index.css` (replaced), `src/components/AppShell.tsx`, `src/pages/HomePage.tsx`, `src/components/ui/{button,card,input,label,checkbox,alert,badge,separator}.tsx`, `public/favicon.svg` (replaced)
- Modify: `package.json`, `vite.config.ts`, `tsconfig.app.json`, `eslint.config.js`, `index.html`, `src/main.tsx`
- Delete: `src/App.tsx`, `src/App.css`, `src/assets/` (all), `public/icons.svg`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `cn(...inputs: ClassValue[]): string` from `@/lib/utils`
  - `type Tool = { id: string; path: string; title: string; navLabel: string; description: string; icon: LucideIcon; load: () => Promise<{ Component: ComponentType }> }` and `tools: Tool[]` from `@/tools` (empty array for now; later tasks append)
  - UI components: `Button`, `buttonVariants`, `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`, `CardAction`, `Input`, `Label`, `Checkbox`, `Alert`, `AlertTitle`, `AlertDescription`, `Badge`, `badgeVariants`, `Separator` from `@/components/ui/<name>`
  - Tool page modules export `function Component()`; the router lazy-loads them.

- [ ] **Step 1: Switch to Node 24 and pin it**

```bash
cd /Users/mss/Code/personal/008-mss.io/pdf.mss.io/pdf-mss-io
git switch port-vite-wasm
echo 24 > .nvmrc
nvm use   # must print v24.x
node -v
```

Expected: `v24.21.0` (or newer 24.x).

- [ ] **Step 2: Install dependencies (latest stable)**

```bash
npm install react@^19.3.0 react-dom@^19.3.0 react-router@^8.4.0 @mssio/qpdf-wasm@^1.0.0 \
  lucide-react@^1.52.0 clsx@^2.1.1 tailwind-merge@^3.7.0 class-variance-authority@^0.7.1 \
  @radix-ui/react-slot@^1.4.0 @radix-ui/react-label@^2.1.16 @radix-ui/react-checkbox@^1.3.12 \
  @radix-ui/react-separator@^1.1.16 tw-animate-css@^1.4.0
npm install -D vite@^8.3.3 @vitejs/plugin-react@^6.1.2 @rolldown/plugin-babel@^0.2.4 \
  babel-plugin-react-compiler@^1.0.0 @babel/core@^8.0.6 typescript@~6.0.3 eslint@^10.12.0 \
  @eslint/js@^10.0.1 typescript-eslint@^8.71.1 eslint-plugin-react-hooks@^7.1.1 \
  eslint-plugin-react-refresh@^0.5.7 globals@^17.13.0 @types/node@^24 @types/react@^19.3.0 \
  @types/react-dom@^19.3.0 tailwindcss@^4.3.3 @tailwindcss/vite@^4.3.3 vitest@^5.0.3
```

Expected: no `ERESOLVE` errors. `npm ls vitest typescript react-router @mssio/qpdf-wasm` shows 5.0.x, 6.0.3, 8.4.x, 1.0.x.

- [ ] **Step 3: Update `package.json` version, scripts and engines**

Set `"version": "1.0.0"` (the scaffold has `"0.0.0"`), set the `"scripts"` block and add `"engines"` (keep everything else):

```json
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "engines": {
    "node": ">=24"
  },
```

- [ ] **Step 4: Replace `vite.config.ts`**

```ts
/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
    testTimeout: 30_000,
  },
})
```

- [ ] **Step 5: Add the path alias to `tsconfig.app.json`**

Inside `"compilerOptions"`, after `"jsx": "react-jsx",` add:

```json
    "paths": { "@/*": ["./src/*"] },
```

- [ ] **Step 6: ESLint: ignore `.private/`, allow shadcn files to export variants**

In `eslint.config.js` change `globalIgnores(['dist'])` to `globalIgnores(['dist', '.private'])`, then append a second config object to the `defineConfig([...])` array, after the existing object:

```js
  {
    files: ['src/components/ui/**/*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
```

- [ ] **Step 7: Remove scaffold files**

```bash
git rm -q -r src/App.tsx src/App.css src/assets public/icons.svg
```

- [ ] **Step 8: Port styles, utils, theme hook and UI primitives from the old app**

```bash
OLD=../old_bun/src/client
mkdir -p src/components/ui src/lib src/styles src/pages
cp $OLD/styles/globals.css src/styles/globals.css
cp $OLD/index.css src/index.css
cp $OLD/lib/utils.ts src/lib/utils.ts
cp $OLD/lib/use-theme.ts src/lib/use-theme.ts
cp $OLD/components/ui/button.tsx $OLD/components/ui/card.tsx $OLD/components/ui/input.tsx $OLD/components/ui/label.tsx src/components/ui/
perl -pi -e 's#@/client/lib/theme-script#@/lib/theme#g; s#@/client/#@/#g' src/lib/use-theme.ts src/components/ui/*.tsx
grep -rn "@/client" src || echo "no old aliases left"
```

Expected: `no old aliases left`.

Create `src/lib/theme.ts`:

```ts
/** localStorage key for the light/dark preference; keep in sync with the inline script in index.html. */
export const THEME_STORAGE_KEY = "pdf-mss-io-theme";
```

- [ ] **Step 9: Add the four new shadcn primitives (new-york v4, adapted to per-package Radix imports)**

`src/components/ui/checkbox.tsx`:

```tsx
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { CheckIcon } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer size-4 shrink-0 rounded-[4px] border border-input shadow-xs transition-shadow outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:bg-input/30 dark:aria-invalid:ring-destructive/40 dark:data-[state=checked]:bg-primary",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
```

`src/components/ui/alert.tsx`:

```tsx
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current",
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground",
        destructive:
          "bg-card text-destructive *:data-[slot=alert-description]:text-destructive/90 [&>svg]:text-current",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Alert({ className, variant, ...props }: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return <div data-slot="alert" role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn("col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight", className)}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "col-start-2 grid justify-items-start gap-1 text-sm text-muted-foreground [&_p]:leading-relaxed",
        className,
      )}
      {...props}
    />
  );
}

export { Alert, AlertDescription, AlertTitle };
```

`src/components/ui/badge.tsx`:

```tsx
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "bg-destructive text-white focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40 [a&]:hover:bg-destructive/90",
        outline: "border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";

  return <Comp data-slot="badge" data-variant={variant} className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
```

`src/components/ui/separator.tsx`:

```tsx
import * as SeparatorPrimitive from "@radix-ui/react-separator";
import * as React from "react";

import { cn } from "@/lib/utils";

function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        "shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px",
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
```

- [ ] **Step 10: Favicon**

Replace `public/favicon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#171717"/>
  <path d="M19 10h17l11 11v31a3 3 0 0 1-3 3H19a3 3 0 0 1-3-3V13a3 3 0 0 1 3-3z" fill="#fff"/>
  <path d="M36 10v8a3 3 0 0 0 3 3h8z" fill="#a3a3a3"/>
  <path d="M26.5 35v-6a5.5 5.5 0 0 1 10.6-2.1" fill="none" stroke="#171717" stroke-width="3.2" stroke-linecap="round"/>
  <rect x="22" y="34" width="20" height="15" rx="3" fill="#171717"/>
  <circle cx="32" cy="40.5" r="2.2" fill="#fff"/>
  <path d="M32 41v3.5" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 11: Replace `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <title>PDF Toolbox</title>
    <meta name="description" content="Private PDF tools that run entirely in your browser." />
    <script>
      (function () {
        try {
          var k = "pdf-mss-io-theme";
          var s = localStorage.getItem(k);
          var dark = s === "dark" || (s !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
          document.documentElement.classList.toggle("dark", dark);
        } catch (e) {}
      })();
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 12: Tool registry, router and entry point**

`src/tools.ts`:

```ts
import type { LucideIcon } from "lucide-react";
import type { ComponentType } from "react";

export type Tool = {
  id: string;
  path: string;
  /** Page and card title, e.g. "Decrypt PDF". */
  title: string;
  /** Short header link label, e.g. "Decrypt". */
  navLabel: string;
  description: string;
  icon: LucideIcon;
  /** Lazy page module; it must export `Component`. */
  load: () => Promise<{ Component: ComponentType }>;
};

/** Every tool, in display order. Drives the header nav, the home grid and the routes. */
export const tools: Tool[] = [];
```

`src/router.ts`:

```ts
import { createBrowserRouter } from "react-router";

import { AppShell } from "@/components/AppShell";
import { HomePage } from "@/pages/HomePage";
import { tools } from "@/tools";

export const router = createBrowserRouter([
  {
    Component: AppShell,
    children: [{ path: "/", Component: HomePage }, ...tools.map((tool) => ({ path: tool.path, lazy: tool.load }))],
  },
]);
```

Replace `src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";

import { router } from "@/router";

import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
```

- [ ] **Step 13: App shell**

`src/components/AppShell.tsx`:

```tsx
import { Moon, Sun } from "lucide-react";
import { Link, Outlet } from "react-router";

import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/use-theme";
import { tools } from "@/tools";

export function AppShell() {
  const { mode, toggle } = useTheme();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 border-b border-border/80 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight text-foreground">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm text-primary-foreground">
              PDF
            </span>
            <span className="hidden sm:inline">Toolbox</span>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/">Home</Link>
            </Button>
            <div className="hidden items-center gap-1 md:flex">
              {tools.map((tool) => (
                <Button key={tool.id} variant="ghost" size="sm" asChild>
                  <Link to={tool.path}>{tool.navLabel}</Link>
                </Button>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0"
              onClick={toggle}
              aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {mode === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
        PDFs are processed locally in your browser. Nothing is uploaded.
      </footer>
    </div>
  );
}
```

- [ ] **Step 14: Home page**

`src/pages/HomePage.tsx`:

```tsx
import { Sparkles } from "lucide-react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { tools } from "@/tools";

export function HomePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="mb-12 text-center sm:mb-16">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
          <Sparkles className="size-3.5" />
          Privacy-focused PDF utilities
        </div>
        <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">Your PDF toolbox</h1>
        <p className="mx-auto mt-4 max-w-2xl text-pretty text-lg text-muted-foreground">
          Simple, focused tools for everyday PDF tasks, running entirely in your browser.
        </p>
      </div>

      <div className="mx-auto grid max-w-lg gap-6 sm:max-w-none sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((tool) => (
          <Card
            key={tool.id}
            className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-card to-muted/30 shadow-md transition-shadow hover:shadow-lg"
          >
            <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />
            <CardHeader>
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <tool.icon className="size-6" />
              </div>
              <CardTitle>{tool.title}</CardTitle>
              <CardDescription>{tool.description}</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto">
              <Button asChild className="w-full sm:w-auto">
                <Link to={tool.path}>Open tool</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 15: Verify**

```bash
npm run lint && npm test && npm run build
```

Expected: lint clean; Vitest "No test files found, exiting with code 0"; build writes `dist/`.

Then `npm run dev`, open http://localhost:5173: header with "PDF" badge, Home link and theme toggle; hero text; footer "PDFs are processed locally in your browser. Nothing is uploaded."; the dark-mode toggle works and survives a reload without a flash; the tab shows the new padlock favicon.

- [ ] **Step 16: Commit and push**

```bash
git add -A
git commit -m "feat: Vite app shell with ported UI on Node 24

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NvYC5VwsQMEVA9j9Scdfc1"
git push
```

---

### Task 2: Pure helpers (TDD)

**Files:**
- Create: `src/lib/filename.ts`, `src/lib/format.ts`, `src/lib/limits.ts`, `src/lib/pdf-files.ts`, `src/lib/page-ranges.ts`, `src/lib/passwords.ts`
- Test: `src/lib/filename.test.ts`, `src/lib/format.test.ts`, `src/lib/limits.test.ts`, `src/lib/pdf-files.test.ts`, `src/lib/page-ranges.test.ts`, `src/lib/passwords.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `outputFilename(uploadedName: string, suffix: string): string`
  - `formatBytes(bytes: number): string`; `sizeChange(before: number, after: number): { smaller: boolean; percent: number }`; `parsePdfDate(raw: string): Date | null`
  - `MAX_TOTAL_BYTES`, `PHONE_WARN_BYTES`; `type SizeCheck = { ok: true; phoneWarning: boolean } | { ok: false; message: string }`; `totalBytes(files: readonly Blob[]): number`; `checkSize(total: number, likelyPhone: boolean): SizeCheck`; `isLikelyPhone(): boolean`
  - `isPdfFile(file: File): boolean`; `pickPdfFiles(files: readonly File[], multiple: boolean): { accepted: File[]; rejectedCount: number }`
  - `normalizePageRanges(input: string): string | null`
  - `generateOwnerPassword(): string`; `validateNewPassword(password: string, confirm: string): string | null`

- [ ] **Step 1: Write the failing tests**

`src/lib/filename.test.ts`:

```ts
import { describe, expect, test } from "vitest";

import { outputFilename } from "@/lib/filename";

describe("outputFilename", () => {
  test.each([
    ["report.pdf", "-d", "report-d.pdf"],
    ["scan.final.PDF", "-compressed", "scan.final-compressed.PDF"],
    ["noext", "-d", "noext-d.pdf"],
    [".hidden", "-pages", ".hidden-pages.pdf"],
    ["C:\\Users\\me\\tax.pdf", "-protected", "tax-protected.pdf"],
    ["/home/me/tax.pdf", "-protected", "tax-protected.pdf"],
    ["   ", "-d", "document-d.pdf"],
    ["", "-d", "document-d.pdf"],
    ["  spaced.pdf  ", "-d", "spaced-d.pdf"],
    ["résumé 2026.pdf", "-d", "résumé 2026-d.pdf"],
  ])("%j + %j → %j", (name, suffix, expected) => {
    expect(outputFilename(name, suffix)).toBe(expected);
  });
});
```

`src/lib/format.test.ts`:

```ts
import { describe, expect, test } from "vitest";

import { formatBytes, parsePdfDate, sizeChange } from "@/lib/format";

describe("formatBytes", () => {
  test.each([
    [0, "0 B"],
    [1023, "1023 B"],
    [1024, "1.0 KB"],
    [1536, "1.5 KB"],
    [10650, "10 KB"],
    [250 * 1024 * 1024, "250 MB"],
    [1024 ** 3, "1.0 GB"],
  ])("%d → %s", (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});

describe("sizeChange", () => {
  test("smaller output", () => expect(sizeChange(1000, 730)).toEqual({ smaller: true, percent: 27 }));
  test("same size", () => expect(sizeChange(1000, 1000)).toEqual({ smaller: false, percent: 0 }));
  test("bigger output", () => expect(sizeChange(1000, 1100)).toEqual({ smaller: false, percent: -10 }));
  test("empty input", () => expect(sizeChange(0, 0)).toEqual({ smaller: false, percent: 0 }));
});

describe("parsePdfDate", () => {
  test.each([
    ["D:20260101120000Z", "2026-01-01T12:00:00.000Z"],
    ["D:20260101120000+07'00'", "2026-01-01T05:00:00.000Z"],
    ["D:20260101120000-05'30'", "2026-01-01T17:30:00.000Z"],
    ["D:2026", "2026-01-01T00:00:00.000Z"],
    ["20260315", "2026-03-15T00:00:00.000Z"],
  ])("%s → %s", (raw, iso) => {
    expect(parsePdfDate(raw)?.toISOString()).toBe(iso);
  });

  test("garbage → null", () => expect(parsePdfDate("yesterday")).toBeNull());
});
```

`src/lib/limits.test.ts`:

```ts
import { describe, expect, test } from "vitest";

import { checkSize, MAX_TOTAL_BYTES, PHONE_WARN_BYTES, totalBytes } from "@/lib/limits";

describe("checkSize", () => {
  test("exactly the limit is allowed", () => {
    expect(checkSize(MAX_TOTAL_BYTES, false)).toEqual({ ok: true, phoneWarning: false });
  });

  test("one byte over the limit is rejected with both sizes", () => {
    const result = checkSize(MAX_TOTAL_BYTES + 1, false);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe("Files must be 250 MB or less in total (you selected 250 MB).");
    }
  });

  test("phone warning only on phones above 100 MB", () => {
    expect(checkSize(PHONE_WARN_BYTES, true)).toEqual({ ok: true, phoneWarning: false });
    expect(checkSize(PHONE_WARN_BYTES + 1, true)).toEqual({ ok: true, phoneWarning: true });
    expect(checkSize(PHONE_WARN_BYTES + 1, false)).toEqual({ ok: true, phoneWarning: false });
  });
});

test("totalBytes sums every file", () => {
  const files = [new Blob([new Uint8Array(10)]), new Blob([new Uint8Array(32)])];
  expect(totalBytes(files)).toBe(42);
  expect(totalBytes([])).toBe(0);
});
```

`src/lib/pdf-files.test.ts`:

```ts
import { describe, expect, test } from "vitest";

import { isPdfFile, pickPdfFiles } from "@/lib/pdf-files";

const file = (name: string, type = "") => new File(["x"], name, { type });

describe("isPdfFile", () => {
  test("by extension, any case", () => expect(isPdfFile(file("SCAN.PDF"))).toBe(true));
  test("by MIME type without extension", () => expect(isPdfFile(file("download", "application/pdf"))).toBe(true));
  test("other files", () => expect(isPdfFile(file("notes.txt", "text/plain"))).toBe(false));
});

describe("pickPdfFiles", () => {
  test("multiple mode keeps every PDF in order and counts the rest", () => {
    const a = file("a.pdf");
    const b = file("b.pdf");
    const result = pickPdfFiles([a, file("x.txt"), b, file("y.png")], true);
    expect(result.accepted).toEqual([a, b]);
    expect(result.rejectedCount).toBe(2);
  });

  test("single mode keeps only the first PDF", () => {
    const a = file("a.pdf");
    expect(pickPdfFiles([file("x.txt"), a, file("b.pdf")], false)).toEqual({ accepted: [a], rejectedCount: 1 });
  });

  test("nothing usable", () => {
    expect(pickPdfFiles([file("x.txt")], false)).toEqual({ accepted: [], rejectedCount: 1 });
    expect(pickPdfFiles([], true)).toEqual({ accepted: [], rejectedCount: 0 });
  });
});
```

`src/lib/page-ranges.test.ts`:

```ts
import { expect, test } from "vitest";

import { normalizePageRanges } from "@/lib/page-ranges";

test.each([
  ["1-3", "1-3"],
  [" 1 - 3 , 7 ", "1-3,7"],
  ["5-Z", "5-z"],
  ["z", "z"],
  ["1-3,", "1-3"],
  ["3-1", "3-1"],
  ["1,4-z", "1,4-z"],
])("%j → %j", (input, expected) => {
  expect(normalizePageRanges(input)).toBe(expected);
});

test.each(["", "   ", "abc", "1--3", "1,,2", "0", "0-3", "2-00", "-3", "1-", "1;2"])("%j is invalid", (input) => {
  expect(normalizePageRanges(input)).toBeNull();
});
```

`src/lib/passwords.test.ts`:

```ts
import { describe, expect, test } from "vitest";

import { generateOwnerPassword, validateNewPassword } from "@/lib/passwords";

describe("generateOwnerPassword", () => {
  test("43 base64url characters from 32 random bytes", () => {
    const password = generateOwnerPassword();
    expect(password).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  test("different every time", () => {
    expect(generateOwnerPassword()).not.toBe(generateOwnerPassword());
  });
});

describe("validateNewPassword", () => {
  test("required", () => expect(validateNewPassword("", "")).toBe("Password is required."));
  test("must match", () => expect(validateNewPassword("abc", "abd")).toBe("Passwords don't match."));
  test("ok", () => expect(validateNewPassword("abc", "abc")).toBeNull());
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL, every file reports `Failed to resolve import "@/lib/…"`.

- [ ] **Step 3: Implement**

`src/lib/filename.ts`:

```ts
/** "report.pdf" + "-d" → "report-d.pdf". Drops directories; a blank name becomes "document". */
export function outputFilename(uploadedName: string, suffix: string): string {
  const base = uploadedName.replace(/^.*[/\\]/, "").trim() || "document.pdf";
  const dot = base.lastIndexOf(".");
  if (dot > 0 && dot < base.length - 1) {
    return `${base.slice(0, dot)}${suffix}${base.slice(dot)}`;
  }
  return `${base}${suffix}.pdf`;
}
```

`src/lib/format.ts`:

```ts
const UNITS = ["B", "KB", "MB", "GB"] as const;

/** 1536 → "1.5 KB". One decimal below 10, whole numbers above. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${UNITS[unit]}`;
}

/** Percent saved going from `before` to `after` bytes (negative when it grew). */
export function sizeChange(before: number, after: number): { smaller: boolean; percent: number } {
  const percent = before > 0 ? Math.round((1 - after / before) * 100) : 0;
  return { smaller: after < before, percent: percent === 0 ? 0 : percent };
}

const PDF_DATE = /^(?:D:)?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(?:(Z)|([+-])(\d{2})'?(\d{2})?'?)?/;

/** Parses a PDF date string ("D:20260101120000+07'00'"); null when it isn't one. */
export function parsePdfDate(raw: string): Date | null {
  const match = PDF_DATE.exec(raw.trim());
  if (!match) return null;
  const [, year, month = "01", day = "01", hour = "00", minute = "00", second = "00", , sign, offsetHours = "00", offsetMinutes = "00"] =
    match;
  const utc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  if (Number.isNaN(utc)) return null;
  const offset = sign ? (sign === "+" ? 1 : -1) * (Number(offsetHours) * 60 + Number(offsetMinutes)) : 0;
  return new Date(utc - offset * 60_000);
}
```

`src/lib/limits.ts`:

```ts
import { formatBytes } from "@/lib/format";

/** Hard limit for the combined size of a tool's inputs. qpdf runs out of wasm memory well above this. */
export const MAX_TOTAL_BYTES = 250 * 1024 * 1024;
/** Above this, phones get a non-blocking warning. */
export const PHONE_WARN_BYTES = 100 * 1024 * 1024;

export type SizeCheck = { ok: true; phoneWarning: boolean } | { ok: false; message: string };

export function totalBytes(files: readonly Blob[]): number {
  return files.reduce((sum, file) => sum + file.size, 0);
}

export function checkSize(total: number, likelyPhone: boolean): SizeCheck {
  if (total > MAX_TOTAL_BYTES) {
    return {
      ok: false,
      message: `Files must be ${formatBytes(MAX_TOTAL_BYTES)} or less in total (you selected ${formatBytes(total)}).`,
    };
  }
  return { ok: true, phoneWarning: likelyPhone && total > PHONE_WARN_BYTES };
}

/** Best guess that this device has little memory: Chromium's deviceMemory, else a small touch screen. */
export function isLikelyPhone(): boolean {
  if (typeof navigator === "undefined") return false;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (typeof memory === "number") return memory <= 4;
  return typeof matchMedia === "function" && matchMedia("(pointer: coarse) and (max-width: 820px)").matches;
}
```

`src/lib/pdf-files.ts`:

```ts
export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

/** Splits picked or dropped files into PDFs and others. Single mode keeps only the first PDF. */
export function pickPdfFiles(files: readonly File[], multiple: boolean): { accepted: File[]; rejectedCount: number } {
  const pdfs = files.filter(isPdfFile);
  return { accepted: multiple ? pdfs : pdfs.slice(0, 1), rejectedCount: files.length - pdfs.length };
}
```

`src/lib/page-ranges.ts`:

```ts
const RANGES = /^(\d+|z)(-(\d+|z))?(,(\d+|z)(-(\d+|z))?)*$/;

/** Turns loose input like " 1 - 3, 7, 5-Z " into qpdf page-range syntax, or null if invalid. */
export function normalizePageRanges(input: string): string | null {
  const compact = input.replace(/\s+/g, "").toLowerCase().replace(/,$/, "");
  if (!RANGES.test(compact)) return null;
  const hasPageZero = compact.split(/[,-]/).some((part) => part !== "z" && Number(part) === 0);
  return hasPageZero ? null : compact;
}
```

`src/lib/passwords.ts`:

```ts
/** Random owner password so the chosen permissions are enforced. Never shown to the user. */
export function generateOwnerPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function validateNewPassword(password: string, confirm: string): string | null {
  if (password === "") return "Password is required.";
  if (password !== confirm) return "Passwords don't match.";
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 6 files. If `limits` fails on the message, check `formatBytes(MAX_TOTAL_BYTES + 1)` is `"250 MB"` (it rounds).

- [ ] **Step 5: Lint, build, commit and push**

```bash
npm run lint && npm run build
git add src/lib
git commit -m "feat: pure helpers for filenames, sizes, limits, page ranges and passwords

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NvYC5VwsQMEVA9j9Scdfc1"
git push
```

---

### Task 3: qpdf core

**Files:**
- Create: `src/lib/qpdf.ts`, `src/test/make-pdf.ts`
- Test: `src/lib/qpdf.test.ts`, `src/lib/qpdf-load.test.ts`, `src/lib/qpdf.integration.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces (from `@/lib/qpdf`):
  - `getQpdf(): Promise<Qpdf>`
  - `class PasswordProtectedError extends Error { readonly fileName: string }`
  - `ensureNoOpenPassword(qpdf: Qpdf, file: File): Promise<PdfInfo>`
  - `class TruncatedOutputError extends Error`
  - `assertOutput(output: Uint8Array): void`
  - `logWarnings(warnings: string[]): void`
  - `type JobPhase = "load" | "run"`; `type ErrorDescription = { message: string; detail?: string; decryptFirst?: boolean }`
  - `describeQpdfError(error: unknown, phase: JobPhase, options?: { nameFiles?: boolean }): ErrorDescription`
  - `OUT_OF_MEMORY_MESSAGE: string`
- Produces (from `@/test/make-pdf`, tests only): `makePdf(pages: number, options?: { title?: string; size?: [number, number] }): Uint8Array<ArrayBuffer>`
- `Qpdf`, `PdfInfo`, `QpdfErrorCode` are types from `@mssio/qpdf-wasm`.

- [ ] **Step 1: Fixture builder**

`src/test/make-pdf.ts`:

```ts
/**
 * Builds a valid, uncompressed PDF in memory: `pages` Letter pages (or `size`), a correct xref table,
 * and an optional Info dictionary with Title, Author and CreationDate.
 */
export function makePdf(pages: number, options: { title?: string; size?: [number, number] } = {}): Uint8Array<ArrayBuffer> {
  const [width, height] = options.size ?? [612, 792];
  const objects: string[] = [];
  const add = (body: string) => objects.push(body);
  const catalog = add("");
  const pageTree = add("");
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const kids: number[] = [];
  for (let i = 1; i <= pages; i++) {
    const text = `BT /F1 24 Tf 72 700 Td (Page ${i}) Tj ET`;
    const content = add(`<< /Length ${text.length} >>\nstream\n${text}\nendstream`);
    kids.push(
      add(
        `<< /Type /Page /Parent ${pageTree} 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`,
      ),
    );
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pageTree} 0 R >>`;
  objects[pageTree - 1] = `<< /Type /Pages /Kids [${kids.map((kid) => `${kid} 0 R`).join(" ")}] /Count ${pages} >>`;
  const info = options.title
    ? add(`<< /Title (${options.title}) /Author (Test Author) /CreationDate (D:20260101120000Z) >>`)
    : 0;

  let out = "%PDF-1.7\n";
  const offsets = objects.map((body, index) => {
    const at = out.length;
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R${info ? ` /Info ${info} 0 R` : ""} >>\n`;
  out += `startxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}
```

- [ ] **Step 2: Write the failing unit tests**

`src/lib/qpdf.test.ts`:

```ts
import { QpdfError } from "@mssio/qpdf-wasm";
import { describe, expect, test } from "vitest";

import {
  assertOutput,
  describeQpdfError,
  OUT_OF_MEMORY_MESSAGE,
  PasswordProtectedError,
  TruncatedOutputError,
} from "@/lib/qpdf";

const pdfBytes = (length: number) => {
  const bytes = new Uint8Array(length);
  bytes.set(new TextEncoder().encode("%PDF-1.7\n"));
  return bytes;
};

describe("assertOutput", () => {
  test("accepts a PDF of at least 64 bytes", () => expect(() => assertOutput(pdfBytes(64))).not.toThrow());
  test("rejects empty output", () => expect(() => assertOutput(new Uint8Array())).toThrow(TruncatedOutputError));
  test("rejects tiny output", () => expect(() => assertOutput(pdfBytes(63))).toThrow(TruncatedOutputError));
  test("rejects output without a PDF header", () =>
    expect(() => assertOutput(new Uint8Array(100))).toThrow(TruncatedOutputError));
});

describe("describeQpdfError", () => {
  test("load phase", () => {
    expect(describeQpdfError(new Error("fetch failed"), "load")).toEqual({
      message: "Couldn't load the PDF engine. Check your connection and reload.",
    });
  });

  test("password-protected input, unnamed and named", () => {
    const error = new PasswordProtectedError("tax.pdf");
    expect(describeQpdfError(error, "run")).toEqual({
      message: "This PDF is password-protected. Remove its password with Decrypt first.",
      decryptFirst: true,
    });
    expect(describeQpdfError(error, "run", { nameFiles: true })).toEqual({
      message: "“tax.pdf” is password-protected. Remove its password with Decrypt first.",
      decryptFirst: true,
    });
  });

  test("wrong password in Decrypt", () => {
    expect(describeQpdfError(new QpdfError("INVALID_PASSWORD", "in.pdf: invalid password"), "run")).toEqual({
      message: "Incorrect password. Check it and try again.",
    });
  });

  test("not a PDF", () => {
    expect(describeQpdfError(new QpdfError("INVALID_PDF", "unable to find trailer"), "run")).toEqual({
      message: "This file isn't a readable PDF.",
    });
  });

  test.each(["std::bad_alloc", "Out of memory", "Aborted(OOM)", "qpdf crashed: RuntimeError"])(
    "out of memory: %s",
    (message) => {
      expect(describeQpdfError(new QpdfError("FAILED", message), "run")).toEqual({ message: OUT_OF_MEMORY_MESSAGE });
    },
  );

  test("truncated output is reported as out of memory", () => {
    expect(describeQpdfError(new TruncatedOutputError(), "run")).toEqual({ message: OUT_OF_MEMORY_MESSAGE });
  });

  test("anything else keeps qpdf's message as detail", () => {
    expect(describeQpdfError(new QpdfError("FAILED", "number 9 out of range"), "run")).toEqual({
      message: "Could not process this PDF.",
      detail: "number 9 out of range",
    });
    expect(describeQpdfError("boom", "run")).toEqual({ message: "Could not process this PDF.", detail: "boom" });
  });
});
```

`src/lib/qpdf-load.test.ts`:

```ts
import { expect, test, vi } from "vitest";

const { createQpdf } = vi.hoisted(() => ({ createQpdf: vi.fn() }));
vi.mock("@mssio/qpdf-wasm", () => ({ createQpdf }));

import { getQpdf } from "@/lib/qpdf";

test("getQpdf caches the instance and retries after a failed load", async () => {
  const instance = { terminate: vi.fn() };
  createQpdf.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(instance);

  await expect(getQpdf()).rejects.toThrow("offline");
  await expect(getQpdf()).resolves.toBe(instance);
  await expect(getQpdf()).resolves.toBe(instance);
  expect(createQpdf).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 3: Write the failing integration tests**

`src/lib/qpdf.integration.test.ts`:

```ts
import { createQpdf, type Qpdf } from "@mssio/qpdf-wasm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { assertOutput, describeQpdfError, ensureNoOpenPassword, PasswordProtectedError } from "@/lib/qpdf";
import { makePdf } from "@/test/make-pdf";

let qpdf: Qpdf;
beforeAll(async () => {
  qpdf = await createQpdf();
});
afterAll(() => qpdf.terminate());

const pdfFile = (bytes: Uint8Array<ArrayBuffer>, name = "test.pdf") => new File([bytes], name, { type: "application/pdf" });

async function passwordProtected(pages = 2) {
  return (await qpdf.encrypt(makePdf(pages), { userPassword: "open-me", ownerPassword: "owner-secret" })).output;
}

async function restrictionOnly(pages = 2) {
  return (await qpdf.encrypt(makePdf(pages), { userPassword: "", ownerPassword: "owner-secret", allow: { print: false } }))
    .output;
}

describe("decrypt", () => {
  test("right password removes encryption", async () => {
    const { output } = await qpdf.decrypt(pdfFile(await passwordProtected()), { password: "open-me" });
    assertOutput(output);
    expect((await qpdf.info(output.slice())).encrypted).toBe(false);
  });

  test("wrong password is described as incorrect", async () => {
    const error = await qpdf.decrypt(pdfFile(await passwordProtected()), { password: "nope" }).catch((e: unknown) => e);
    expect(describeQpdfError(error, "run").message).toBe("Incorrect password. Check it and try again.");
  });

  test("empty password removes owner-only restrictions", async () => {
    const { output } = await qpdf.decrypt(pdfFile(await restrictionOnly()), { password: "" });
    expect((await qpdf.info(output.slice())).encrypted).toBe(false);
  });

  test("retries with the same File after a wrong password", async () => {
    const file = pdfFile(await passwordProtected());
    await expect(qpdf.decrypt(file, { password: "nope" })).rejects.toMatchObject({ code: "INVALID_PASSWORD" });
    const { output } = await qpdf.decrypt(file, { password: "open-me" });
    expect((await qpdf.info(output.slice())).pageCount).toBe(2);
  });
});

describe("ensureNoOpenPassword", () => {
  test("rejects a PDF that needs a password to open", async () => {
    const error = await ensureNoOpenPassword(qpdf, pdfFile(await passwordProtected(), "tax.pdf")).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PasswordProtectedError);
    expect((error as PasswordProtectedError).fileName).toBe("tax.pdf");
  });

  test("accepts a restriction-only PDF and reports it as encrypted", async () => {
    const info = await ensureNoOpenPassword(qpdf, pdfFile(await restrictionOnly(3)));
    expect(info).toMatchObject({ encrypted: true, pageCount: 3 });
  });

  test("accepts a plain PDF", async () => {
    expect(await ensureNoOpenPassword(qpdf, pdfFile(makePdf(4)))).toMatchObject({ encrypted: false, pageCount: 4 });
  });

  test("passes through non-PDF errors", async () => {
    const error = await ensureNoOpenPassword(qpdf, pdfFile(new TextEncoder().encode("hello"))).catch((e: unknown) => e);
    expect(describeQpdfError(error, "run").message).toBe("This file isn't a readable PDF.");
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL in the three new files with `Failed to resolve import "@/lib/qpdf"`.

- [ ] **Step 5: Implement `src/lib/qpdf.ts`**

```ts
import type { PdfInfo, Qpdf, QpdfErrorCode } from "@mssio/qpdf-wasm";

let pending: Promise<Qpdf> | null = null;

/**
 * The app's single qpdf instance. The package and its wasm load on first use only;
 * a failed load is not cached, so the next call retries.
 */
export function getQpdf(): Promise<Qpdf> {
  pending ??= import("@mssio/qpdf-wasm")
    .then((module) => module.createQpdf())
    .catch((error: unknown) => {
      pending = null;
      throw error;
    });
  return pending;
}

/** Thrown when a tool other than Decrypt gets a PDF that needs a password to open. */
export class PasswordProtectedError extends Error {
  readonly fileName: string;

  constructor(fileName: string) {
    super(`${fileName} needs a password to open`);
    this.name = "PasswordProtectedError";
    this.fileName = fileName;
  }
}

/** qpdf "succeeded" but returned no usable PDF (seen when the wasm runs out of memory on large inputs). */
export class TruncatedOutputError extends Error {
  constructor() {
    super("qpdf returned an empty or truncated PDF");
    this.name = "TruncatedOutputError";
  }
}

function qpdfCode(error: unknown): QpdfErrorCode | null {
  if (error instanceof Error && "code" in error && typeof error.code === "string") {
    return error.code as QpdfErrorCode;
  }
  return null;
}

/**
 * Every tool except Decrypt calls this first. Rejects PDFs that need a password to open;
 * restriction-only PDFs (owner password only) pass. Returns qpdf's info for the file.
 */
export async function ensureNoOpenPassword(qpdf: Qpdf, file: File): Promise<PdfInfo> {
  try {
    return await qpdf.info(file);
  } catch (error) {
    if (qpdfCode(error) === "INVALID_PASSWORD") throw new PasswordProtectedError(file.name);
    throw error;
  }
}

const PDF_HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

/** Guards every download: qpdf output must be a real PDF, not an empty or truncated buffer. */
export function assertOutput(output: Uint8Array): void {
  if (output.length < 64 || PDF_HEADER.some((byte, index) => output[index] !== byte)) {
    throw new TruncatedOutputError();
  }
}

/** qpdf repairs are routine; keep them out of the UI but visible to developers. */
export function logWarnings(warnings: string[]): void {
  if (warnings.length > 0) console.warn("qpdf warnings:", warnings);
}

export type JobPhase = "load" | "run";
export type ErrorDescription = { message: string; detail?: string; decryptFirst?: boolean };

export const OUT_OF_MEMORY_MESSAGE =
  "Not enough memory to process this on this device. Try a smaller file or a computer.";
const OUT_OF_MEMORY = /bad_alloc|out of memory|aborted|qpdf crashed/i;

/** Maps anything a qpdf job threw to the message the user sees. */
export function describeQpdfError(
  error: unknown,
  phase: JobPhase,
  options: { nameFiles?: boolean } = {},
): ErrorDescription {
  if (phase === "load") return { message: "Couldn't load the PDF engine. Check your connection and reload." };
  if (error instanceof PasswordProtectedError) {
    const subject = options.nameFiles ? `“${error.fileName}”` : "This PDF";
    return { message: `${subject} is password-protected. Remove its password with Decrypt first.`, decryptFirst: true };
  }
  if (error instanceof TruncatedOutputError) return { message: OUT_OF_MEMORY_MESSAGE };
  const code = qpdfCode(error);
  if (code === "INVALID_PASSWORD") return { message: "Incorrect password. Check it and try again." };
  if (code === "INVALID_PDF") return { message: "This file isn't a readable PDF." };
  const detail = error instanceof Error ? error.message : String(error);
  if (OUT_OF_MEMORY.test(detail)) return { message: OUT_OF_MEMORY_MESSAGE };
  return { message: "Could not process this PDF.", detail };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (Task 2 files plus `qpdf.test.ts`, `qpdf-load.test.ts`, `qpdf.integration.test.ts`).
At the end of Task 9 the suite is 11 files / 109 tests (verified against a prototype assembled from this plan).

- [ ] **Step 7: Lint, build, commit and push**

```bash
npm run lint && npm run build
git add src/lib src/test
git commit -m "feat: qpdf access layer with password and output guards

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NvYC5VwsQMEVA9j9Scdfc1"
git push
```

---

### Task 4: Shared tool UI and Decrypt

**Files:**
- Create: `src/lib/use-qpdf-job.ts`, `src/lib/use-blob-url.ts`, `src/components/PdfFileDropzone.tsx`, `src/components/ToolPage.tsx`, `src/components/ResultCard.tsx`, `src/components/ErrorBox.tsx`, `src/components/SizeNotice.tsx`, `src/pages/DecryptPage.tsx`
- Modify: `src/tools.ts`

**Interfaces:**
- Consumes: `getQpdf`, `describeQpdfError`, `assertOutput`, `logWarnings`, `ErrorDescription` (Task 3); `pickPdfFiles`, `checkSize`, `isLikelyPhone`, `SizeCheck`, `outputFilename` (Task 2); UI primitives (Task 1).
- Produces:
  - `useQpdfJob(options?: { nameFiles?: boolean }): { busy: boolean; error: ErrorDescription | null; run<T>(job: (qpdf: Qpdf) => Promise<T>): Promise<T | null>; reset(): void; fail(message: string): void; clearError(): void }`. `run` resolves `null` on error or when `reset()`/unmount happened during the job.
  - `useBlobUrl(): { download: PdfDownload | null; show(bytes: Uint8Array<ArrayBuffer>, filename: string): void; clear(): void }` with `type PdfDownload = { url: string; filename: string }`
  - `<PdfFileDropzone id label? multiple? disabled? selectedName? onFiles={(files: File[]) => void} onInvalid={(message: string) => void} />`
  - `<ToolPage title intro cardTitle cardDescription?>{children}</ToolPage>`
  - `<ResultCard title description download?={{ url, filename, label }} anotherLabel onAnother>{children}</ResultCard>`
  - `<ErrorBox error={ErrorDescription} />`
  - `<SizeNotice check={SizeCheck} />`

- [ ] **Step 1: Hooks**

`src/lib/use-qpdf-job.ts`:

```ts
import type { Qpdf } from "@mssio/qpdf-wasm";
import { useCallback, useEffect, useRef, useState } from "react";

import { describeQpdfError, type ErrorDescription, getQpdf, type JobPhase } from "@/lib/qpdf";

/**
 * Busy and error state for one qpdf job at a time. Results that arrive after reset() or
 * unmount are dropped, so a slow job can't overwrite a newer screen.
 */
export function useQpdfJob({ nameFiles = false }: { nameFiles?: boolean } = {}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorDescription | null>(null);
  const generation = useRef(0);

  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );

  const run = useCallback(
    async <T>(job: (qpdf: Qpdf) => Promise<T>): Promise<T | null> => {
      const id = ++generation.current;
      setBusy(true);
      setError(null);
      let phase: JobPhase = "load";
      try {
        const qpdf = await getQpdf();
        phase = "run";
        const result = await job(qpdf);
        return id === generation.current ? result : null;
      } catch (caught) {
        if (id === generation.current) setError(describeQpdfError(caught, phase, { nameFiles }));
        return null;
      } finally {
        if (id === generation.current) setBusy(false);
      }
    },
    [nameFiles],
  );

  const reset = useCallback(() => {
    generation.current++;
    setBusy(false);
    setError(null);
  }, []);
  const fail = useCallback((message: string) => setError({ message }), []);
  const clearError = useCallback(() => setError(null), []);

  return { busy, error, run, reset, fail, clearError };
}
```

`src/lib/use-blob-url.ts`:

```ts
import { useCallback, useEffect, useState } from "react";

export type PdfDownload = { url: string; filename: string };

/** Owns one PDF blob URL; revokes it when replaced, cleared or on unmount. */
export function useBlobUrl() {
  const [download, setDownload] = useState<PdfDownload | null>(null);

  useEffect(() => {
    if (!download) return;
    return () => URL.revokeObjectURL(download.url);
  }, [download]);

  const show = useCallback((bytes: Uint8Array<ArrayBuffer>, filename: string) => {
    setDownload({ url: URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })), filename });
  }, []);
  const clear = useCallback(() => setDownload(null), []);

  return { download, show, clear };
}
```

- [ ] **Step 2: Shared components**

`src/components/ErrorBox.tsx`:

```tsx
import { Link } from "react-router";

import type { ErrorDescription } from "@/lib/qpdf";

export function ErrorBox({ error }: { error: ErrorDescription }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <p>{error.message}</p>
      {error.detail ? <p className="mt-1 text-xs break-words text-muted-foreground">{error.detail}</p> : null}
      {error.decryptFirst ? (
        <Link to="/decrypt" className="mt-1 inline-block font-medium underline underline-offset-4">
          Go to Decrypt
        </Link>
      ) : null}
    </div>
  );
}
```

`src/components/SizeNotice.tsx`:

```tsx
import { TriangleAlert } from "lucide-react";

import { ErrorBox } from "@/components/ErrorBox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { SizeCheck } from "@/lib/limits";

export function SizeNotice({ check }: { check: SizeCheck }) {
  if (!check.ok) return <ErrorBox error={{ message: check.message }} />;
  if (!check.phoneWarning) return null;
  return (
    <Alert className="border-amber-500/50 text-amber-800 dark:text-amber-300">
      <TriangleAlert />
      <AlertDescription className="text-current">
        Large files may fail on phones. If it doesn't work, try a computer.
      </AlertDescription>
    </Alert>
  );
}
```

`src/components/ToolPage.tsx`:

```tsx
import type { ReactNode } from "react";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ToolPageProps = {
  title: string;
  intro: ReactNode;
  cardTitle: string;
  cardDescription?: ReactNode;
  children: ReactNode;
};

export function ToolPage({ title, intro, cardTitle, cardDescription, children }: ToolPageProps) {
  return (
    <div className="mx-auto max-w-lg px-4 py-10 sm:px-6 sm:py-14">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-muted-foreground">{intro}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{cardTitle}</CardTitle>
          {cardDescription ? (
            <CardDescription className="flex items-start gap-2 pt-1">{cardDescription}</CardDescription>
          ) : null}
        </CardHeader>
        {children}
      </Card>
    </div>
  );
}
```

`src/components/ResultCard.tsx`:

```tsx
import { Download } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ResultCardProps = {
  title: string;
  description: ReactNode;
  download?: { url: string; filename: string; label: string };
  anotherLabel: string;
  onAnother: () => void;
  children?: ReactNode;
};

export function ResultCard({ title, description, download, anotherLabel, onAnother, children }: ResultCardProps) {
  return (
    <div className="mx-auto max-w-lg px-4 py-10 sm:px-6 sm:py-14">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {children}
          {download ? (
            <Button className="w-full" asChild>
              <a href={download.url} download={download.filename}>
                <Download className="size-4" />
                {download.label}
              </a>
            </Button>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
            <Button variant="outline" className="w-full sm:flex-1" asChild>
              <Link to="/">Back to home</Link>
            </Button>
            <Button type="button" variant="outline" className="w-full sm:flex-1" onClick={onAnother}>
              {anotherLabel}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

`src/components/PdfFileDropzone.tsx` (old look, now controlled):

```tsx
import { FileText, Upload } from "lucide-react";
import { useId, useRef, useState, type DragEvent } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pickPdfFiles } from "@/lib/pdf-files";
import { cn } from "@/lib/utils";

type PdfFileDropzoneProps = {
  id: string;
  label?: string;
  /** Accept several files per pick/drop; each batch is passed to onFiles. */
  multiple?: boolean;
  disabled?: boolean;
  /** Single mode: the chosen file's name, shown in the zone. */
  selectedName?: string | null;
  onFiles: (files: File[]) => void;
  onInvalid: (message: string) => void;
};

export function PdfFileDropzone({
  id,
  label = "PDF file",
  multiple = false,
  disabled,
  selectedName,
  onFiles,
  onInvalid,
}: PdfFileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const hintId = useId();

  function handle(files: File[]) {
    const { accepted, rejectedCount } = pickPdfFiles(files, multiple);
    if (accepted.length === 0) {
      onInvalid(rejectedCount > 0 ? "File must be a PDF." : "Choose a PDF file.");
      return;
    }
    onFiles(accepted);
    if (rejectedCount > 0) {
      onInvalid(`Skipped ${rejectedCount} ${rejectedCount === 1 ? "file that isn't a PDF" : "files that aren't PDFs"}.`);
    }
  }

  const openPicker = () => {
    if (!disabled) inputRef.current?.click();
  };

  const onDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    dragDepth.current += 1;
    setIsDragging(true);
  };

  const onDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setIsDragging(false);
    }
  };

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    e.dataTransfer.dropEffect = "copy";
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = 0;
    setIsDragging(false);
    if (disabled) return;
    handle(Array.from(e.dataTransfer.files));
  };

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-labelledby={id}
        aria-describedby={hintId}
        aria-disabled={disabled || undefined}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openPicker();
          }
        }}
        onClick={openPicker}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={cn(
          "relative flex min-h-[9.5rem] cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 py-6 text-center transition-[color,box-shadow,border-color,background-color]",
          "border-input bg-muted/20 outline-none hover:bg-muted/35 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          isDragging && "border-primary bg-primary/5 ring-[3px] ring-ring/50",
          disabled && "pointer-events-none cursor-not-allowed opacity-50",
        )}
      >
        <Input
          ref={inputRef}
          id={id}
          type="file"
          accept="application/pdf,.pdf"
          multiple={multiple}
          disabled={disabled}
          className="sr-only"
          onChange={(e) => {
            handle(Array.from(e.currentTarget.files ?? []));
            e.currentTarget.value = "";
          }}
        />
        {selectedName && !multiple ? (
          <>
            <FileText className="size-8 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium break-all">{selectedName}</p>
            <p id={hintId} className="text-xs text-muted-foreground">
              Drop another PDF or click to replace
            </p>
          </>
        ) : (
          <>
            <Upload className="size-8 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">{multiple ? "Drag and drop PDFs here" : "Drag and drop a PDF here"}</p>
            <p id={hintId} className="text-xs text-muted-foreground">
              {multiple ? "or click to browse; files are added to the list" : "or click to browse"}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Decrypt page**

`src/pages/DecryptPage.tsx`:

```tsx
import { Loader2, ShieldAlert } from "lucide-react";
import { useState, type FormEvent } from "react";

import { ErrorBox } from "@/components/ErrorBox";
import { PdfFileDropzone } from "@/components/PdfFileDropzone";
import { ResultCard } from "@/components/ResultCard";
import { SizeNotice } from "@/components/SizeNotice";
import { ToolPage } from "@/components/ToolPage";
import { Button } from "@/components/ui/button";
import { CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { outputFilename } from "@/lib/filename";
import { checkSize, isLikelyPhone } from "@/lib/limits";
import { assertOutput, logWarnings } from "@/lib/qpdf";
import { useBlobUrl } from "@/lib/use-blob-url";
import { useQpdfJob } from "@/lib/use-qpdf-job";

export function Component() {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [likelyPhone] = useState(isLikelyPhone);
  const job = useQpdfJob();
  const result = useBlobUrl();
  const sizeCheck = checkSize(file?.size ?? 0, likelyPhone);

  function chooseFile(files: File[]) {
    setFile(files[0] ?? null);
    job.clearError();
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file || file.size === 0) {
      job.fail("Choose a PDF file.");
      return;
    }
    if (!sizeCheck.ok) return;
    const output = await job.run(async (qpdf) => {
      const decrypted = await qpdf.decrypt(file, { password });
      assertOutput(decrypted.output);
      logWarnings(decrypted.warnings);
      return decrypted.output;
    });
    if (output) {
      result.show(output, outputFilename(file.name, "-d"));
      setPassword("");
    }
  }

  function decryptAnother() {
    result.clear();
    job.reset();
    setFile(null);
    setPassword("");
  }

  if (result.download) {
    return (
      <ResultCard
        title="Your PDF is ready"
        description="Decrypted in your browser. Download it now; the file isn't stored anywhere."
        download={{ ...result.download, label: "Download decrypted PDF" }}
        anotherLabel="Decrypt another file"
        onAnother={decryptAnother}
      />
    );
  }

  return (
    <ToolPage
      title="Decrypt PDF"
      intro={
        <>
          Upload an encrypted PDF and enter its password. Decryption runs entirely in your browser with{" "}
          <code className="rounded bg-muted px-1">qpdf</code> compiled to WebAssembly. Your file never leaves your
          device.
        </>
      }
      cardTitle="Decrypt"
      cardDescription={
        <>
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>Your file and password stay on this device. Nothing is uploaded.</span>
        </>
      }
    >
      <form onSubmit={onSubmit}>
        <CardContent className="flex flex-col gap-6">
          <PdfFileDropzone
            id="file"
            disabled={job.busy}
            selectedName={file?.name ?? null}
            onFiles={chooseFile}
            onInvalid={job.fail}
          />
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="off"
              disabled={job.busy}
              placeholder="Document open password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby="password-help"
            />
            <p id="password-help" className="text-xs text-muted-foreground">
              Leave empty if the PDF opens without a password but has restrictions.
            </p>
          </div>
          <SizeNotice check={sizeCheck} />
          {job.error ? <ErrorBox error={job.error} /> : null}
        </CardContent>
        <CardFooter className="pt-6">
          <Button type="submit" disabled={job.busy || !sizeCheck.ok} className="w-full sm:w-auto">
            {job.busy ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Decrypting…
              </>
            ) : (
              "Decrypt"
            )}
          </Button>
        </CardFooter>
      </form>
    </ToolPage>
  );
}
```

- [ ] **Step 4: Register the tool**

In `src/tools.ts`, change `import type { LucideIcon } from "lucide-react";` to `import { FileKey2, type LucideIcon } from "lucide-react";` and replace `export const tools: Tool[] = [];` with:

```ts
export const tools: Tool[] = [
  {
    id: "decrypt",
    path: "/decrypt",
    title: "Decrypt PDF",
    navLabel: "Decrypt",
    description: "Remove password protection from a PDF, right in your browser with qpdf.",
    icon: FileKey2,
    load: () => import("@/pages/DecryptPage"),
  },
];
```

- [ ] **Step 5: Automated checks**

Run: `npm run lint && npm test && npm run build`
Expected: all pass. The build output lists a `DecryptPage-*.js` chunk, a `worker-*.js` and `qpdf-*.wasm`.

- [ ] **Step 6: Manual check in the browser**

Create test files once (kept out of git; `.private/` is excluded via `.git/info/exclude` and ignored by ESLint):

```bash
mkdir -p .private/fixtures
cat > .private/fixtures/make.ts <<'EOF'
import { writeFileSync } from "node:fs";
import { createQpdf } from "@mssio/qpdf-wasm";
import { makePdf } from "../../src/test/make-pdf.ts";

const dir = new URL(".", import.meta.url);
const qpdf = await createQpdf();
writeFileSync(new URL("plain.pdf", dir), makePdf(5, { title: "Plain sample" }));
writeFileSync(new URL("protected.pdf", dir), (await qpdf.encrypt(makePdf(3), { userPassword: "open-me", ownerPassword: "owner" })).output);
writeFileSync(new URL("restricted.pdf", dir), (await qpdf.encrypt(makePdf(2), { userPassword: "", ownerPassword: "owner", allow: { print: false } })).output);
qpdf.terminate();
EOF
node .private/fixtures/make.ts   # Node 24 runs the TypeScript directly
ls .private/fixtures
```

Expected: `plain.pdf`, `protected.pdf`, `restricted.pdf` exist. Password for `protected.pdf` is `open-me`.

Then `npm run dev`, open http://localhost:5173/decrypt and check:
1. Header shows a "Decrypt" link (≥ 768 px wide); home shows the Decrypt card.
2. Drop `protected.pdf`, password `wrong` → "Incorrect password. Check it and try again."; then `open-me` → "Your PDF is ready"; download is named `protected-d.pdf` and opens without a password.
3. "Decrypt another file" returns to an empty form. Drop `restricted.pdf` with an empty password → succeeds.
4. Drop a `.txt` → "File must be a PDF.".
5. DevTools Network: loading `/` alone requests no `.wasm`; the first Decrypt click loads `qpdf-*.wasm` once.

- [ ] **Step 7: Commit and push**

```bash
git add src
git commit -m "feat: shared tool UI and client-side Decrypt

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NvYC5VwsQMEVA9j9Scdfc1"
git push
```

---

### Task 5: Encrypt

**Files:**
- Create: `src/pages/EncryptPage.tsx`
- Modify: `src/tools.ts`, `src/lib/qpdf.integration.test.ts`

**Interfaces:**
- Consumes: `ensureNoOpenPassword`, `assertOutput`, `logWarnings` (Task 3); `generateOwnerPassword`, `validateNewPassword`, `outputFilename`, `checkSize`, `isLikelyPhone` (Task 2); `useQpdfJob`, `useBlobUrl`, `ToolPage`, `ResultCard`, `ErrorBox`, `SizeNotice`, `PdfFileDropzone` (Task 4); `Checkbox` (Task 1).
- Produces: route `/encrypt`.

- [ ] **Step 1: Write the failing integration test**

Append to `src/lib/qpdf.integration.test.ts` (add `generateOwnerPassword` to the imports: `import { generateOwnerPassword } from "@/lib/passwords";`):

```ts
describe("encrypt", () => {
  test("protects with AES-256 and the chosen permissions", async () => {
    const { output } = await qpdf.encrypt(pdfFile(makePdf(2)), {
      userPassword: "new-pass",
      ownerPassword: generateOwnerPassword(),
      allow: { print: false, modify: true, extract: true, annotate: true },
    });
    assertOutput(output);
    await expect(qpdf.info(output.slice())).rejects.toMatchObject({ code: "INVALID_PASSWORD" });
    const json = await qpdf.run(["--password=new-pass", "--json", "--json-key=encrypt", "in.pdf"], {
      files: { "in.pdf": output.slice() },
    });
    const encrypt = JSON.parse(json.stdout).encrypt;
    expect(encrypt.parameters.method).toBe("AESv3");
    expect(encrypt.capabilities.printhigh).toBe(false);
    expect(encrypt.capabilities.extract).toBe(true);
  });

  test("re-protects a restriction-only PDF", async () => {
    const { output } = await qpdf.encrypt(pdfFile(await restrictionOnly()), {
      userPassword: "fresh",
      ownerPassword: generateOwnerPassword(),
    });
    expect((await qpdf.info(output.slice(), { password: "fresh" })).encrypted).toBe(true);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/lib/qpdf.integration.test.ts`
Expected: PASS (this pins package behavior the page relies on; the page itself is verified manually). If it fails, stop and report: the package API differs from the spec.

- [ ] **Step 3: Encrypt page**

`src/pages/EncryptPage.tsx`:

```tsx
import { Loader2, Lock } from "lucide-react";
import { useState, type FormEvent } from "react";

import { ErrorBox } from "@/components/ErrorBox";
import { PdfFileDropzone } from "@/components/PdfFileDropzone";
import { ResultCard } from "@/components/ResultCard";
import { SizeNotice } from "@/components/SizeNotice";
import { ToolPage } from "@/components/ToolPage";
import { Button } from "@/components/ui/button";
import { CardContent, CardFooter } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { outputFilename } from "@/lib/filename";
import { checkSize, isLikelyPhone } from "@/lib/limits";
import { generateOwnerPassword, validateNewPassword } from "@/lib/passwords";
import { assertOutput, ensureNoOpenPassword, logWarnings } from "@/lib/qpdf";
import { useBlobUrl } from "@/lib/use-blob-url";
import { useQpdfJob } from "@/lib/use-qpdf-job";

type Permission = "print" | "modify" | "extract" | "annotate";

const PERMISSIONS: { key: Permission; label: string }[] = [
  { key: "print", label: "Allow printing" },
  { key: "modify", label: "Allow editing" },
  { key: "extract", label: "Allow copying text and images" },
  { key: "annotate", label: "Allow comments and form filling" },
];

const ALL_ALLOWED: Record<Permission, boolean> = { print: true, modify: true, extract: true, annotate: true };

export function Component() {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [allow, setAllow] = useState(ALL_ALLOWED);
  const [likelyPhone] = useState(isLikelyPhone);
  const job = useQpdfJob();
  const result = useBlobUrl();
  const sizeCheck = checkSize(file?.size ?? 0, likelyPhone);

  function chooseFile(files: File[]) {
    setFile(files[0] ?? null);
    job.clearError();
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file || file.size === 0) {
      job.fail("Choose a PDF file.");
      return;
    }
    const invalid = validateNewPassword(password, confirm);
    if (invalid) {
      job.fail(invalid);
      return;
    }
    if (!sizeCheck.ok) return;
    const output = await job.run(async (qpdf) => {
      await ensureNoOpenPassword(qpdf, file);
      const encrypted = await qpdf.encrypt(file, {
        userPassword: password,
        ownerPassword: generateOwnerPassword(),
        allow,
      });
      assertOutput(encrypted.output);
      logWarnings(encrypted.warnings);
      return encrypted.output;
    });
    if (output) {
      result.show(output, outputFilename(file.name, "-protected"));
      setPassword("");
      setConfirm("");
    }
  }

  function protectAnother() {
    result.clear();
    job.reset();
    setFile(null);
    setPassword("");
    setConfirm("");
    setAllow(ALL_ALLOWED);
  }

  if (result.download) {
    return (
      <ResultCard
        title="Your PDF is protected"
        description="Encrypted with AES-256 in your browser. Anyone opening it will need the password."
        download={{ ...result.download, label: "Download protected PDF" }}
        anotherLabel="Protect another file"
        onAnother={protectAnother}
      />
    );
  }

  return (
    <ToolPage
      title="Encrypt PDF"
      intro="Add a password and choose what people can do with the PDF. Encryption runs entirely in your browser."
      cardTitle="Encrypt"
      cardDescription={
        <>
          <Lock className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>Your file and password stay on this device. Nothing is uploaded.</span>
        </>
      }
    >
      <form onSubmit={onSubmit}>
        <CardContent className="flex flex-col gap-6">
          <PdfFileDropzone
            id="file"
            disabled={job.busy}
            selectedName={file?.name ?? null}
            onFiles={chooseFile}
            onInvalid={job.fail}
          />
          <div className="grid gap-2">
            <Label htmlFor="password">Password to open</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              disabled={job.busy}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              disabled={job.busy}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <fieldset className="grid gap-3" disabled={job.busy}>
            <legend className="mb-2 text-sm font-medium">Permissions</legend>
            {PERMISSIONS.map((permission) => (
              <div key={permission.key} className="flex items-center gap-2">
                <Checkbox
                  id={`allow-${permission.key}`}
                  checked={allow[permission.key]}
                  onCheckedChange={(checked) => setAllow((current) => ({ ...current, [permission.key]: checked === true }))}
                />
                <Label htmlFor={`allow-${permission.key}`} className="font-normal">
                  {permission.label}
                </Label>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">Permissions can't be changed later without the original file.</p>
          </fieldset>
          <SizeNotice check={sizeCheck} />
          {job.error ? <ErrorBox error={job.error} /> : null}
        </CardContent>
        <CardFooter className="pt-6">
          <Button type="submit" disabled={job.busy || !sizeCheck.ok} className="w-full sm:w-auto">
            {job.busy ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Encrypting…
              </>
            ) : (
              "Encrypt"
            )}
          </Button>
        </CardFooter>
      </form>
    </ToolPage>
  );
}
```

- [ ] **Step 4: Register the tool**

In `src/tools.ts` add `FileLock2` to the `lucide-react` import and append after the decrypt entry:

```ts
  {
    id: "encrypt",
    path: "/encrypt",
    title: "Encrypt PDF",
    navLabel: "Encrypt",
    description: "Add a password and choose permissions for printing, editing and copying.",
    icon: FileLock2,
    load: () => import("@/pages/EncryptPage"),
  },
```

- [ ] **Step 5: Verify**

Run: `npm run lint && npm test && npm run build`. Then in `npm run dev` at `/encrypt`:
1. `plain.pdf`, password `a`/`b` → "Passwords don't match."; empty → "Password is required.".
2. `plain.pdf`, `secret`/`secret`, untick printing → download `plain-protected.pdf`; it asks for `secret` in a PDF viewer and printing is disabled.
3. `protected.pdf` → "This PDF is password-protected. Remove its password with Decrypt first." with a working "Go to Decrypt" link.
4. `restricted.pdf` → succeeds.

- [ ] **Step 6: Commit and push**

```bash
git add src
git commit -m "feat: Encrypt tool with permissions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NvYC5VwsQMEVA9j9Scdfc1"
git push
```

---

### Task 6: Merge

**Files:**
- Create: `src/lib/merge-list.ts`, `src/pages/MergePage.tsx`
- Test: `src/lib/merge-list.test.ts`; modify `src/lib/qpdf.integration.test.ts`
- Modify: `src/tools.ts`

**Interfaces:**
- Consumes: Tasks 2–4 as in Task 5, plus `formatBytes`, `totalBytes`.
- Produces:
  - `type MergeItem = { id: string; file: File }`
  - `type MergeAction = { type: "add"; items: MergeItem[] } | { type: "move"; id: string; offset: -1 | 1 } | { type: "remove"; id: string } | { type: "clear" }`
  - `mergeListReducer(state: MergeItem[], action: MergeAction): MergeItem[]`
  - `toMergeItems(files: File[], makeId?: () => string): MergeItem[]`
  - route `/merge`

- [ ] **Step 1: Write the failing reducer tests**

`src/lib/merge-list.test.ts`:

```ts
import { describe, expect, test } from "vitest";

import { mergeListReducer, toMergeItems, type MergeItem } from "@/lib/merge-list";

const file = (name: string) => new File(["x"], name, { type: "application/pdf" });
let counter = 0;
const nextId = () => `id-${++counter}`;
const names = (items: MergeItem[]) => items.map((item) => item.file.name);

describe("mergeListReducer", () => {
  const a = file("a.pdf");
  const b = file("b.pdf");
  const c = file("c.pdf");
  const start = toMergeItems([a, b, c], nextId);

  test("add appends in order", () => {
    const d = toMergeItems([file("d.pdf")], nextId);
    expect(names(mergeListReducer(start, { type: "add", items: d }))).toEqual(["a.pdf", "b.pdf", "c.pdf", "d.pdf"]);
  });

  test("the same file added twice gets two distinct entries", () => {
    const twice = mergeListReducer([], { type: "add", items: toMergeItems([a, a], nextId) });
    expect(twice).toHaveLength(2);
    expect(twice[0].id).not.toBe(twice[1].id);
    const removedOne = mergeListReducer(twice, { type: "remove", id: twice[0].id });
    expect(removedOne).toEqual([twice[1]]);
  });

  test("move up and down", () => {
    expect(names(mergeListReducer(start, { type: "move", id: start[2].id, offset: -1 }))).toEqual([
      "a.pdf",
      "c.pdf",
      "b.pdf",
    ]);
    expect(names(mergeListReducer(start, { type: "move", id: start[0].id, offset: 1 }))).toEqual([
      "b.pdf",
      "a.pdf",
      "c.pdf",
    ]);
  });

  test("moving past either end changes nothing", () => {
    expect(mergeListReducer(start, { type: "move", id: start[0].id, offset: -1 })).toBe(start);
    expect(mergeListReducer(start, { type: "move", id: start[2].id, offset: 1 })).toBe(start);
  });

  test("remove, unknown ids and clear", () => {
    expect(names(mergeListReducer(start, { type: "remove", id: start[1].id }))).toEqual(["a.pdf", "c.pdf"]);
    expect(mergeListReducer(start, { type: "remove", id: "missing" })).toEqual(start);
    expect(mergeListReducer(start, { type: "move", id: "missing", offset: 1 })).toBe(start);
    expect(mergeListReducer(start, { type: "clear" })).toEqual([]);
  });

  test("remove then add the same file again puts it at the end", () => {
    const removed = mergeListReducer(start, { type: "remove", id: start[0].id });
    const readded = mergeListReducer(removed, { type: "add", items: toMergeItems([a], nextId) });
    expect(names(readded)).toEqual(["b.pdf", "c.pdf", "a.pdf"]);
  });
});
```

Append to `src/lib/qpdf.integration.test.ts`:

```ts
describe("merge", () => {
  test("3 + 2 pages make 5, and the output is not encrypted even from a restricted input", async () => {
    const { output } = await qpdf.merge([pdfFile(await restrictionOnly(3)), pdfFile(makePdf(2))]);
    assertOutput(output);
    expect(await qpdf.info(output.slice())).toMatchObject({ pageCount: 5, encrypted: false });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL, `Failed to resolve import "@/lib/merge-list"` (the merge integration test passes).

- [ ] **Step 3: Implement the reducer**

`src/lib/merge-list.ts`:

```ts
export type MergeItem = { id: string; file: File };

export type MergeAction =
  | { type: "add"; items: MergeItem[] }
  | { type: "move"; id: string; offset: -1 | 1 }
  | { type: "remove"; id: string }
  | { type: "clear" };

export function toMergeItems(files: File[], makeId: () => string = () => crypto.randomUUID()): MergeItem[] {
  return files.map((file) => ({ id: makeId(), file }));
}

/** The Merge tool's file list. Moves past either end return the same array. */
export function mergeListReducer(state: MergeItem[], action: MergeAction): MergeItem[] {
  switch (action.type) {
    case "add":
      return [...state, ...action.items];
    case "remove":
      return state.filter((item) => item.id !== action.id);
    case "move": {
      const from = state.findIndex((item) => item.id === action.id);
      const to = from + action.offset;
      if (from < 0 || to < 0 || to >= state.length) return state;
      const next = [...state];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    }
    case "clear":
      return [];
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Merge page**

`src/pages/MergePage.tsx`:

```tsx
import { ArrowDown, ArrowUp, FileText, Info, Loader2, X } from "lucide-react";
import { useReducer, useState, type FormEvent } from "react";

import { ErrorBox } from "@/components/ErrorBox";
import { PdfFileDropzone } from "@/components/PdfFileDropzone";
import { ResultCard } from "@/components/ResultCard";
import { SizeNotice } from "@/components/SizeNotice";
import { ToolPage } from "@/components/ToolPage";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CardContent, CardFooter } from "@/components/ui/card";
import { formatBytes } from "@/lib/format";
import { checkSize, isLikelyPhone, totalBytes } from "@/lib/limits";
import { mergeListReducer, toMergeItems } from "@/lib/merge-list";
import { assertOutput, ensureNoOpenPassword, logWarnings } from "@/lib/qpdf";
import { useBlobUrl } from "@/lib/use-blob-url";
import { useQpdfJob } from "@/lib/use-qpdf-job";

type MergeSummary = { files: number; pages: number; droppedRestrictions: boolean };

export function Component() {
  const [items, dispatch] = useReducer(mergeListReducer, []);
  const [summary, setSummary] = useState<MergeSummary | null>(null);
  const [likelyPhone] = useState(isLikelyPhone);
  const job = useQpdfJob({ nameFiles: true });
  const result = useBlobUrl();
  const total = totalBytes(items.map((item) => item.file));
  const sizeCheck = checkSize(total, likelyPhone);

  function addFiles(files: File[]) {
    dispatch({ type: "add", items: toMergeItems(files) });
    job.clearError();
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (items.length < 2 || !sizeCheck.ok) return;
    const files = items.map((item) => item.file);
    const merged = await job.run(async (qpdf) => {
      let droppedRestrictions = false;
      for (const file of files) {
        if ((await ensureNoOpenPassword(qpdf, file)).encrypted) droppedRestrictions = true;
      }
      const { output, warnings } = await qpdf.merge(files);
      assertOutput(output);
      logWarnings(warnings);
      const { pageCount } = await qpdf.info(output.slice());
      return { output, summary: { files: files.length, pages: pageCount, droppedRestrictions } };
    });
    if (merged) {
      result.show(merged.output, "merged.pdf");
      setSummary(merged.summary);
    }
  }

  function mergeOthers() {
    result.clear();
    job.reset();
    setSummary(null);
    dispatch({ type: "clear" });
  }

  if (result.download && summary) {
    return (
      <ResultCard
        title="Your PDFs are merged"
        description={`${summary.files} files, ${summary.pages} pages.`}
        download={{ ...result.download, label: "Download merged PDF" }}
        anotherLabel="Merge other files"
        onAnother={mergeOthers}
      >
        {summary.droppedRestrictions ? (
          <Alert>
            <Info />
            <AlertDescription>Restrictions from the original files aren't kept in the merged PDF.</AlertDescription>
          </Alert>
        ) : null}
      </ResultCard>
    );
  }

  return (
    <ToolPage
      title="Merge PDFs"
      intro="Combine several PDFs into one, in the order you choose. Merging runs entirely in your browser."
      cardTitle="Merge"
      cardDescription="Add at least two PDFs, then put them in order."
    >
      <form onSubmit={onSubmit}>
        <CardContent className="flex flex-col gap-6">
          <PdfFileDropzone id="files" label="PDF files" multiple disabled={job.busy} onFiles={addFiles} onInvalid={job.fail} />
          {items.length > 0 ? (
            <div className="grid gap-2">
              <ol className="grid gap-2">
                {items.map((item, index) => (
                  <li key={item.id} className="flex items-center gap-3 rounded-md border bg-muted/20 px-3 py-2">
                    <span className="w-5 text-right text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                    <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.file.name}</p>
                      <p className="text-xs text-muted-foreground">{formatBytes(item.file.size)}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Move ${item.file.name} up`}
                      disabled={job.busy || index === 0}
                      onClick={() => dispatch({ type: "move", id: item.id, offset: -1 })}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Move ${item.file.name} down`}
                      disabled={job.busy || index === items.length - 1}
                      onClick={() => dispatch({ type: "move", id: item.id, offset: 1 })}
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${item.file.name}`}
                      disabled={job.busy}
                      onClick={() => dispatch({ type: "remove", id: item.id })}
                    >
                      <X />
                    </Button>
                  </li>
                ))}
              </ol>
              <p className="text-xs text-muted-foreground">
                {items.length} {items.length === 1 ? "file" : "files"} · {formatBytes(total)}
              </p>
            </div>
          ) : null}
          <SizeNotice check={sizeCheck} />
          {job.error ? <ErrorBox error={job.error} /> : null}
        </CardContent>
        <CardFooter className="pt-6">
          <Button type="submit" disabled={job.busy || items.length < 2 || !sizeCheck.ok} className="w-full sm:w-auto">
            {job.busy ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Merging…
              </>
            ) : (
              "Merge"
            )}
          </Button>
        </CardFooter>
      </form>
    </ToolPage>
  );
}
```

- [ ] **Step 6: Register the tool**

In `src/tools.ts` add `Combine` to the `lucide-react` import and append after encrypt:

```ts
  {
    id: "merge",
    path: "/merge",
    title: "Merge PDFs",
    navLabel: "Merge",
    description: "Combine several PDFs into one file, in the order you choose.",
    icon: Combine,
    load: () => import("@/pages/MergePage"),
  },
```

- [ ] **Step 7: Verify**

Run: `npm run lint && npm test && npm run build`. Then at `/merge`:
1. Drop `plain.pdf` and `restricted.pdf` in two batches → two rows; Merge enabled; move the second up; remove/re-add works; the up button is disabled on row 1 and down on the last row.
2. Merge → "2 files, 7 pages." plus the restrictions note; `merged.pdf` has 7 pages in the chosen order.
3. Add `protected.pdf` → "“protected.pdf” is password-protected. Remove its password with Decrypt first." with the Decrypt link.
4. Keyboard only: Tab reaches the drop zone (Enter opens the picker) and every row button.

- [ ] **Step 8: Commit and push**

```bash
git add src
git commit -m "feat: Merge tool with reorderable file list

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NvYC5VwsQMEVA9j9Scdfc1"
git push
```

---

### Task 7: Extract pages

**Files:**
- Create: `src/pages/ExtractPage.tsx`
- Modify: `src/tools.ts`, `src/lib/qpdf.integration.test.ts`

**Interfaces:**
- Consumes: `normalizePageRanges`, `outputFilename`, `checkSize`, `isLikelyPhone` (Task 2); `ensureNoOpenPassword`, `assertOutput`, `logWarnings`, `describeQpdfError` (Task 3); Task 4 components and hooks.
- Produces: route `/extract`.

- [ ] **Step 1: Integration test**

Append to `src/lib/qpdf.integration.test.ts`:

```ts
describe("selectPages", () => {
  test("1,4-z of 5 pages gives 3 pages", async () => {
    const { output } = await qpdf.selectPages(pdfFile(makePdf(5)), "1,4-z");
    assertOutput(output);
    expect((await qpdf.info(output.slice())).pageCount).toBe(3);
  });

  test("keeps owner restrictions", async () => {
    const { output } = await qpdf.selectPages(pdfFile(await restrictionOnly(3)), "1");
    expect((await qpdf.info(output.slice())).encrypted).toBe(true);
  });

  test("out-of-range pages show qpdf's reason as detail", async () => {
    const error = await qpdf.selectPages(pdfFile(makePdf(5)), "9").catch((e: unknown) => e);
    const described = describeQpdfError(error, "run");
    expect(described.message).toBe("Could not process this PDF.");
    expect(described.detail).toContain("out of range");
  });
});
```

Run: `npx vitest run src/lib/qpdf.integration.test.ts` → PASS.

- [ ] **Step 2: Extract page**

`src/pages/ExtractPage.tsx`:

```tsx
import { Loader2, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";

import { ErrorBox } from "@/components/ErrorBox";
import { PdfFileDropzone } from "@/components/PdfFileDropzone";
import { ResultCard } from "@/components/ResultCard";
import { SizeNotice } from "@/components/SizeNotice";
import { ToolPage } from "@/components/ToolPage";
import { Button } from "@/components/ui/button";
import { CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { outputFilename } from "@/lib/filename";
import { checkSize, isLikelyPhone } from "@/lib/limits";
import { normalizePageRanges } from "@/lib/page-ranges";
import { assertOutput, ensureNoOpenPassword, logWarnings } from "@/lib/qpdf";
import { useBlobUrl } from "@/lib/use-blob-url";
import { useQpdfJob } from "@/lib/use-qpdf-job";

export function Component() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [ranges, setRanges] = useState("");
  const [extractedPages, setExtractedPages] = useState(0);
  const [likelyPhone] = useState(isLikelyPhone);
  const job = useQpdfJob();
  const result = useBlobUrl();
  const sizeCheck = checkSize(file?.size ?? 0, likelyPhone);

  async function chooseFile(files: File[]) {
    const chosen = files[0] ?? null;
    setFile(chosen);
    setPageCount(null);
    if (!chosen) return;
    if (!checkSize(chosen.size, likelyPhone).ok) {
      job.clearError();
      return;
    }
    const info = await job.run((qpdf) => ensureNoOpenPassword(qpdf, chosen));
    if (info) setPageCount(info.pageCount);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file || pageCount === null || !sizeCheck.ok) return;
    const normalized = normalizePageRanges(ranges);
    if (!normalized) {
      job.fail("Enter pages like 1-3,7 or 5-z.");
      return;
    }
    const extracted = await job.run(async (qpdf) => {
      const { output, warnings } = await qpdf.selectPages(file, normalized);
      assertOutput(output);
      logWarnings(warnings);
      return { output, pages: (await qpdf.info(output.slice())).pageCount };
    });
    if (extracted) {
      result.show(extracted.output, outputFilename(file.name, "-pages"));
      setExtractedPages(extracted.pages);
    }
  }

  function extractAnother() {
    result.clear();
    job.reset();
    setFile(null);
    setPageCount(null);
    setRanges("");
  }

  if (result.download) {
    return (
      <ResultCard
        title="Pages extracted"
        description={`Extracted ${extractedPages} ${extractedPages === 1 ? "page" : "pages"} in your browser.`}
        download={{ ...result.download, label: "Download extracted pages" }}
        anotherLabel="Extract from another file"
        onAnother={extractAnother}
      />
    );
  }

  return (
    <ToolPage
      title="Extract pages"
      intro="Pick the pages you need and save them as a new PDF. Everything runs in your browser."
      cardTitle="Extract"
      cardDescription={
        <>
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>Your file stays on this device. Nothing is uploaded.</span>
        </>
      }
    >
      <form onSubmit={onSubmit}>
        <CardContent className="flex flex-col gap-6">
          <PdfFileDropzone
            id="file"
            disabled={job.busy}
            selectedName={file?.name ?? null}
            onFiles={(files) => void chooseFile(files)}
            onInvalid={job.fail}
          />
          {pageCount !== null ? (
            <p className="text-sm text-muted-foreground">
              This PDF has {pageCount} {pageCount === 1 ? "page" : "pages"}.
            </p>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="pages">Pages</Label>
            <Input
              id="pages"
              placeholder="1-3,7"
              autoComplete="off"
              disabled={job.busy}
              value={ranges}
              onChange={(e) => setRanges(e.target.value)}
              aria-describedby="pages-help"
            />
            <p id="pages-help" className="text-xs text-muted-foreground">
              Examples: <code className="rounded bg-muted px-1">1-3</code>,{" "}
              <code className="rounded bg-muted px-1">1,4,7</code>, <code className="rounded bg-muted px-1">5-z</code>{" "}
              (z = last page).
            </p>
          </div>
          <SizeNotice check={sizeCheck} />
          {job.error ? <ErrorBox error={job.error} /> : null}
        </CardContent>
        <CardFooter className="pt-6">
          <Button
            type="submit"
            disabled={job.busy || pageCount === null || !sizeCheck.ok}
            className="w-full sm:w-auto"
          >
            {job.busy ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Working…
              </>
            ) : (
              "Extract"
            )}
          </Button>
        </CardFooter>
      </form>
    </ToolPage>
  );
}
```

- [ ] **Step 3: Register the tool**

In `src/tools.ts` add `FileOutput` to the `lucide-react` import and append after merge:

```ts
  {
    id: "extract",
    path: "/extract",
    title: "Extract pages",
    navLabel: "Extract",
    description: "Save selected pages, like 1-3 or 5 to the end, as a new PDF.",
    icon: FileOutput,
    load: () => import("@/pages/ExtractPage"),
  },
```

- [ ] **Step 4: Verify**

Run: `npm run lint && npm test && npm run build`. Then at `/extract`:
1. `plain.pdf` → "This PDF has 5 pages."; Extract is disabled until then.
2. Pages ` 1 - 2 , Z ` → download `plain-pages.pdf` with 3 pages; result says "Extracted 3 pages in your browser."
3. Pages `abc` → "Enter pages like 1-3,7 or 5-z."; pages `9` → "Could not process this PDF." with "number 9 out of range" detail.
4. `protected.pdf` → password-protected error with Decrypt link, Extract stays disabled.

- [ ] **Step 5: Commit and push**

```bash
git add src
git commit -m "feat: Extract pages tool

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NvYC5VwsQMEVA9j9Scdfc1"
git push
```

---

### Task 8: Compress

**Files:**
- Create: `src/pages/CompressPage.tsx`
- Modify: `src/tools.ts`, `src/lib/qpdf.integration.test.ts`

**Interfaces:**
- Consumes: `formatBytes`, `sizeChange`, `outputFilename`, `checkSize`, `isLikelyPhone` (Task 2); `ensureNoOpenPassword`, `assertOutput`, `logWarnings` (Task 3); Task 4 components and hooks; `Alert` (Task 1).
- Produces: route `/compress`.

- [ ] **Step 1: Integration test**

Append to `src/lib/qpdf.integration.test.ts`:

```ts
describe("compress", () => {
  test("returns a smaller valid PDF for a repetitive document", async () => {
    const input = makePdf(200);
    const { output } = await qpdf.compress(pdfFile(input));
    assertOutput(output);
    expect(output.length).toBeLessThan(input.length);
    expect((await qpdf.info(output.slice())).pageCount).toBe(200);
  });

  test("keeps owner restrictions", async () => {
    const { output } = await qpdf.compress(pdfFile(await restrictionOnly()));
    expect((await qpdf.info(output.slice())).encrypted).toBe(true);
  });
});
```

Run: `npx vitest run src/lib/qpdf.integration.test.ts` → PASS.

- [ ] **Step 2: Compress page**

`src/pages/CompressPage.tsx`:

```tsx
import { Info, Loader2, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";

import { ErrorBox } from "@/components/ErrorBox";
import { PdfFileDropzone } from "@/components/PdfFileDropzone";
import { ResultCard } from "@/components/ResultCard";
import { SizeNotice } from "@/components/SizeNotice";
import { ToolPage } from "@/components/ToolPage";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CardContent, CardFooter } from "@/components/ui/card";
import { outputFilename } from "@/lib/filename";
import { formatBytes, sizeChange } from "@/lib/format";
import { checkSize, isLikelyPhone } from "@/lib/limits";
import { assertOutput, ensureNoOpenPassword, logWarnings } from "@/lib/qpdf";
import { useBlobUrl } from "@/lib/use-blob-url";
import { useQpdfJob } from "@/lib/use-qpdf-job";

type CompressSummary = { before: number; after: number; percent: number; smaller: boolean };

export function Component() {
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<CompressSummary | null>(null);
  const [likelyPhone] = useState(isLikelyPhone);
  const job = useQpdfJob();
  const result = useBlobUrl();
  const sizeCheck = checkSize(file?.size ?? 0, likelyPhone);

  function chooseFile(files: File[]) {
    setFile(files[0] ?? null);
    job.clearError();
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file || file.size === 0) {
      job.fail("Choose a PDF file.");
      return;
    }
    if (!sizeCheck.ok) return;
    const output = await job.run(async (qpdf) => {
      await ensureNoOpenPassword(qpdf, file);
      const compressed = await qpdf.compress(file);
      assertOutput(compressed.output);
      logWarnings(compressed.warnings);
      return compressed.output;
    });
    if (!output) return;
    const change = sizeChange(file.size, output.length);
    if (change.smaller) result.show(output, outputFilename(file.name, "-compressed"));
    setSummary({ before: file.size, after: output.length, ...change });
  }

  function compressAnother() {
    result.clear();
    job.reset();
    setFile(null);
    setSummary(null);
  }

  if (summary) {
    return summary.smaller && result.download ? (
      <ResultCard
        title="Your PDF is smaller"
        description={`${formatBytes(summary.before)} → ${formatBytes(summary.after)} (−${summary.percent}%)`}
        download={{ ...result.download, label: "Download compressed PDF" }}
        anotherLabel="Compress another file"
        onAnother={compressAnother}
      />
    ) : (
      <ResultCard
        title="No smaller version"
        description={`${formatBytes(summary.before)} → ${formatBytes(summary.after)}`}
        anotherLabel="Compress another file"
        onAnother={compressAnother}
      >
        <Alert>
          <Info />
          <AlertDescription>
            This PDF is already as small as qpdf can make it. qpdf compresses the PDF's structure but doesn't shrink
            images.
          </AlertDescription>
        </Alert>
      </ResultCard>
    );
  }

  return (
    <ToolPage
      title="Compress PDF"
      intro="Repacks and recompresses the PDF's internal data. Works best on text-heavy PDFs; scanned or photo-heavy files shrink little."
      cardTitle="Compress"
      cardDescription={
        <>
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>Your file stays on this device. Nothing is uploaded.</span>
        </>
      }
    >
      <form onSubmit={onSubmit}>
        <CardContent className="flex flex-col gap-6">
          <PdfFileDropzone
            id="file"
            disabled={job.busy}
            selectedName={file?.name ?? null}
            onFiles={chooseFile}
            onInvalid={job.fail}
          />
          <SizeNotice check={sizeCheck} />
          {job.error ? <ErrorBox error={job.error} /> : null}
        </CardContent>
        <CardFooter className="pt-6">
          <Button type="submit" disabled={job.busy || !sizeCheck.ok} className="w-full sm:w-auto">
            {job.busy ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Compressing…
              </>
            ) : (
              "Compress"
            )}
          </Button>
        </CardFooter>
      </form>
    </ToolPage>
  );
}
```

- [ ] **Step 3: Register the tool**

In `src/tools.ts` add `Shrink` to the `lucide-react` import and append after extract:

```ts
  {
    id: "compress",
    path: "/compress",
    title: "Compress PDF",
    navLabel: "Compress",
    description: "Repack a PDF's internal data to make it smaller. Best for text-heavy files.",
    icon: Shrink,
    load: () => import("@/pages/CompressPage"),
  },
```

- [ ] **Step 4: Verify**

Run: `npm run lint && npm test && npm run build`. Then at `/compress`:
1. `plain.pdf` → "Your PDF is smaller" with sizes and percent; `plain-compressed.pdf` opens.
2. Compress the downloaded `plain-compressed.pdf` again → "No smaller version" with the qpdf note and no download button.
3. `protected.pdf` → password-protected error with Decrypt link.

- [ ] **Step 5: Commit and push**

```bash
git add src
git commit -m "feat: Compress tool with before/after sizes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NvYC5VwsQMEVA9j9Scdfc1"
git push
```

---

### Task 9: Info

**Files:**
- Create: `src/lib/pdf-info.ts`, `src/pages/InfoPage.tsx`
- Test: `src/lib/pdf-info.test.ts`; modify `src/lib/qpdf.integration.test.ts`
- Modify: `src/tools.ts`

**Interfaces:**
- Consumes: `parsePdfDate`, `formatBytes`, `checkSize`, `isLikelyPhone` (Task 2); `ensureNoOpenPassword` (Task 3); Task 4 components and hooks; `Badge`, `Separator` (Task 1).
- Produces:
  - `type DocumentInfo = { title?: string; author?: string; subject?: string; keywords?: string; creator?: string; producer?: string; created?: Date; modified?: Date }`
  - `type PageSize = { widthPt: number; heightPt: number; name: string | null; landscape: boolean }`
  - `type Security = { encrypted: false } | { encrypted: true; method: string; denied: string[] }`
  - `type PdfDetails = { document: DocumentInfo; firstPageSize: PageSize | null; mixedSizes: boolean; attachments: string[]; security: Security }`
  - `parseQpdfJson(json: unknown): PdfDetails`
  - `describePageSize(size: PageSize): string`
  - `QPDF_JSON_ARGS: string[]` (the `--json` arguments, without the file name)
  - route `/info`

- [ ] **Step 1: Write the failing parser tests**

`src/lib/pdf-info.test.ts`:

```ts
import { describe, expect, test } from "vitest";

import { describePageSize, parseQpdfJson } from "@/lib/pdf-info";

const sample = {
  pages: [{ object: "4 0 R" }, { object: "5 0 R" }],
  attachments: { "notes.txt": { preferredname: "notes.txt" }, key2: {} },
  encrypt: { encrypted: false },
  qpdf: [
    { jsonversion: 2 },
    {
      trailer: { value: { "/Info": "9 0 R", "/Root": "1 0 R" } },
      "obj:3 0 R": { value: { "/Type": "/Pages", "/MediaBox": [0, 0, 595.28, 841.89], "/Kids": ["4 0 R", "5 0 R"] } },
      "obj:4 0 R": { value: { "/Type": "/Page", "/Parent": "3 0 R" } },
      "obj:5 0 R": { value: { "/Type": "/Page", "/Parent": "3 0 R", "/MediaBox": "7 0 R" } },
      "obj:7 0 R": { value: [0, 0, 612, 792] },
      "obj:8 0 R": { value: "u:Indirect subject" },
      "obj:9 0 R": {
        value: {
          "/Title": "u:Quarterly report",
          "/Author": "u:Mario",
          "/Subject": "8 0 R",
          "/Producer": "b:feff0041",
          "/CreationDate": "u:D:20260101120000Z",
          "/ModDate": "u:not a date",
        },
      },
    },
  ],
};

describe("parseQpdfJson", () => {
  const details = parseQpdfJson(sample);

  test("document info: u: strings, references, skipped binary strings, dates", () => {
    expect(details.document).toEqual({
      title: "Quarterly report",
      author: "Mario",
      subject: "Indirect subject",
      created: new Date("2026-01-01T12:00:00.000Z"),
    });
  });

  test("inherited MediaBox, named size and mixed sizes", () => {
    expect(details.firstPageSize).toEqual({ widthPt: 595.28, heightPt: 841.89, name: "A4", landscape: false });
    expect(details.mixedSizes).toBe(true);
  });

  test("attachments use preferredname, falling back to the key", () => {
    expect(details.attachments).toEqual(["notes.txt", "key2"]);
  });

  test("not encrypted", () => expect(details.security).toEqual({ encrypted: false }));

  test("restriction-only security lists denied permissions", () => {
    const parsed = parseQpdfJson({
      ...sample,
      encrypt: {
        encrypted: true,
        parameters: { method: "AESv3" },
        capabilities: { printhigh: false, modifyother: true, extract: true, modifyannotations: false },
      },
    });
    expect(parsed.security).toEqual({ encrypted: true, method: "AES-256", denied: ["Printing", "Comments and forms"] });
  });

  test("empty or unexpected JSON gives empty details", () => {
    expect(parseQpdfJson({})).toEqual({
      document: {},
      firstPageSize: null,
      mixedSizes: false,
      attachments: [],
      security: { encrypted: false },
    });
    expect(parseQpdfJson(null).firstPageSize).toBeNull();
  });
});

describe("describePageSize", () => {
  test.each([
    [{ widthPt: 595.28, heightPt: 841.89, name: "A4", landscape: false }, "A4 · 210 × 297 mm (8.27 × 11.69 in)"],
    [{ widthPt: 841.89, heightPt: 595.28, name: "A4", landscape: true }, "A4 landscape · 297 × 210 mm (11.69 × 8.27 in)"],
    [{ widthPt: 612, heightPt: 792, name: "Letter", landscape: false }, "Letter · 216 × 279 mm (8.50 × 11.00 in)"],
    [{ widthPt: 500, heightPt: 500, name: null, landscape: false }, "176 × 176 mm (6.94 × 6.94 in)"],
  ])("%j → %s", (size, expected) => {
    expect(describePageSize(size)).toBe(expected);
  });
});
```

Append to `src/lib/qpdf.integration.test.ts` (add `import { parseQpdfJson, QPDF_JSON_ARGS } from "@/lib/pdf-info";`):

```ts
describe("info JSON", () => {
  test("parses live qpdf --json output", async () => {
    const result = await qpdf.run([...QPDF_JSON_ARGS, "in.pdf"], {
      files: { "in.pdf": pdfFile(makePdf(2, { title: "Hello" })) },
    });
    expect(result.exitCode).toBe(0);
    const details = parseQpdfJson(JSON.parse(result.stdout));
    expect(details.document).toMatchObject({ title: "Hello", author: "Test Author" });
    expect(details.document.created?.toISOString()).toBe("2026-01-01T12:00:00.000Z");
    expect(details.firstPageSize?.name).toBe("Letter");
    expect(details.mixedSizes).toBe(false);
    expect(details.security).toEqual({ encrypted: false });
  });

  test("reports restrictions of a restriction-only PDF", async () => {
    const result = await qpdf.run([...QPDF_JSON_ARGS, "in.pdf"], { files: { "in.pdf": pdfFile(await restrictionOnly()) } });
    expect(parseQpdfJson(JSON.parse(result.stdout)).security).toEqual({
      encrypted: true,
      method: "AES-256",
      denied: ["Printing"],
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL, `Failed to resolve import "@/lib/pdf-info"`.

- [ ] **Step 3: Implement the parser**

`src/lib/pdf-info.ts`:

```ts
import { parsePdfDate } from "@/lib/format";

export type DocumentInfo = {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  created?: Date;
  modified?: Date;
};
export type PageSize = { widthPt: number; heightPt: number; name: string | null; landscape: boolean };
export type Security = { encrypted: false } | { encrypted: true; method: string; denied: string[] };
export type PdfDetails = {
  document: DocumentInfo;
  firstPageSize: PageSize | null;
  mixedSizes: boolean;
  attachments: string[];
  security: Security;
};

/** `qpdf.run([...QPDF_JSON_ARGS, "in.pdf"])` produces the JSON parseQpdfJson expects. */
export const QPDF_JSON_ARGS = [
  "--json",
  "--json-key=pages",
  "--json-key=encrypt",
  "--json-key=attachments",
  "--json-key=qpdf",
];

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const TEXT_FIELDS = [
  ["/Title", "title"],
  ["/Author", "author"],
  ["/Subject", "subject"],
  ["/Keywords", "keywords"],
  ["/Creator", "creator"],
  ["/Producer", "producer"],
] as const;

const NAMED_SIZES: [string, number, number][] = [
  ["A5", 419.53, 595.28],
  ["A4", 595.28, 841.89],
  ["Letter", 612, 792],
  ["Legal", 612, 1008],
  ["A3", 841.89, 1190.55],
];

const METHODS: Record<string, string> = { AESv3: "AES-256", AESv2: "AES-128", RC4: "RC4" };

const PERMISSIONS: [string, string][] = [
  ["printhigh", "Printing"],
  ["modifyother", "Editing"],
  ["extract", "Copying"],
  ["modifyannotations", "Comments and forms"],
];

/** Reads qpdf's JSON v2 (`--json` with pages, encrypt, attachments and qpdf keys) into display data. */
export function parseQpdfJson(json: unknown): PdfDetails {
  const root = isObject(json) ? json : {};
  const objects = objectTable(root);
  const resolve = (value: unknown): unknown => {
    if (typeof value === "string" && /^\d+ \d+ R$/.test(value)) {
      const entry = objects[`obj:${value}`];
      return isObject(entry) ? entry.value : undefined;
    }
    return value;
  };
  const text = (value: unknown): string | undefined => {
    const resolved = resolve(value);
    return typeof resolved === "string" && resolved.startsWith("u:") ? resolved.slice(2).trim() || undefined : undefined;
  };

  const trailer = isObject(objects.trailer) ? resolve(objects.trailer.value) : undefined;
  const infoDict = isObject(trailer) ? resolve(trailer["/Info"]) : undefined;
  const document: DocumentInfo = {};
  if (isObject(infoDict)) {
    for (const [key, field] of TEXT_FIELDS) {
      const value = text(infoDict[key]);
      if (value) document[field] = value;
    }
    const created = parsePdfDate(text(infoDict["/CreationDate"]) ?? "");
    const modified = parsePdfDate(text(infoDict["/ModDate"]) ?? "");
    if (created) document.created = created;
    if (modified) document.modified = modified;
  }

  const sizes = (Array.isArray(root.pages) ? root.pages : [])
    .map((page) => (isObject(page) ? mediaBoxSize(page.object, resolve) : null))
    .filter((size): size is [number, number] => size !== null);
  const first = sizes[0];
  const firstPageSize = first ? pageSize(first[0], first[1]) : null;
  const mixedSizes = first
    ? sizes.some(([w, h]) => Math.abs(w - first[0]) > 2 || Math.abs(h - first[1]) > 2)
    : false;

  const attachments = isObject(root.attachments)
    ? Object.entries(root.attachments).map(([key, value]) => {
        const name = isObject(value) ? value.preferredname : undefined;
        return typeof name === "string" && name !== "" ? name.replace(/^u:/, "") : key;
      })
    : [];

  return { document, firstPageSize, mixedSizes, attachments, security: security(root.encrypt) };
}

function objectTable(root: JsonObject): JsonObject {
  const qpdf = root.qpdf;
  return Array.isArray(qpdf) && isObject(qpdf[1]) ? qpdf[1] : {};
}

/** Walks /Parent up from the page until a MediaBox is found (it is inheritable). */
function mediaBoxSize(pageRef: unknown, resolve: (value: unknown) => unknown): [number, number] | null {
  let node = resolve(pageRef);
  for (let depth = 0; isObject(node) && depth < 32; depth++) {
    const box = resolve(node["/MediaBox"]);
    if (Array.isArray(box) && box.length === 4) {
      const [x1, y1, x2, y2] = box.map(resolve);
      if ([x1, y1, x2, y2].every((n) => typeof n === "number")) {
        return [Math.abs((x2 as number) - (x1 as number)), Math.abs((y2 as number) - (y1 as number))];
      }
    }
    node = resolve(node["/Parent"]);
  }
  return null;
}

function pageSize(widthPt: number, heightPt: number): PageSize {
  const short = Math.min(widthPt, heightPt);
  const long = Math.max(widthPt, heightPt);
  const named = NAMED_SIZES.find(([, a, b]) => Math.abs(short - a) <= 2 && Math.abs(long - b) <= 2);
  return { widthPt, heightPt, name: named ? named[0] : null, landscape: widthPt > heightPt };
}

function security(encrypt: unknown): Security {
  if (!isObject(encrypt) || encrypt.encrypted !== true) return { encrypted: false };
  const method = isObject(encrypt.parameters) ? String(encrypt.parameters.method ?? "") : "";
  const capabilities = isObject(encrypt.capabilities) ? encrypt.capabilities : {};
  const denied = PERMISSIONS.filter(([key]) => capabilities[key] === false).map(([, label]) => label);
  return { encrypted: true, method: METHODS[method] ?? method, denied };
}

/** "A4 · 210 × 297 mm (8.27 × 11.69 in)". */
export function describePageSize(size: PageSize): string {
  const mm = (pt: number) => Math.round((pt * 25.4) / 72);
  const inches = (pt: number) => (pt / 72).toFixed(2);
  const dimensions = `${mm(size.widthPt)} × ${mm(size.heightPt)} mm (${inches(size.widthPt)} × ${inches(size.heightPt)} in)`;
  if (!size.name) return dimensions;
  return `${size.name}${size.landscape ? " landscape" : ""} · ${dimensions}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Info page**

`src/pages/InfoPage.tsx`:

```tsx
import { Loader2, ShieldCheck } from "lucide-react";
import { Fragment, useState, type FormEvent, type ReactNode } from "react";

import { ErrorBox } from "@/components/ErrorBox";
import { PdfFileDropzone } from "@/components/PdfFileDropzone";
import { ResultCard } from "@/components/ResultCard";
import { SizeNotice } from "@/components/SizeNotice";
import { ToolPage } from "@/components/ToolPage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent, CardFooter } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatBytes } from "@/lib/format";
import { checkSize, isLikelyPhone } from "@/lib/limits";
import { describePageSize, parseQpdfJson, QPDF_JSON_ARGS, type PdfDetails } from "@/lib/pdf-info";
import { ensureNoOpenPassword } from "@/lib/qpdf";
import { useQpdfJob } from "@/lib/use-qpdf-job";

type Inspection = {
  fileName: string;
  fileSize: number;
  pdfVersion: string;
  pageCount: number;
  linearized: boolean;
  details: PdfDetails;
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h2>
      <dl>{children}</dl>
    </section>
  );
}

function InspectionDetails({ inspection }: { inspection: Inspection }) {
  const { details } = inspection;
  const doc = details.document;
  const textRows: [string, string | undefined][] = [
    ["Title", doc.title],
    ["Author", doc.author],
    ["Subject", doc.subject],
    ["Keywords", doc.keywords],
    ["Creator", doc.creator],
    ["Producer", doc.producer],
    ["Created", doc.created?.toLocaleString()],
    ["Modified", doc.modified?.toLocaleString()],
  ];
  const documentRows = textRows.filter((row): row is [string, string] => Boolean(row[1]));

  return (
    <div className="flex flex-col gap-4">
      <Group title="Document">
        {documentRows.length > 0 ? (
          documentRows.map(([label, value]) => (
            <Row key={label} label={label}>
              {value}
            </Row>
          ))
        ) : (
          <p className="py-1.5 text-sm text-muted-foreground">No document properties.</p>
        )}
      </Group>
      <Separator />
      <Group title="Pages">
        <Row label="Pages">{inspection.pageCount}</Row>
        <Row label="PDF version">{inspection.pdfVersion}</Row>
        {details.firstPageSize ? (
          <Row label="Page size">
            {details.mixedSizes ? "Mixed sizes · first page: " : ""}
            {describePageSize(details.firstPageSize)}
          </Row>
        ) : null}
      </Group>
      <Separator />
      <Group title="Security">
        {details.security.encrypted ? (
          <>
            <Row label="Encryption">
              Restrictions only (opens without a password){" "}
              {details.security.method ? <Badge variant="secondary">{details.security.method}</Badge> : null}
            </Row>
            <Row label="Not allowed">
              {details.security.denied.length > 0 ? (
                <span className="flex flex-wrap gap-1">
                  {details.security.denied.map((label) => (
                    <Badge key={label} variant="outline">
                      {label}
                    </Badge>
                  ))}
                </span>
              ) : (
                "Nothing"
              )}
            </Row>
          </>
        ) : (
          <Row label="Encryption">Not encrypted</Row>
        )}
      </Group>
      <Separator />
      <Group title="Other">
        <Row label="File size">{formatBytes(inspection.fileSize)}</Row>
        <Row label="Fast web view">{inspection.linearized ? <Badge variant="secondary">Linearized</Badge> : "No"}</Row>
        <Row label="Attachments">
          {details.attachments.length > 0
            ? details.attachments.map((name, index) => (
                <Fragment key={`${name}-${index}`}>
                  {index > 0 ? ", " : ""}
                  {name}
                </Fragment>
              ))
            : "None"}
        </Row>
      </Group>
    </div>
  );
}

export function Component() {
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [likelyPhone] = useState(isLikelyPhone);
  const job = useQpdfJob();
  const sizeCheck = checkSize(file?.size ?? 0, likelyPhone);

  function chooseFile(files: File[]) {
    setFile(files[0] ?? null);
    job.clearError();
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file || file.size === 0) {
      job.fail("Choose a PDF file.");
      return;
    }
    if (!sizeCheck.ok) return;
    const result = await job.run(async (qpdf): Promise<Inspection> => {
      const info = await ensureNoOpenPassword(qpdf, file);
      const json = await qpdf.run([...QPDF_JSON_ARGS, "in.pdf"], { files: { "in.pdf": file } });
      if (json.exitCode !== 0 && json.exitCode !== 3) throw new Error(json.stderr.trim() || "qpdf --json failed");
      const linearization = await qpdf.run(["--check-linearization", "in.pdf"], { files: { "in.pdf": file } });
      return {
        fileName: file.name,
        fileSize: file.size,
        pdfVersion: info.pdfVersion,
        pageCount: info.pageCount,
        linearized: linearization.exitCode === 0,
        details: parseQpdfJson(JSON.parse(json.stdout)),
      };
    });
    if (result) setInspection(result);
  }

  function inspectAnother() {
    job.reset();
    setFile(null);
    setInspection(null);
  }

  if (inspection) {
    return (
      <ResultCard
        title={inspection.details.document.title ?? inspection.fileName}
        description={`${inspection.fileName} · ${formatBytes(inspection.fileSize)}`}
        anotherLabel="Inspect another file"
        onAnother={inspectAnother}
      >
        <InspectionDetails inspection={inspection} />
      </ResultCard>
    );
  }

  return (
    <ToolPage
      title="PDF info"
      intro="See a PDF's properties, page size, restrictions and attachments. Inspection runs entirely in your browser."
      cardTitle="Inspect"
      cardDescription={
        <>
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>Your file stays on this device. Nothing is uploaded.</span>
        </>
      }
    >
      <form onSubmit={onSubmit}>
        <CardContent className="flex flex-col gap-6">
          <PdfFileDropzone
            id="file"
            disabled={job.busy}
            selectedName={file?.name ?? null}
            onFiles={chooseFile}
            onInvalid={job.fail}
          />
          <SizeNotice check={sizeCheck} />
          {job.error ? <ErrorBox error={job.error} /> : null}
        </CardContent>
        <CardFooter className="pt-6">
          <Button type="submit" disabled={job.busy || !sizeCheck.ok} className="w-full sm:w-auto">
            {job.busy ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Inspecting…
              </>
            ) : (
              "Inspect"
            )}
          </Button>
        </CardFooter>
      </form>
    </ToolPage>
  );
}
```

- [ ] **Step 6: Register the tool**

In `src/tools.ts` add `FileSearch` to the `lucide-react` import and append after compress:

```ts
  {
    id: "info",
    path: "/info",
    title: "PDF info",
    navLabel: "Info",
    description: "See a PDF's properties, page size, restrictions and attachments.",
    icon: FileSearch,
    load: () => import("@/pages/InfoPage"),
  },
```

- [ ] **Step 7: Verify**

Run: `npm run lint && npm test && npm run build`. Then at `/info`:
1. `plain.pdf` → title "Plain sample", author "Test Author", created date, 5 pages, PDF 1.7, Letter size, "Not encrypted", file size, Fast web view "No", Attachments "None".
2. `restricted.pdf` → Security shows "Restrictions only (opens without a password)", an "AES-256" badge and a "Printing" badge.
3. `protected.pdf` → password-protected error with Decrypt link.
4. A real-world PDF from your machine → no crash; missing fields are simply omitted.

- [ ] **Step 8: Commit and push**

```bash
git add src
git commit -m "feat: PDF info tool

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NvYC5VwsQMEVA9j9Scdfc1"
git push
```

---

### Task 10: PWA and offline

**Files:**
- Create: `pwa-assets.config.ts`, generated `public/{favicon.ico,pwa-64x64.png,pwa-192x192.png,pwa-512x512.png,maskable-icon-512x512.png,apple-touch-icon-180x180.png}`
- Modify: `package.json`, `vite.config.ts`, `tsconfig.app.json`, `index.html`, `src/main.tsx`

**Interfaces:**
- Consumes: `public/favicon.svg` (Task 1); all lazy routes (Tasks 4–9).
- Produces: `dist/sw.js`, `dist/manifest.webmanifest`; script `npm run icons`.

- [ ] **Step 1: Install**

```bash
npm install -D vite-plugin-pwa@^2.0.0 @vite-pwa/assets-generator@^2.0.0
```

- [ ] **Step 2: Generate icons**

`pwa-assets.config.ts`:

```ts
import { defineConfig, minimal2023Preset as preset } from '@vite-pwa/assets-generator/config'

export default defineConfig({
  preset,
  images: ['public/favicon.svg'],
})
```

Add to `package.json` scripts: `"icons": "pwa-assets-generator"`. Run:

```bash
npm run icons
ls public
```

Expected: `apple-touch-icon-180x180.png favicon.ico favicon.svg maskable-icon-512x512.png pwa-192x192.png pwa-512x512.png pwa-64x64.png`. Open `public/maskable-icon-512x512.png` and confirm the padlock document sits inside the safe zone.

- [ ] **Step 3: Configure the plugin**

In `vite.config.ts` add `import { VitePWA } from 'vite-plugin-pwa'` and add to `plugins` after `tailwindcss()`:

```ts
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'PDF Toolbox',
        short_name: 'PDF Toolbox',
        description: 'Private PDF tools that run entirely in your browser.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,wasm,webmanifest}'],
        // qpdf.wasm is ~2.2 MB, above Workbox's 2 MiB default; without this the build fails.
        maximumFileSizeToCacheInBytes: 3_000_000,
        navigateFallback: '/index.html',
      },
    }),
```

In `tsconfig.app.json` change `"types": ["vite/client"]` to `"types": ["vite/client", "vite-plugin-pwa/client"]`.

- [ ] **Step 4: Register the service worker and head links**

In `src/main.tsx` add after the other imports:

```tsx
import { registerSW } from "virtual:pwa-register";
```

and before `createRoot(...)`:

```tsx
registerSW({ immediate: true });
```

In `index.html` replace the `<link rel="icon" …>` line with:

```html
    <link rel="icon" href="/favicon.ico" sizes="48x48" />
    <link rel="icon" href="/favicon.svg" sizes="any" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png" />
    <meta name="theme-color" content="#ffffff" />
```

- [ ] **Step 5: Verify the precache**

```bash
npm run lint && npm test && npm run build
grep -o 'url:"[^"]*"' dist/sw.js | sort
```

Expected: the build log ends with `PWA v2.0.0 … precache N entries`, and the list includes `index.html`, `manifest.webmanifest`, every `assets/*Page-*.js`, `assets/worker-*.js` and `assets/qpdf-*.wasm`.

- [ ] **Step 6: Verify offline in the browser**

`npm run preview`, open http://localhost:4173 in Chrome:
1. DevTools → Application → Service workers: `sw.js` is activated. Cache storage contains `qpdf-*.wasm`.
2. Application → Manifest: name, icons and "Installable" have no errors.
3. Network → Offline. Reload `/decrypt` directly → page loads. Decrypt `protected.pdf` → works offline. Visit `/info` → works.
4. Back online, run `npm run build` again with a trivial change (e.g. edit the footer text temporarily), reload twice → the new text appears (auto update). Revert the change.

- [ ] **Step 7: Commit and push**

```bash
git add -A
git commit -m "feat: installable PWA with offline precache

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NvYC5VwsQMEVA9j9Scdfc1"
git push
```

---

### Task 11: Docs

**Files:**
- Modify: `README.md` (full rewrite)
- Create: `AGENTS.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: final file layout and behavior from Tasks 1–10.
- Produces: documentation only.

- [ ] **Step 1: Rewrite `README.md`**

````markdown
# PDF Toolbox

Private PDF tools that run entirely in your browser. PDFs and passwords never leave the device:
every operation runs locally with [qpdf](https://github.com/qpdf/qpdf) compiled to WebAssembly
([`@mssio/qpdf-wasm`](https://www.npmjs.com/package/@mssio/qpdf-wasm)). The build is plain static
files, and the app installs as a PWA that works offline after the first visit.

Current version: **1.0.0** ([changelog](CHANGELOG.md)).

## Tools

| Tool | Path | What it does |
|---|---|---|
| Decrypt | `/decrypt` | Removes a PDF's password (or, with an empty password, its owner restrictions). |
| Encrypt | `/encrypt` | Adds an open password (AES-256) and permissions for printing, editing, copying and comments. |
| Merge | `/merge` | Combines several PDFs in the order you choose. |
| Extract pages | `/extract` | Saves selected pages (`1-3,7`, `5-z`) as a new PDF. |
| Compress | `/compress` | Repacks and recompresses the PDF structure (images are not downsampled). |
| Info | `/info` | Shows properties, page size, restrictions and attachments. |

Only Decrypt accepts PDFs that need a password to open; the other tools ask you to decrypt first.
PDFs that open without a password but carry restrictions work everywhere.

**Size limit:** 250 MB combined per operation (phones get a warning above 100 MB). qpdf's
WebAssembly memory runs out on larger inputs. The values live in `src/lib/limits.ts`.

## Requirements

- Node 24 LTS (`nvm use` reads `.nvmrc`). Vitest 5 does not support Node 25.
- npm

## Scripts

```bash
npm install
npm run dev       # dev server on http://localhost:5173
npm test          # unit + integration tests (real qpdf wasm in Node)
npm run lint
npm run build     # type-check and build static files into dist/
npm run preview   # serve dist/ on http://localhost:4173 (service worker active)
npm run icons     # regenerate PWA icons from public/favicon.svg
```

## Stack

Vite 8, React 19, React Router 8 (data router, lazy routes), TypeScript 6.0, Tailwind CSS 4,
shadcn/ui (new-york) on Radix, `@mssio/qpdf-wasm`, `vite-plugin-pwa`, Vitest 5.

## Hosting `dist/`

`dist/` is static. Any web server or static host works if it does three things:

1. **Falls back to `index.html`** for unknown paths, so `/decrypt` loads on a direct visit or refresh.
2. Serves `.wasm` as `application/wasm` (fastest compile; other types still work).
3. Sends `Cache-Control: no-cache` for `index.html` and `sw.js` so updates are picked up.
   Files in `assets/` are content-hashed and can be cached forever.

**nginx**

```nginx
location / {
  try_files $uri /index.html;
}
location = /index.html { add_header Cache-Control "no-cache"; }
location = /sw.js      { add_header Cache-Control "no-cache"; }
location /assets/      { add_header Cache-Control "public, max-age=31536000, immutable"; }
types { application/wasm wasm; }
```

**Netlify / Cloudflare Pages:** add `public/_redirects` containing `/*  /index.html  200`.

**Caddy**

```caddy
example.com {
  root * /srv/pdf-toolbox
  try_files {path} /index.html
  file_server
}
```

**GitHub Pages:** copy `dist/index.html` to `dist/404.html` after building.

**Content-Security-Policy:** if you set one, allow `script-src 'self' 'wasm-unsafe-eval'` and
`worker-src 'self'`.

## Offline

The service worker precaches the whole app, including the qpdf worker and `.wasm` (about 2.6 MB),
after the first online visit. New deployments activate the next time the app opens online.

## Adding a tool

1. Write any non-React logic in `src/lib/` with a unit test.
2. Create `src/pages/<Name>Page.tsx` exporting `function Component()`, built from `ToolPage`,
   `ResultCard`, `PdfFileDropzone`, `useQpdfJob` and `useBlobUrl` (see `CompressPage.tsx`).
3. Add an entry to `src/tools.ts`; the route, header link and home card follow from it.
4. Add an integration test for the qpdf call in `src/lib/qpdf.integration.test.ts`.

See [AGENTS.md](AGENTS.md) for the rules the code follows.
````

- [ ] **Step 2: Create `AGENTS.md`**

````markdown
# AGENTS.md

Guide for coding agents working on PDF Toolbox.

## What this is

A static single-page app (Vite + React + React Router) with six PDF tools: Decrypt, Encrypt, Merge,
Extract pages, Compress, Info. All PDF work runs in the browser through `@mssio/qpdf-wasm` (qpdf in a
Web Worker). It is a PWA that works offline. Design spec:
`docs/superpowers/specs/2026-10-06-vite-wasm-port-design.md`.

## Hard constraints

- **No backend.** `npm run build` must produce static files only. No API calls, no analytics, no
  uploads. Files and passwords never leave the browser.
- **Offline must keep working.** Anything the app needs at runtime must be in the Workbox precache
  (`vite.config.ts`). Don't load fonts, scripts or wasm from CDNs.
- **Only Decrypt accepts PDFs that need a password to open.** Every other tool calls
  `ensureNoOpenPassword(qpdf, file)` first and shows "Remove its password with Decrypt first".
  Restriction-only PDFs (owner password only) are accepted everywhere. No password fields outside
  Decrypt.
- **Size limit:** `MAX_TOTAL_BYTES` (250 MB) and `PHONE_WARN_BYTES` (100 MB) in `src/lib/limits.ts`
  are the only source of these numbers.

## Map

```
src/tools.ts              tool registry → routes, header links, home cards
src/router.ts             createBrowserRouter: AppShell, home, one lazy route per tool
src/main.tsx              entry; registers the service worker
src/components/           AppShell, PdfFileDropzone, ToolPage, ResultCard, ErrorBox, SizeNotice
src/components/ui/        shadcn primitives (new-york); edit sparingly, keep tokens
src/pages/                HomePage + one <Name>Page.tsx per tool (exports `Component`)
src/lib/qpdf.ts           getQpdf, ensureNoOpenPassword, assertOutput, describeQpdfError, logWarnings
src/lib/use-qpdf-job.ts   busy/error state for one job; drops stale results
src/lib/use-blob-url.ts   owns the download blob URL and revokes it
src/lib/*.ts              pure helpers (filename, format, limits, pdf-files, page-ranges,
                          passwords, merge-list, pdf-info), each with a *.test.ts
src/test/make-pdf.ts      builds valid PDFs for tests
public/favicon.svg        source of every icon (`npm run icons` regenerates the PNGs/ICO)
```

## qpdf rules

- Get the instance with `getQpdf()` (lazy, shared, retries after a failed load). Never import
  `@mssio/qpdf-wasm` as a value in app code; type imports are fine. Tests may import it.
- Pass `File` objects. Byte inputs (`Uint8Array`/`ArrayBuffer`) are **transferred** to the worker
  and become empty; pass `bytes.slice()` if you still need them (e.g. `qpdf.info(output.slice())`
  before showing `output` as a download).
- Run jobs through `useQpdfJob().run(async (qpdf) => …)`; it maps errors with
  `describeQpdfError` and ignores results after `reset()` or unmount.
- Call `assertOutput(output)` on every output before it becomes a download. qpdf can "succeed" with
  a near-empty file when the wasm runs out of memory (seen with encrypt at 600 MB).
- Log `warnings` with `logWarnings`; don't show them.
- Show downloads with `useBlobUrl().show(bytes, filename)`; it revokes old URLs.
- Merge output is never encrypted; Extract and Compress keep owner restrictions.

## UI conventions

- shadcn only; no other component kits. Add primitives from the new-york v4 registry, adapted to
  per-package `@radix-ui/react-*` imports, into `src/components/ui/`.
- Use theme tokens from `src/styles/globals.css` (`bg-muted`, `text-muted-foreground`, …). No raw
  hex colors in components.
- `cn()` from `@/lib/utils` for class merging.
- The theme key `pdf-mss-io-theme` appears in `src/lib/theme.ts` **and** the inline script in
  `index.html`; change both together.
- Copy style: short sentences, say what happens on the user's device.

## Adding a tool

1. Pure logic in `src/lib/<thing>.ts` + `<thing>.test.ts` (TDD).
2. `src/pages/<Name>Page.tsx` exporting `function Component()`, composed from `ToolPage`,
   `PdfFileDropzone`, `SizeNotice`, `ErrorBox`, `ResultCard`, `useQpdfJob`, `useBlobUrl`. Call
   `ensureNoOpenPassword` first unless the tool is about passwords.
3. Registry entry in `src/tools.ts` (id, path, title, navLabel, description, lucide icon, `load`).
4. Integration test for the qpdf call in `src/lib/qpdf.integration.test.ts`.
5. `npm run build` and confirm the new chunk appears in `dist/sw.js`'s precache list.

## Versions

- Node 24 LTS (`.nvmrc`). Vitest 5 doesn't support Node 25.
- TypeScript is held at `~6.0.3` because typescript-eslint 8.71 supports TypeScript < 6.1. Upgrade
  to 7.x only when typescript-eslint supports it.
- React Router is v8: import from `react-router` (and `react-router/dom` for `RouterProvider`).

## Before you finish

```bash
npm run lint && npm test && npm run build
```

All three must pass. For UI changes also run `npm run preview` and check the page in a browser,
including dark mode and a phone-width window.

## Workflow

Commit each logical change and push right away. Work on a feature branch, not `main`.
````

- [ ] **Step 3: Create `CLAUDE.md`**

```markdown
@AGENTS.md
```

- [ ] **Step 4: Verify links and commit**

```bash
grep -o '](\S*)' README.md AGENTS.md
npm run lint && npm test && npm run build
git add README.md AGENTS.md CLAUDE.md
git commit -m "docs: README, AGENTS.md and CLAUDE.md for the static app

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NvYC5VwsQMEVA9j9Scdfc1"
git push
```

Expected: every relative link points at a file that exists (`AGENTS.md`; `CHANGELOG.md` is created in Task 13).

---

### Task 12: Final verification

**Files:**
- Modify only if a check fails (fix in the owning file, with a test where possible).

**Interfaces:**
- Consumes: everything.
- Produces: a verified branch ready for review.

- [ ] **Step 1: Clean install and full checks**

```bash
rm -rf node_modules dist
npm ci
npm ls @mssio/qpdf-wasm
node -p "require('./package.json').version"
npm run lint && npm test && npm run build
```

Expected: `@mssio/qpdf-wasm@1.0.x`, version `1.0.0`, and all checks pass from a clean install. Record the test count and the precache entry count.

- [ ] **Step 2: Desktop walkthrough (`npm run preview`, Chrome and Safari or Firefox)**

For each tool, with `plain.pdf`, `restricted.pdf`, `protected.pdf` and one real-world PDF:
- [ ] Decrypt: wrong → right password; empty password on `restricted.pdf`; download name `*-d.pdf`.
- [ ] Encrypt: permissions honored in a PDF viewer; `protected.pdf` rejected with Decrypt link.
- [ ] Merge: order respected; restriction note shown; `protected.pdf` named in the error.
- [ ] Extract: page count shown; loose ranges accepted; out-of-range detail shown.
- [ ] Compress: smaller result and "No smaller version" path.
- [ ] Info: all groups render; restriction badges for `restricted.pdf`.
- [ ] Every tool URL loads directly (paste `/merge` into a new tab).
- [ ] Theme toggle persists across reloads without a flash; both themes look right on every page.
- [ ] Width 375 px: header shows only Home + toggle; home grid is one column; nothing overflows.
- [ ] Home page network panel: no `.wasm` request.
- [ ] A file over 250 MB (create with `mkfile 260m big.pdf` on macOS) → limit error, button disabled.

- [ ] **Step 3: Offline check** (as Task 10 Step 6): service worker active, offline reload of a tool
  page, successful Decrypt offline.

- [ ] **Step 4: Phone check (owner)**

Deploy `dist/` anywhere reachable from the phone, or run `npm run preview -- --host` on the same
network (note: service workers need HTTPS except on localhost, so test offline only on a real HTTPS
deployment). On the phone:
- [ ] Add to Home Screen; it opens standalone with the padlock icon.
- [ ] Encrypt a ~100 MB PDF and a ~250 MB PDF. If either fails with the memory message, lower
  `MAX_TOTAL_BYTES` or `PHONE_WARN_BYTES` in `src/lib/limits.ts`, update README/AGENTS, re-run tests.
- [ ] Airplane mode → open from the home screen → Decrypt works.

- [ ] **Step 5: Report and push**

Summarize results (test count, precache entries, any constants changed, any issues found) in the
final message. If anything changed, commit and push it:

```bash
git add -A
git commit -m "chore: final verification fixes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NvYC5VwsQMEVA9j9Scdfc1"
git push
```

---

### Task 13: Playwright setup, shell and offline tests (and the route error fix)

**Files:**
- Create: `playwright.config.ts`, `tsconfig.e2e.json`, `e2e/paths.ts`, `e2e/global-setup.ts`, `e2e/helpers.ts`, `e2e/shell.spec.ts`, `e2e/offline.spec.ts`
- Modify: `package.json` (dev dependency + `test:e2e` script), `package-lock.json`, `tsconfig.json` (reference), `.gitignore`, `src/router.ts`

**Interfaces:**
- Consumes: the built app (`npm run build` → `dist/`), `makePdf` (`src/test/make-pdf.ts`), `parseQpdfJson` and `QPDF_JSON_ARGS` (`src/lib/pdf-info.ts`), `RouteError` (`src/components/RouteError.tsx`).
- Produces (for Tasks 14–15):
  - `fixture(name: string): string` and `FIXTURES_DIR` from `e2e/paths.ts`. Fixture names: `plain.pdf`, `two-pages.pdf` (A4), `protected.pdf` (password `open-me`), `restricted.pdf`, `linearized.pdf`, `not-a-pdf.pdf`, `empty.pdf`, `oversize.pdf` (260 MB sparse)
  - From `e2e/helpers.ts`: `TOOL_PATHS: string[]`; `chooseFiles(page, ...names): Promise<void>`; `download(page, linkName): Promise<{ path: string; filename: string }>`; `inspectPdf(path, password?): Promise<{ encrypted: boolean; pageCount: number; capabilities: Record<string, boolean>; firstPageSize: string | null }>`; `tabTo(page, locator, maxTabs = 40): Promise<void>`
  - Config: service workers are blocked by default; a spec that needs them calls `test.use({ serviceWorkers: "allow" })`. The `webkit` project runs only `offline.spec.ts`.

- [ ] **Step 1: Install Playwright and its browsers**

```bash
npm install -D @playwright/test@^1.63.0
npx playwright install chromium webkit
```

Expected: `npm ls @playwright/test` shows 1.63.x. Browsers go to `~/Library/Caches/ms-playwright` (outside the repo).

- [ ] **Step 2: Script, ignores and type-checking**

In `package.json` scripts add `"test:e2e": "npm run build && playwright test"`. Append to `.gitignore`:

```
# Playwright
e2e/.fixtures/
test-results/
playwright-report/
```

`tsconfig.e2e.json`:

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.e2e.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023", "DOM"],
    "module": "esnext",
    "types": ["node"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "paths": { "@/*": ["./src/*"] },
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["e2e", "playwright.config.ts"]
}
```

Replace `tsconfig.json` with:

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.e2e.json" }
  ]
}
```

- [ ] **Step 3: Config, fixtures and helpers**

`playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test'

// Runs against the production build (`npm run test:e2e` builds first). See spec section 9.
export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  tsconfig: './tsconfig.app.json',
  timeout: 60_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
  },
  use: {
    baseURL: 'http://localhost:4173',
    // Service workers would serve cached chunks and bypass page.route(); only offline.spec.ts enables them.
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testMatch: /offline\.spec\.ts/ },
  ],
})
```

`e2e/paths.ts`:

```ts
import { fileURLToPath } from "node:url";

export const FIXTURES_DIR = fileURLToPath(new URL("./.fixtures/", import.meta.url));

export function fixture(name: string): string {
  return `${FIXTURES_DIR}${name}`;
}
```

`e2e/global-setup.ts`:

```ts
import { mkdir, truncate, writeFile } from "node:fs/promises";
import { createQpdf } from "@mssio/qpdf-wasm";

import { makePdf } from "../src/test/make-pdf";
import { FIXTURES_DIR, fixture } from "./paths";

/** Regenerates every test PDF before each run, so tests never depend on files outside the repo. */
export default async function globalSetup() {
  await mkdir(FIXTURES_DIR, { recursive: true });
  const qpdf = await createQpdf();
  try {
    await writeFile(fixture("plain.pdf"), makePdf(5, { title: "Plain sample" }));
    await writeFile(fixture("two-pages.pdf"), makePdf(2, { size: [595.28, 841.89] }));
    await writeFile(
      fixture("protected.pdf"),
      (await qpdf.encrypt(makePdf(3), { userPassword: "open-me", ownerPassword: "owner" })).output,
    );
    await writeFile(
      fixture("restricted.pdf"),
      (await qpdf.encrypt(makePdf(2), { userPassword: "", ownerPassword: "owner", allow: { print: false } })).output,
    );
    await writeFile(fixture("linearized.pdf"), (await qpdf.linearize(makePdf(3))).output);
    await writeFile(fixture("not-a-pdf.pdf"), "This is plain text, not a PDF.\n");
    await writeFile(fixture("empty.pdf"), "");
    await writeFile(fixture("oversize.pdf"), "");
    await truncate(fixture("oversize.pdf"), 260 * 1024 * 1024); // sparse; only its size is ever checked
  } finally {
    qpdf.terminate();
  }
}
```

`e2e/helpers.ts`:

```ts
import { readFile } from "node:fs/promises";
import { createQpdf, type Qpdf } from "@mssio/qpdf-wasm";
import { expect, type Locator, type Page } from "@playwright/test";

import { parseQpdfJson, QPDF_JSON_ARGS } from "@/lib/pdf-info";

import { fixture } from "./paths";

export const TOOL_PATHS = ["/decrypt", "/encrypt", "/merge", "/extract", "/compress", "/info"];

/** Picks fixture files through the page's (visually hidden) file input. */
export async function chooseFiles(page: Page, ...names: string[]): Promise<void> {
  await page.locator('input[type="file"]').setInputFiles(names.map(fixture));
}

/** Clicks a download link and returns the saved file's path and suggested name. */
export async function download(page: Page, linkName: string): Promise<{ path: string; filename: string }> {
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: linkName }).click()]);
  return { path: await file.path(), filename: file.suggestedFilename() };
}

let qpdfInstance: Promise<Qpdf> | null = null;

export type PdfInspection = {
  encrypted: boolean;
  pageCount: number;
  capabilities: Record<string, boolean>;
  firstPageSize: string | null;
};

/** Re-reads a PDF with the real qpdf in Node so tests verify what users actually download. */
export async function inspectPdf(path: string, password?: string): Promise<PdfInspection> {
  const qpdf = await (qpdfInstance ??= createQpdf());
  const bytes = new Uint8Array(await readFile(path));
  const passwordArgs = password ? [`--password=${password}`] : [];
  const info = await qpdf.info(bytes.slice(), password ? { password } : {});
  const json = await qpdf.run([...passwordArgs, ...QPDF_JSON_ARGS, "in.pdf"], { files: { "in.pdf": bytes.slice() } });
  const parsed = JSON.parse(json.stdout);
  return {
    encrypted: info.encrypted,
    pageCount: info.pageCount,
    capabilities: parsed.encrypt?.capabilities ?? {},
    firstPageSize: parseQpdfJson(parsed).firstPageSize?.name ?? null,
  };
}

/** Presses Tab until `target` has focus; fails if it isn't reached within `maxTabs` presses. */
export async function tabTo(page: Page, target: Locator, maxTabs = 40): Promise<void> {
  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  await expect(target, `not reachable with ${maxTabs} Tab presses`).toBeFocused();
}
```

- [ ] **Step 4: Write the shell and offline specs**

`e2e/shell.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

import { TOOL_PATHS } from "./helpers";

test("header, footer and home grid", async ({ page }) => {
  await page.goto("/");
  const header = page.locator("header");
  await expect(header.getByRole("link", { name: "PDF Toolbox" })).toBeVisible();
  await expect(header.locator('img[src="/favicon.svg"]')).toBeVisible();
  await expect(header.getByRole("link", { name: "Home" })).toBeVisible();
  await expect(header.getByRole("button", { name: /Switch to (dark|light) mode/ })).toBeVisible();
  await expect(page.locator("footer")).toHaveText("PDFs are processed locally in your browser. Nothing is uploaded.");
  await expect(page.getByRole("link", { name: "Open tool" })).toHaveCount(6);
});

test("theme toggle persists across reloads and is applied before the app script runs", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  // Block the app bundle: only the inline script in index.html can set the class now (no flash).
  await page.route("**/assets/index-*.js", (route) => route.abort());
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("follows the system theme when nothing is saved", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.emulateMedia({ colorScheme: "light" });
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

test("every tool URL loads directly", async ({ page }) => {
  for (const path of TOOL_PATHS) {
    await page.goto(path);
    await expect(page.locator("main h1")).toBeVisible();
  }
});

test("the home page downloads no wasm", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  expect(requests.filter((url) => url.endsWith(".wasm"))).toEqual([]);
});

test("nothing overflows sideways at 375 px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const path of ["/", ...TOOL_PATHS]) {
    await page.goto(path);
    await expect(page.locator("main h1")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(0);
  }
});

test("a page that fails to load shows the error screen inside the shell", async ({ page }) => {
  await page.route("**/assets/DecryptPage-*.js", (route) => route.abort());
  await page.goto("/");
  await page.getByRole("link", { name: "Open tool" }).first().click();
  await expect(page.getByText("Something went wrong")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reload" })).toBeVisible();
  await expect(page.locator("header").getByRole("link", { name: "PDF Toolbox" })).toBeVisible();
  await page.getByRole("link", { name: "Back to home" }).click();
  await expect(page).toHaveURL("/");
});
```

`e2e/offline.spec.ts`:

```ts
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { expect, test, type Page } from "@playwright/test";

import { chooseFiles, download } from "./helpers";

// This spec needs the real service worker, so it opts back in (the config blocks it elsewhere).
test.use({ serviceWorkers: "allow" });

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, () => {
      const address = server.address();
      server.close(() => (typeof address === "object" && address ? resolve(address.port) : reject(new Error("no port"))));
    });
  });
}

async function startPreview(port: number): Promise<ChildProcess> {
  const child = spawn("npx", ["vite", "preview", "--port", String(port), "--strictPort"], {
    stdio: "ignore",
    detached: true,
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await fetch(`http://localhost:${port}/`);
      return child;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`vite preview did not start on port ${port}`);
}

async function stopPreview(child: ChildProcess, port: number): Promise<void> {
  if (child.pid) process.kill(-child.pid);
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      await fetch(`http://localhost:${port}/`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch {
      return; // the server is gone: from now on only the service worker can answer
    }
  }
  throw new Error("vite preview did not stop");
}

async function decryptProtected(page: Page): Promise<string> {
  await chooseFiles(page, "protected.pdf");
  await page.getByLabel("Password", { exact: true }).fill("open-me");
  await page.getByRole("button", { name: "Decrypt", exact: true }).click();
  return (await download(page, "Download decrypted PDF")).filename;
}

test("after the first visit the app works with the server gone", async ({ page }) => {
  const port = await freePort();
  const origin = `http://localhost:${port}`;
  const server = await startPreview(port);
  try {
    await page.goto(`${origin}/decrypt`);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(async () => {
      for (const name of await caches.keys()) {
        const requests = await (await caches.open(name)).keys();
        if (requests.some((request) => /qpdf-.*\.wasm$/.test(request.url))) return true;
      }
      return false;
    });
    await page.reload(); // the active worker now controls the page
  } finally {
    await stopPreview(server, port);
  }

  await page.goto(`${origin}/info`);
  await expect(page.getByRole("heading", { name: "PDF info" })).toBeVisible();
  await page.goto(`${origin}/decrypt`);
  await expect(page.getByRole("heading", { name: "Decrypt PDF" })).toBeVisible();
  expect(await decryptProtected(page)).toBe("protected-d.pdf");
});
```

- [ ] **Step 5: Run them: the error-screen test must fail (RED)**

```bash
npx playwright test
```

Expected: every test passes **except** `a page that fails to load shows the error screen inside the shell`: the main area stays empty. React Router does not use a lazy route's own `ErrorBoundary` when the lazy import itself fails, so the error screen added in the final review never appears.

- [ ] **Step 6: Move the error boundary to a pathless route inside AppShell**

`src/router.ts`:

```ts
import { createBrowserRouter } from "react-router";

import { AppShell } from "@/components/AppShell";
import { RouteError } from "@/components/RouteError";
import { HomePage } from "@/pages/HomePage";
import { tools } from "@/tools";

// The error boundary lives on a pathless route inside AppShell: it catches failures from every page,
// including a lazy page whose code fails to load, while the shell's header and footer stay visible.
export const router = createBrowserRouter([
  {
    Component: AppShell,
    children: [
      {
        ErrorBoundary: RouteError,
        children: [{ path: "/", Component: HomePage }, ...tools.map((tool) => ({ path: tool.path, lazy: tool.load }))],
      },
    ],
  },
]);
```

- [ ] **Step 7: Run everything (GREEN)**

```bash
npm run lint && npm test && npm run test:e2e
```

Expected: lint clean; unit/integration 119 passed; Playwright: 7 shell tests (chromium) + the offline test in chromium **and** webkit pass. Run `npx playwright test` a second time to confirm nothing is flaky.

- [ ] **Step 8: Commit and push**

```bash
git add package.json package-lock.json tsconfig.json tsconfig.e2e.json .gitignore playwright.config.ts e2e src/router.ts
git commit -m "test: Playwright setup with shell and offline tests; fix route error screen for lazy pages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NvYC5VwsQMEVA9j9Scdfc1"
git push
```

---

### Task 14: Password fields that are never saved

**Files:**
- Create: `src/components/ui/secret-input.tsx`, `e2e/password-fields.spec.ts`
- Modify: `src/pages/DecryptPage.tsx`, `src/pages/EncryptPage.tsx`

**Interfaces:**
- Consumes: `Input` (`@/components/ui/input`), `cn`; `TOOL_PATHS` from `e2e/helpers.ts` (Task 13).
- Produces: `SecretInput(props: Omit<React.ComponentProps<"input">, "type">)` from `@/components/ui/secret-input`. It always renders `type="text"`, masks with `-webkit-text-security: disc`, and forces `autoComplete="off"` plus the password-manager opt-out attributes (callers cannot override them).

- [ ] **Step 1: Write the failing spec**

`e2e/password-fields.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

import { TOOL_PATHS } from "./helpers";

const IGNORE_ATTRIBUTES = {
  autocomplete: "off",
  "data-1p-ignore": "true",
  "data-lpignore": "true",
  "data-bwignore": "true",
  "data-form-type": "other",
};

test("no page has a real password input", async ({ page }) => {
  for (const path of ["/", ...TOOL_PATHS]) {
    await page.goto(path);
    await expect(page.locator("main h1")).toBeVisible();
    await expect(page.locator('input[type="password"]'), path).toHaveCount(0);
  }
});

for (const { path, labels } of [
  { path: "/decrypt", labels: ["Password"] },
  { path: "/encrypt", labels: ["Password to open", "Confirm password"] },
]) {
  test(`${path} password fields are masked and opt out of password managers`, async ({ page }) => {
    await page.goto(path);
    for (const label of labels) {
      const field = page.getByLabel(label, { exact: true });
      await expect(field).toHaveAttribute("type", "text");
      for (const [name, value] of Object.entries(IGNORE_ATTRIBUTES)) {
        await expect(field, `${label} ${name}`).toHaveAttribute(name, value);
      }
      const masking = await field.evaluate((element) => getComputedStyle(element).getPropertyValue("-webkit-text-security"));
      expect(masking).toBe("disc");
      await field.fill("secret");
      await expect(field).toHaveValue("secret");
    }
  });
}
```

- [ ] **Step 2: Run it (RED)**

```bash
npm run build && npx playwright test e2e/password-fields.spec.ts
```

Expected: 3 failures: `toHaveCount(0)` receives 1 on `/decrypt`, and `type` is `"password"` instead of `"text"`.

- [ ] **Step 3: The component**

`src/components/ui/secret-input.tsx`:

```tsx
import * as React from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A password field that browsers and password managers don't offer to save: a masked text input
 * (browsers ignore autocomplete="off" on type="password") plus the managers' opt-out attributes.
 */
function SecretInput({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <Input
      {...props}
      type="text"
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      data-1p-ignore="true"
      data-lpignore="true"
      data-bwignore="true"
      data-form-type="other"
      className={cn("[-webkit-text-security:disc]", className)}
    />
  );
}

export { SecretInput };
```

- [ ] **Step 4: Use it in Decrypt and Encrypt**

In `src/pages/DecryptPage.tsx` and `src/pages/EncryptPage.tsx`:
- remove `import { Input } from "@/components/ui/input";` and add `import { SecretInput } from "@/components/ui/secret-input";` after the `Label` import;
- replace each password `<Input` with `<SecretInput` and delete its `type="password"` and `autoComplete=…` lines (one field in Decrypt: `id="password"`; two in Encrypt: `id="password"` and `id="confirm"`). All other props stay. Example, Decrypt after the change:

```tsx
            <SecretInput
              id="password"
              disabled={job.busy}
              placeholder="Document open password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby="password-help"
            />
```

`grep -n "Input" src/pages/DecryptPage.tsx src/pages/EncryptPage.tsx` must show only `SecretInput` (plus `Label`).

- [ ] **Step 5: Run (GREEN)**

```bash
npm run lint && npm test && npm run test:e2e
```

Expected: everything passes, including the 3 password-field tests.

- [ ] **Step 6: Commit and push**

```bash
git add src/components/ui/secret-input.tsx src/pages/DecryptPage.tsx src/pages/EncryptPage.tsx e2e/password-fields.spec.ts
git commit -m "feat: password fields browsers and password managers don't offer to save

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NvYC5VwsQMEVA9j9Scdfc1"
git push
```

---

### Task 15: Tool specs and screenshots

**Files:**
- Create: `e2e/decrypt.spec.ts`, `e2e/encrypt.spec.ts`, `e2e/merge.spec.ts`, `e2e/extract.spec.ts`, `e2e/compress.spec.ts`, `e2e/info.spec.ts`, `e2e/screenshots.spec.ts`

**Interfaces:**
- Consumes: `chooseFiles`, `download`, `inspectPdf`, `tabTo`, `TOOL_PATHS` (Task 13); fixture names (Task 13); the exact UI copy from the spec. No app code changes in this task: if a test fails, the app or the spec is wrong — report it, don't loosen the test.
- Produces: the automated coverage listed in `docs/todo.md` (Task 16) and `test-results/screenshots/<page>-<theme>-<width>.png` (28 files).

- [ ] **Step 1: Decrypt and Encrypt**

`e2e/decrypt.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

import { chooseFiles, download, inspectPdf } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.goto("/decrypt");
});

test("wrong password, then the right one, decrypts the same file", async ({ page }) => {
  await chooseFiles(page, "protected.pdf");
  await page.getByLabel("Password", { exact: true }).fill("wrong");
  await page.getByRole("button", { name: "Decrypt", exact: true }).click();
  await expect(page.getByText("Incorrect password. Check it and try again.")).toBeVisible();

  await page.getByLabel("Password", { exact: true }).fill("open-me");
  await page.getByRole("button", { name: "Decrypt", exact: true }).click();
  await expect(page.getByText("Your PDF is ready")).toBeVisible();
  const file = await download(page, "Download decrypted PDF");
  expect(file.filename).toBe("protected-d.pdf");
  expect(await inspectPdf(file.path)).toMatchObject({ encrypted: false, pageCount: 3 });
});

test("an empty password removes owner restrictions", async ({ page }) => {
  await chooseFiles(page, "restricted.pdf");
  await page.getByRole("button", { name: "Decrypt", exact: true }).click();
  const file = await download(page, "Download decrypted PDF");
  expect(await inspectPdf(file.path)).toMatchObject({ encrypted: false });
});

test("non-PDF files are refused", async ({ page }) => {
  await page.locator('input[type="file"]').setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hi") });
  await expect(page.getByText("File must be a PDF.")).toBeVisible();
});

test("decrypt another file and back to home", async ({ page }) => {
  await chooseFiles(page, "restricted.pdf");
  await page.getByRole("button", { name: "Decrypt", exact: true }).click();
  await page.getByRole("button", { name: "Decrypt another file" }).click();
  await expect(page.getByText("Drag and drop a PDF here")).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  await chooseFiles(page, "restricted.pdf");
  await page.getByRole("button", { name: "Decrypt", exact: true }).click();
  await page.getByRole("link", { name: "Back to home" }).click();
  await expect(page).toHaveURL("/");
});

test("the wasm loads only when a job runs", async ({ page }) => {
  const wasm: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith(".wasm")) wasm.push(request.url());
  });
  await page.reload();
  await page.waitForLoadState("networkidle");
  expect(wasm).toHaveLength(0);
  await chooseFiles(page, "restricted.pdf");
  await page.getByRole("button", { name: "Decrypt", exact: true }).click();
  await expect(page.getByText("Your PDF is ready")).toBeVisible();
  expect(wasm).toHaveLength(1);
});

test("files over 250 MB are refused before any work", async ({ page }) => {
  await chooseFiles(page, "oversize.pdf");
  await expect(page.getByText(/Files must be 250 MB or less in total \(you selected 260 MB\)\./)).toBeVisible();
  await expect(page.getByRole("button", { name: "Decrypt", exact: true })).toBeDisabled();
});
```

`e2e/encrypt.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

import { chooseFiles, download, inspectPdf } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.goto("/encrypt");
});

async function fillPasswords(page: import("@playwright/test").Page, password: string, confirm: string) {
  await page.getByLabel("Password to open", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(confirm);
}

test("password validation", async ({ page }) => {
  await chooseFiles(page, "plain.pdf");
  await page.getByRole("button", { name: "Encrypt", exact: true }).click();
  await expect(page.getByText("Password is required.")).toBeVisible();
  await fillPasswords(page, "a", "b");
  await page.getByRole("button", { name: "Encrypt", exact: true }).click();
  await expect(page.getByText("Passwords don't match.")).toBeVisible();
});

test("protects with the password and the chosen permissions", async ({ page }) => {
  await chooseFiles(page, "plain.pdf");
  await fillPasswords(page, "secret", "secret");
  await page.getByLabel("Allow printing").click();
  await page.getByRole("button", { name: "Encrypt", exact: true }).click();
  await expect(page.getByText("Your PDF is protected")).toBeVisible();
  const file = await download(page, "Download protected PDF");
  expect(file.filename).toBe("plain-protected.pdf");
  await expect(inspectPdf(file.path)).rejects.toMatchObject({ code: "INVALID_PASSWORD" });
  const inspection = await inspectPdf(file.path, "secret");
  expect(inspection).toMatchObject({ encrypted: true, pageCount: 5 });
  expect(inspection.capabilities).toMatchObject({ printhigh: false, extract: true, modifyother: true });
});

test("password-protected input is sent to Decrypt", async ({ page }) => {
  await chooseFiles(page, "protected.pdf");
  await fillPasswords(page, "x", "x");
  await page.getByRole("button", { name: "Encrypt", exact: true }).click();
  await expect(page.getByText("This PDF is password-protected. Remove its password with Decrypt first.")).toBeVisible();
  await page.getByRole("link", { name: "Go to Decrypt" }).click();
  await expect(page).toHaveURL("/decrypt");
});

test("restriction-only input is accepted", async ({ page }) => {
  await chooseFiles(page, "restricted.pdf");
  await fillPasswords(page, "x", "x");
  await page.getByRole("button", { name: "Encrypt", exact: true }).click();
  await expect(page.getByText("Your PDF is protected")).toBeVisible();
});
```

- [ ] **Step 2: Merge and Extract**

`e2e/merge.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

import { chooseFiles, download, inspectPdf, tabTo } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.goto("/merge");
});

const rows = (page: import("@playwright/test").Page) => page.locator("ol > li");

test("files append, reorder and remove; merge keeps the chosen order", async ({ page }) => {
  await chooseFiles(page, "plain.pdf");
  await expect(page.getByRole("button", { name: "Merge", exact: true })).toBeDisabled();
  await chooseFiles(page, "two-pages.pdf");
  await expect(rows(page)).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Move plain.pdf up" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Move two-pages.pdf down" })).toBeDisabled();

  await page.getByRole("button", { name: "Move two-pages.pdf up" }).click();
  await expect(rows(page).first()).toContainText("two-pages.pdf");
  await page.getByRole("button", { name: "Merge", exact: true }).click();
  await expect(page.getByText("2 files, 7 pages.")).toBeVisible();
  const file = await download(page, "Download merged PDF");
  expect(file.filename).toBe("merged.pdf");
  expect(await inspectPdf(file.path)).toMatchObject({ pageCount: 7, encrypted: false, firstPageSize: "A4" });
});

test("restricted inputs get a note that restrictions are dropped", async ({ page }) => {
  await chooseFiles(page, "plain.pdf", "restricted.pdf");
  await page.getByRole("button", { name: "Merge", exact: true }).click();
  await expect(page.getByText("Restrictions from the original files aren't kept in the merged PDF.")).toBeVisible();
});

test("problem files are named, and the error clears when the file is removed", async ({ page }) => {
  await chooseFiles(page, "plain.pdf", "protected.pdf");
  await page.getByRole("button", { name: "Merge", exact: true }).click();
  await expect(page.getByText("“protected.pdf” is password-protected. Remove its password with Decrypt first.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to Decrypt" })).toBeVisible();
  await page.getByRole("button", { name: "Remove protected.pdf" }).click();
  await expect(page.getByText(/is password-protected/)).toHaveCount(0);

  await chooseFiles(page, "not-a-pdf.pdf");
  await page.getByRole("button", { name: "Merge", exact: true }).click();
  await expect(page.getByText("“not-a-pdf.pdf” isn't a readable PDF.")).toBeVisible();
  await page.getByRole("button", { name: "Remove not-a-pdf.pdf" }).click();

  await chooseFiles(page, "empty.pdf");
  await page.getByRole("button", { name: "Merge", exact: true }).click();
  await expect(page.getByText("“empty.pdf” is empty.")).toBeVisible();
});

test("keyboard: Tab reaches the drop zone and every row button", async ({ page }) => {
  const zone = page.locator('div[role="button"]', { hasText: "Drag and drop PDFs here" });
  await tabTo(page, zone);
  const chooser = page.waitForEvent("filechooser");
  await page.keyboard.press("Enter");
  await (await chooser).setFiles([]);
  await chooseFiles(page, "plain.pdf", "two-pages.pdf");
  for (const name of ["Move plain.pdf down", "Remove plain.pdf", "Move two-pages.pdf up", "Remove two-pages.pdf"]) {
    await tabTo(page, page.getByRole("button", { name }));
  }
});
```

`e2e/extract.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

import { chooseFiles, download, inspectPdf } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.goto("/extract");
});

test("shows the page count and extracts loosely typed ranges", async ({ page }) => {
  const extract = page.getByRole("button", { name: "Extract", exact: true });
  await expect(extract).toBeDisabled();
  await chooseFiles(page, "plain.pdf");
  await expect(page.getByText("This PDF has 5 pages.")).toBeVisible();
  await page.getByLabel("Pages").fill(" 1 - 2 , Z ");
  await extract.click();
  await expect(page.getByText("Extracted 3 pages in your browser.")).toBeVisible();
  const file = await download(page, "Download extracted pages");
  expect(file.filename).toBe("plain-pages.pdf");
  expect(await inspectPdf(file.path)).toMatchObject({ pageCount: 3 });
});

test("invalid and out-of-range pages", async ({ page }) => {
  await chooseFiles(page, "plain.pdf");
  await expect(page.getByText("This PDF has 5 pages.")).toBeVisible();
  await page.getByLabel("Pages").fill("abc");
  await page.getByRole("button", { name: "Extract", exact: true }).click();
  await expect(page.getByText("Enter pages like 1-3,7 or 5-z.")).toBeVisible();
  await page.getByLabel("Pages").fill("9");
  await page.getByRole("button", { name: "Extract", exact: true }).click();
  await expect(page.getByText("Could not process this PDF.")).toBeVisible();
  await expect(page.getByText(/out of range/)).toBeVisible();
});

test("password-protected input is sent to Decrypt and Extract stays disabled", async ({ page }) => {
  await chooseFiles(page, "protected.pdf");
  await expect(page.getByText("This PDF is password-protected. Remove its password with Decrypt first.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to Decrypt" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Extract", exact: true })).toBeDisabled();
});
```

- [ ] **Step 3: Compress and Info**

`e2e/compress.spec.ts`:

```ts
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

import { chooseFiles, download } from "./helpers";

test("compresses, and a second pass reports no smaller version", async ({ page }) => {
  await page.goto("/compress");
  await chooseFiles(page, "plain.pdf");
  await page.getByRole("button", { name: "Compress", exact: true }).click();
  await expect(page.getByText("Your PDF is smaller")).toBeVisible();
  await expect(page.getByText(/ → .*(−\d+%|less than 1% smaller)/)).toBeVisible();
  const file = await download(page, "Download compressed PDF");
  expect(file.filename).toBe("plain-compressed.pdf");

  await page.getByRole("button", { name: "Compress another file" }).click();
  // Playwright saves downloads under a random name, so re-upload under the real one.
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: file.filename, mimeType: "application/pdf", buffer: await readFile(file.path) });
  await page.getByRole("button", { name: "Compress", exact: true }).click();
  await expect(page.getByText("No smaller version")).toBeVisible();
  await expect(page.getByText(/already as small as qpdf can make it/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Download compressed PDF" })).toHaveCount(0);
});

test("password-protected input is sent to Decrypt", async ({ page }) => {
  await page.goto("/compress");
  await chooseFiles(page, "protected.pdf");
  await page.getByRole("button", { name: "Compress", exact: true }).click();
  await expect(page.getByText("This PDF is password-protected. Remove its password with Decrypt first.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to Decrypt" })).toBeVisible();
});
```

`e2e/info.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";

import { chooseFiles } from "./helpers";

async function inspect(page: Page, name: string) {
  await page.goto("/info");
  await chooseFiles(page, name);
  await page.getByRole("button", { name: "Inspect", exact: true }).click();
}

const row = (page: Page, label: string) => page.locator("dl > div").filter({ has: page.locator("dt", { hasText: label }) }).locator("dd");

test("plain PDF details", async ({ page }) => {
  await inspect(page, "plain.pdf");
  await expect(page.getByText("Plain sample").first()).toBeVisible();
  await expect(row(page, "Author")).toHaveText("Test Author");
  await expect(row(page, "Created")).not.toBeEmpty();
  await expect(row(page, "Pages")).toHaveText("5");
  await expect(row(page, "PDF version")).toHaveText("1.7");
  await expect(row(page, "Page size")).toContainText("Letter");
  await expect(row(page, "Encryption")).toHaveText("Not encrypted");
  await expect(row(page, "Fast web view")).toHaveText("No");
  await expect(row(page, "Attachments")).toHaveText("None");
  await page.getByRole("button", { name: "Inspect another file" }).click();
  await expect(page.getByText("Drag and drop a PDF here")).toBeVisible();
});

test("restriction-only PDF shows its restrictions", async ({ page }) => {
  await inspect(page, "restricted.pdf");
  await expect(row(page, "Encryption")).toContainText("Restrictions only (opens without a password)");
  await expect(row(page, "Encryption")).toContainText("AES-256");
  await expect(row(page, "Not allowed")).toContainText("Printing");
});

test("linearized PDF shows the badge", async ({ page }) => {
  await inspect(page, "linearized.pdf");
  await expect(row(page, "Fast web view")).toHaveText("Linearized");
});

test("password-protected input is sent to Decrypt", async ({ page }) => {
  await inspect(page, "protected.pdf");
  await expect(page.getByText("This PDF is password-protected. Remove its password with Decrypt first.")).toBeVisible();
});
```

- [ ] **Step 4: Screenshots**

`e2e/screenshots.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

import { TOOL_PATHS } from "./helpers";

// Saves screenshots for the owner's visual review (docs/todo.md); asserts only that pages render.
for (const theme of ["light", "dark"] as const) {
  for (const width of [375, 1280]) {
    test(`screenshots ${theme} ${width}px`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width, height: width === 375 ? 812 : 800 });
      for (const path of ["/", ...TOOL_PATHS]) {
        await page.goto(path);
        await expect(page.locator("main h1")).toBeVisible();
        const name = path === "/" ? "home" : path.slice(1);
        await page.screenshot({ path: `test-results/screenshots/${name}-${theme}-${width}.png`, fullPage: true });
      }
    });
  }
}
```

- [ ] **Step 5: Run the whole suite twice**

```bash
npm run lint && npm test && npm run test:e2e && npx playwright test
```

Expected: both Playwright runs report **39 passed** (38 chromium + 1 webkit) with no flaky retries; `ls test-results/screenshots | wc -l` → 28. Open two screenshots (e.g. `home-dark-375.png`, `merge-light-1280.png`) and confirm they show the real page.

- [ ] **Step 6: Commit and push**

```bash
git add e2e
git commit -m "test: Playwright specs for every tool, plus screenshots for visual review

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NvYC5VwsQMEVA9j9Scdfc1"
git push
```

---

### Task 16: Docs and the owner checklist

**Files:**
- Modify: `docs/todo.md` (full rewrite), `README.md`, `AGENTS.md`

**Interfaces:**
- Consumes: spec file names and the test titles from Tasks 13–15.
- Produces: the release gate used by Task 17: `npm run test:e2e` passes **and** every owner box in `docs/todo.md` is ticked.

- [ ] **Step 1: Rewrite `docs/todo.md`**

Replace the whole file with (all boxes unticked; the owner ticks them):

````markdown
# Release checks for 1.0.0

Release 1.0.0 (plan Task 17) starts only when **both** are true:

1. `npm run test:e2e` passes (all automated checks below).
2. Every owner box at the bottom is ticked (`- [x]`).

## Setup

```bash
cd pdf-mss-io
nvm use                                  # Node 24
npm install
npx playwright install chromium webkit   # once, ~300 MB, outside the repo
npm run test:e2e                         # builds, then runs every browser check
```

After a run, the test PDFs are in `e2e/.fixtures/`: `plain.pdf` (5 pages, title "Plain sample"),
`protected.pdf` (password `open-me`), `restricted.pdf` (opens without a password, printing disabled),
and the screenshots are in `test-results/screenshots/`.

## Automated checks (Playwright)

Covered by `npm run test:e2e`. Nothing to tick here: a passing run is the proof.

| Check | Spec file |
|---|---|
| Header logo + "PDF Toolbox", Home link, theme toggle, footer text, six tool cards | `e2e/shell.spec.ts` |
| Theme toggle survives a reload with no flash; follows the system theme when nothing is saved | `e2e/shell.spec.ts` |
| Every tool URL loads directly | `e2e/shell.spec.ts` |
| Home page loads no `.wasm` | `e2e/shell.spec.ts` |
| Nothing overflows sideways at 375 px (home and every tool) | `e2e/shell.spec.ts` |
| A page whose code fails to load shows "Something went wrong" inside the header and footer | `e2e/shell.spec.ts` |
| Decrypt: wrong → right password on the same file, `protected-d.pdf` opens without a password, empty password removes restrictions, non-PDF refused, "Decrypt another file" / "Back to home", wasm loads on the first job only, over 250 MB refused | `e2e/decrypt.spec.ts` |
| Encrypt: password validation, `plain-protected.pdf` needs the password and denies printing, password-protected input → Decrypt link, restriction-only input accepted | `e2e/encrypt.spec.ts` |
| Merge: append, reorder, remove, disabled first-up/last-down, order kept in `merged.pdf`, restrictions note, protected/unreadable/empty files named, error clears on remove, keyboard path | `e2e/merge.spec.ts` |
| Extract: page count, loose ranges → `plain-pages.pdf` with 3 pages, invalid and out-of-range messages, protected input → Decrypt link | `e2e/extract.spec.ts` |
| Compress: smaller result with sizes, second pass → "No smaller version" without a download, protected input → Decrypt link | `e2e/compress.spec.ts` |
| Info: plain PDF details, restriction badges, Linearized badge, protected input → Decrypt link | `e2e/info.spec.ts` |
| No `type="password"` input anywhere; password fields masked and carry the password-manager opt-outs | `e2e/password-fields.spec.ts` |
| Offline: service worker active and wasm cached, then with the server stopped `/info` and `/decrypt` load and decrypting works (Chromium and WebKit) | `e2e/offline.spec.ts` |

## Owner checks

Only a person can check these. Tick each box after checking it.

- [ ] Screenshots in `test-results/screenshots/` (light and dark, 375 px and 1280 px) look right and match the old app's style.
- [ ] The favicon (dark tile, white document, open padlock) shows in a real browser tab, in light and dark browser themes.
- [ ] Encrypt `plain.pdf` with password `secret` and printing unticked: your PDF viewer asks for `secret` and blocks printing.
- [ ] Type a password in Decrypt and in Encrypt and submit: neither the browser nor your password manager offers to save it.
- [ ] Open every tool once in your everyday browser (if it isn't Chrome): it works the same.

Phone (deploy `dist/` somewhere with HTTPS; `npm run preview -- --host` on the same Wi-Fi works for the non-offline checks):

- [ ] Add to Home Screen → opens full-screen with the padlock icon.
- [ ] Encrypt a ~100 MB PDF: works, or the memory message appears (if it fails, tell Claude to lower the limits).
- [ ] Encrypt a ~250 MB PDF: works, or the memory message appears (same).
- [ ] Airplane mode → open from the home screen → Decrypt works.
- [ ] Every box above is ticked.
````

- [ ] **Step 2: README**

In `README.md`:
- In the `## Scripts` code block, after the `npm test` line add:
  ```
  npm run test:e2e  # browser tests with Playwright (builds first)
  ```
  and after the block add: "Before the first `npm run test:e2e`, install the browsers once: `npx playwright install chromium webkit` (~300 MB, outside the repo)."
- In `## Stack`, add "Playwright (E2E)" after "Vitest 5".
- Replace the `## Release checks` paragraph with: "Release 1.0.0 needs `npm run test:e2e` to pass and every owner box in [docs/todo.md](docs/todo.md) ticked."

- [ ] **Step 3: AGENTS.md**

In `AGENTS.md`:
- In `## Map`, add these lines in place (keep alignment):
  ```
  src/components/RouteError.tsx  error screen; mounted on a pathless route inside AppShell (src/router.ts)
  src/components/ui/secret-input.tsx  password field browsers/password managers don't save
  e2e/                      Playwright specs (one per tool + shell, offline, password fields, screenshots)
  playwright.config.ts      E2E config: vite preview :4173, chromium all specs, webkit offline spec only
  ```
- In `## UI conventions`, add a bullet: "Password fields use `SecretInput`, never `<input type=\"password\">` (browsers ignore `autocomplete=\"off\"` and offer to save). Trade-off: screen readers may read the typed characters."
- Add a new section before `## Versions`:
  ```
  ## E2E tests

  - `npm run test:e2e` builds, starts `vite preview` on :4173 and runs `e2e/` with Playwright. Install
    browsers once with `npx playwright install chromium webkit`.
  - Fixtures are generated fresh by `e2e/global-setup.ts` into `e2e/.fixtures/` (git-ignored).
    Downloads are verified with `inspectPdf()` (real qpdf in Node), not just by file name.
  - Service workers are blocked by default (they would bypass `page.route()`); `offline.spec.ts`
    re-enables them, starts its own preview server on a free port, waits for the cached wasm, then
    stops the server. `context.setOffline()` breaks navigation in WebKit, so don't use it.
  - The error boundary must stay on the pathless route in `src/router.ts`: React Router ignores a lazy
    route's own `ErrorBoundary` when its import fails (pinned by `shell.spec.ts`).
  - New tool → new `e2e/<tool>.spec.ts` covering its messages and verifying its downloads.
  ```
- In `## Before you finish`, change the command block to `npm run lint && npm test && npm run build`
  followed by a new line `npm run test:e2e   # for any UI or behavior change`, and change the
  paragraph after it to: "Checks only a person can do are the owner boxes in `docs/todo.md`; only the
  owner ticks them. Never start a release unless `npm run test:e2e` passes and every box is ticked."

- [ ] **Step 4: Verify**

```bash
npm run lint && npm test && npm run test:e2e
grep -c -- '- \[ \]' docs/todo.md   # 10
grep -o '](\S*)' README.md AGENTS.md
```

Expected: all green; 10 unticked owner boxes; every relative link points at an existing file (`CHANGELOG.md` is created in Task 17).

- [ ] **Step 5: Commit and push**

```bash
git add docs/todo.md README.md AGENTS.md
git commit -m "docs: E2E tests, password fields and the slimmer owner checklist

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NvYC5VwsQMEVA9j9Scdfc1"
git push
```

---

### Task 17: Release 1.0.0

**Files:**
- Create: `CHANGELOG.md`

**Interfaces:**
- Consumes: the verified branch from Task 12.
- Produces: PR to `main`, tag `v1.0.0`, GitHub release `v1.0.0` with `pdf-toolbox-1.0.0.zip`.

Steps 2–4 publish or change `main`. **Ask the owner before each one** and wait for a yes.

- [ ] **Step 0: Owner checks gate**

The release starts only when the automated checks pass **and** every owner box in `docs/todo.md` is ticked:

```bash
npm run test:e2e
grep -n -- '- \[ \]' docs/todo.md && echo "STOP: unticked owner checks" || echo "all owner checks ticked"
```

Expected: Playwright all green, then `all owner checks ticked`. Otherwise stop and report the failures or the unticked lines to the owner.

- [ ] **Step 1: Changelog**

`CHANGELOG.md`:

```markdown
# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [1.0.0] - YYYY-MM-DD

First release of the static, client-side PDF Toolbox (replaces the Bun server app).

### Added

- Decrypt, Encrypt, Merge, Extract pages, Compress and Info tools, all running in the browser with
  qpdf 12.4.2 compiled to WebAssembly (`@mssio/qpdf-wasm` 1.0.0).
- Installable PWA that works offline after the first visit.
- 250 MB combined size limit per operation, with a warning above 100 MB on phones.

### Changed

- PDFs and passwords never leave the device; the server, upload limit and 15-minute download links
  are gone.

[1.0.0]: https://github.com/mssio/pdf-mss-io/releases/tag/v1.0.0
```

Replace `YYYY-MM-DD` with the release date (the day the tag is created). Commit and push:

```bash
git add CHANGELOG.md
git commit -m "docs: changelog for 1.0.0

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NvYC5VwsQMEVA9j9Scdfc1"
git push
```

- [ ] **Step 2: Pull request to `main` (owner approval)**

```bash
gh pr create --base main --head port-vite-wasm --title "PDF Toolbox 1.0.0: static Vite + WASM app" --body "$(cat <<'EOF'
Rebuilds the PDF Toolbox as a static Vite + React Router app with six client-side tools powered by
@mssio/qpdf-wasm 1.0.0, installable and offline-capable.

- Spec: docs/superpowers/specs/2026-10-06-vite-wasm-port-design.md
- Plan: docs/superpowers/plans/2026-10-06-vite-wasm-port.md
- Verification: see Task 12 results in the final report.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01NvYC5VwsQMEVA9j9Scdfc1
EOF
)"
```

The owner reviews and merges the PR (or approves a merge with `gh pr merge --merge`).

- [ ] **Step 3: Tag `v1.0.0` on `main` (owner approval)**

```bash
git switch main
git pull --ff-only
node -p "require('./package.json').version"   # must print 1.0.0
git tag -a v1.0.0 -m "PDF Toolbox 1.0.0"
git push origin v1.0.0
```

- [ ] **Step 4: GitHub release with the built site (owner approval)**

```bash
rm -rf dist && npm ci && npm run build
(cd dist && zip -qr ../pdf-toolbox-1.0.0.zip .)
awk '/^## \[1.0.0\]/{f=1;next} /^## \[|^\[1.0.0\]:/{f=0} f' CHANGELOG.md > /tmp/release-notes-1.0.0.md
gh release create v1.0.0 pdf-toolbox-1.0.0.zip --title "PDF Toolbox 1.0.0" --notes-file /tmp/release-notes-1.0.0.md
rm pdf-toolbox-1.0.0.zip
```

Expected: `gh release view v1.0.0` lists `pdf-toolbox-1.0.0.zip`. Unzipping it gives `index.html`,
`sw.js`, `manifest.webmanifest` and `assets/` with `qpdf-*.wasm`; that folder is what the owner hosts.
