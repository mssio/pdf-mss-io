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

## PWA notes

- `vite-plugin-pwa` (`vite.config.ts`) uses `registerType: 'prompt'` with no prompt UI (`registerSW({ immediate: true })`
  without callbacks). A new deployment is used after every tab of the app has been closed and the app is
  opened again; open pages are never reloaded.
- Workbox precaches `**/*.{js,css,html,svg,png,ico,wasm,webmanifest}` with
  `maximumFileSizeToCacheInBytes: 3_000_000`. qpdf's wasm is ~2.2 MB; if an asset grows past 3 MB the
  build fails. Raise the limit deliberately, never drop the wasm from the precache.
- `navigateFallback: '/index.html'` makes every tool URL work offline. `start_url` and `scope` are
  `/`, so the app must be hosted at the domain root.
- Icons come from `public/favicon.svg`; run `npm run icons` after changing it and commit the output.

## Known package issue

`@mssio/qpdf-wasm` 1.0.0 (qpdf 12.4.2) runs out of wasm memory on large inputs: encrypt threw
`std::bad_alloc` at 400 MB and at 600 MB resolved with a near-empty output instead of rejecting.
That's why `assertOutput()` guards every download and why `MAX_TOTAL_BYTES` is 250 MB. Re-check
both if the package is upgraded.

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

Browser, offline and phone checks are listed in `docs/todo.md`. Only the owner ticks them. When a
task finishes, mark its section `(ready)`; never start a release while any box is unticked.

## Workflow

Commit each logical change and push right away on a feature branch, not `main`. Merging to `main`,
tagging and creating releases need the owner's go-ahead.
