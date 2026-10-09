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
- **Size limit:** `MAX_TOTAL_BYTES` (250 MB) and the phone hard limit `PHONE_MAX_BYTES` (250 MB, separate so it can be lowered) in `src/lib/limits.ts`
  are the only source of these numbers.

## Map

```
src/tools.ts              tool registry → routes, header links, home cards
src/router.ts             createBrowserRouter: AppShell, home, one lazy route per tool
src/main.tsx              entry (the service worker is registered by useAppUpdate)
src/components/           AppShell, PdfFileDropzone, ToolPage, ResultCard, ErrorBox, SizeNotice
src/components/RouteError.tsx  error screen; mounted on a pathless route inside AppShell (src/router.ts)
src/pages/NotFoundPage.tsx  catch-all "Page not found" route inside AppShell
src/components/ui/        shadcn primitives (new-york); edit sparingly, keep tokens
src/components/ui/secret-input.tsx  password field browsers/password managers don't save
src/components/ui/progress.tsx  shadcn Progress; passes `value` to Radix so `aria-valuenow` is set
src/pages/                HomePage + one <Name>Page.tsx per tool (exports `Component`)
src/lib/qpdf.ts           getQpdf, ensureNoOpenPassword, assertOutput, describeQpdfError, logWarnings
src/lib/use-qpdf-job.ts   busy/error state for one job; drops stale results
src/lib/job-progress.ts   JobStatusState; turns qpdf write progress into status (drops stale jobs)
src/lib/update-check.ts   when to check for a new deployment; whether to show the update dialog
src/lib/job-activity.ts   is any job running (the update prompt never reloads mid-job)
src/lib/use-app-update.ts registers the service worker; update prompt state
src/components/UpdatePrompt.tsx  "Update available" dialog + footer button
src/lib/offline-status.ts pure: offline state from the SW lifecycle + precache contents (parses sw.js's list)
src/lib/use-offline-status.ts  reads the registration and caches; polls while downloading
src/components/OfflineStatusLink.tsx  footer "Ready offline" / "Downloading…" link → /offline
src/pages/OfflinePage.tsx /offline: download progress, file list
src/lib/use-blob-url.ts   owns the download blob URL and revokes it
src/lib/crash-guard.ts    sessionStorage note while a job runs; src/components/CrashNotice.tsx explains a mid-job reload
src/components/JobStatus.tsx  step + elapsed time (and a progress bar while qpdf writes) under the submit button
src/app-version.d.ts      __APP_VERSION__ (package.json version, injected by vite.config.ts; shown in the footer)
                          and __APP_BUILD_LABEL__ (test builds only; src/lib/build-label.ts)
src/lib/*.ts              pure helpers (filename, format, limits, pdf-files, page-ranges,
                          passwords, merge-list, pdf-info), each with a *.test.ts
src/test/make-pdf.ts      builds valid PDFs for tests
public/favicon.svg        source of every icon (`npm run icons` regenerates the PNGs/ICO)
e2e/                      Playwright specs (one per tool + shell, offline, password fields, screenshots)
playwright.config.ts      E2E config: vite preview :4173, chromium all specs, webkit offline spec only
docs/todo.md              release gate: automated-check table + owner boxes for the current release
docs/notes/<ver>-plan.md  plans for future versions; their owner checks move into todo.md when a release starts
```

## qpdf rules

- Get the instance with `getQpdf()` (lazy, shared, retries after a failed load). Never import
  `@mssio/qpdf-wasm` as a value in app code; type imports are fine. Tests may import it.
- Pass `File` objects. Byte inputs (`Uint8Array`/`ArrayBuffer`) are **transferred** to the worker
  and become empty; pass `bytes.slice()` if you still need them (e.g. `qpdf.info(output.slice())`
  before showing `output` as a download).
- Run jobs through `useQpdfJob().run(async (qpdf, onProgress) => …, { label: "Encrypting…", sizeBytes })`; it maps
  errors with `describeQpdfError`, ignores results and progress after `reset()` or unmount, shows the step via
  `<JobStatus status={job.status} />`, and enforces limits via `runWithTimeLimits` (`src/lib/run-job.ts`): the engine must load within
  `ENGINE_LOAD_TIMEOUT_MS`; the job then has `jobTimeoutMs(sizeBytes)`, except that while qpdf reports 0–99%
  each report allows `STALL_TIMEOUT_MS` (30 s) until the next, and 100% restores `jobTimeoutMs`;
  on any timeout the stuck engine is replaced (`resetQpdf()`). `label` and `sizeBytes` are required:
  always pass the real input size. Pass `durationMs={job.lastDurationMs}` to `ResultCard` ("Finished in m:ss.").
- Pass `onProgress` **only** to the qpdf call that writes the download (`decrypt`, `encrypt`, `merge`,
  `selectPages`, `compress`): never to `ensureNoOpenPassword`, `info()` or `run()`. `JobStatus` shows a bar for
  0–99% and "Finishing…" after 100%; a second writing call would restart the bar.
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
- Password fields use `SecretInput`, never `<input type="password">` (browsers ignore `autocomplete="off"` and offer to save). Trade-off: screen readers may read the typed characters.

## Adding a tool

1. Pure logic in `src/lib/<thing>.ts` + `<thing>.test.ts` (TDD).
2. `src/pages/<Name>Page.tsx` exporting `function Component()`, composed from `ToolPage`,
   `PdfFileDropzone`, `SizeNotice`, `ErrorBox`, `ResultCard`, `useQpdfJob`, `useBlobUrl`. Call
   `ensureNoOpenPassword` first unless the tool is about passwords.
3. Registry entry in `src/tools.ts` (id, path, title, navLabel, description, lucide icon, `load`).
4. Integration test for the qpdf call in `src/lib/qpdf.integration.test.ts`.
5. `npm run build` and confirm the new chunk appears in `dist/sw.js`'s precache list.

## PWA notes

- `vite-plugin-pwa` (`vite.config.ts`) uses `registerType: 'prompt'`. `useAppUpdate` (`src/lib/use-app-update.ts`,
  mounted by `AppShell`) registers the worker and checks for a new deployment while online: hourly, on `online`, and
  on returning to the foreground at most once a minute (`src/lib/update-check.ts`). A downloaded update shows the
  "Update available" dialog; Later moves it to a footer button. Nothing reloads while a job runs
  (`src/lib/job-activity.ts`). Closing every tab and reopening still picks up a new version.
- Hosting: `sw.js` and `index.html` must not be long-cached by a CDN (`Cache-Control: no-cache` or a short edge
  cache), or the update check sees a stale version. Hashed `assets/` files can be cached forever.
- `clientsClaim: true`: the first install controls the open page as soon as it finishes. The footer shows the
  offline state (`src/lib/offline-status.ts`); `/offline` shows the download. The state parses the precache list
  from `sw.js` (`{url:"…",revision:…}`); if the plugin changes that format, `offline-status.test.ts` and
  `e2e/update.spec.ts` must be updated.
- Workbox precaches `**/*.{js,css,html,svg,png,ico,wasm,webmanifest}` with
  `maximumFileSizeToCacheInBytes: 3_000_000`. qpdf's wasm is ~2.2 MB; if an asset grows past 3 MB the
  build fails. Raise the limit deliberately, never drop the wasm from the precache.
- `navigateFallback: '/index.html'` makes every tool URL work offline. `start_url` and `scope` are
  `/`, so the app must be hosted at the domain root.
- Icons come from `public/favicon.svg`; run `npm run icons` after changing it and commit the output.

## Known package issue

`@mssio/qpdf-wasm` 1.0.0 (qpdf 12.4.2) runs out of wasm memory on large inputs: encrypt threw
`std::bad_alloc` at 400 MB and at 600 MB resolved with a near-empty output instead of rejecting.
That's why `assertOutput()` guards every download and why `MAX_TOTAL_BYTES` is 250 MB. 1.1.0 ships the
byte-identical `qpdf.wasm` (same SHA-256), so this still holds. Re-check both if a later upgrade changes the wasm.

## E2E tests

- `npm run test:e2e` builds, starts `vite preview` on :4173 and runs `e2e/` with Playwright. Install
  browsers once with `npx playwright install chromium webkit`.
- Fixtures are generated fresh by `e2e/global-setup.ts` into `e2e/.fixtures/` (git-ignored).
  Downloads are verified with `inspectPdf()` (real qpdf in Node), not just by file name.
- Service workers are blocked by default (they would bypass `page.route()`); `offline.spec.ts`
  re-enables them, starts its own preview server on a free port, waits for the cached wasm, then
  stops the server. `context.setOffline()` breaks navigation in WebKit, so don't use it.
- `update.spec.ts` serves a copy of `dist/` (shared helpers in `e2e/preview-server.ts`), "deploys" a new version by
  rewriting its `sw.js` and `index.html`, and fires `online`.
- The error boundary must stay on the pathless route in `src/router.ts`: React Router ignores a lazy
  route's own `ErrorBoundary` when its import fails (pinned by `shell.spec.ts`).
- Port 4173 must be free (`reuseExistingServer: false`, `--strictPort`). The offline spec kills its server's process group with `process.kill(-pid)`, which is macOS/Linux only.
- New tool → new `e2e/<tool>.spec.ts` covering its messages and verifying its downloads.

## Versions

- Node 24 LTS (`.nvmrc`). Vitest 5 doesn't support Node 25.
- TypeScript is held at `~6.0.3` because typescript-eslint 8.71 supports TypeScript < 6.1. Upgrade
  to 7.x only when typescript-eslint supports it.
- React Router is v8: import from `react-router` (and `react-router/dom` for `RouterProvider`).

## Before you finish

```bash
npm run lint && npm test && npm run build
npm run test:e2e   # for any UI or behavior change
```

Checks only a person can do are the owner boxes in `docs/todo.md`; only the owner ticks them. Never start a release unless `npm run test:e2e` passes and every box is ticked.

## Test builds

Builds served for the owner to try on a device (LAN `vite preview --host`, `tailscale serve`) use
`npm run build:test`: the footer then reads "Version 1.1.0 · test <commit>[-dirty] <MM-DD HH:mm>", so a
cached older build is easy to spot. Release builds use plain `npm run build` (no note).

## Workflow

Commit each logical change and push right away on a feature branch, not `main`. Merging to `main`,
tagging and creating releases need the owner's go-ahead.
