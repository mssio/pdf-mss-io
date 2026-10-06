# PDF Toolbox: port from Bun server to static Vite + WASM app

Date: 2026-10-06
Status: approved in conversation, pending written-spec review

## Goal

Rebuild the PDF Toolbox from `../old_bun` (Bun server + React) in this Vite scaffold as a
**fully static, client-side app**. PDF decryption runs in the browser with qpdf compiled to
WebAssembly (`@mssio/qpdf-wasm`). Files and passwords never leave the device. The output of
`npm run build` is plain HTML/CSS/JS/WASM in `dist/` that the owner hosts themselves.

The UI keeps the old app's look and behavior: same pages, layout, components, theme toggle, and
drop zone. Only copy that referred to the server changes.

## Decisions (from the brainstorming conversation)

| Topic | Decision |
|---|---|
| Hosting | Static `dist/` only. No Docker, no `bin/build.sh`; the owner hosts it. |
| Server features | Dropped: 15-minute download links, cleanup timers/cron, 40 MB upload limit. |
| Routing | Clean URLs (`/`, `/decrypt`) via `createBrowserRouter`. Hosts must rewrite unknown paths to `/index.html` (documented). Once the service worker is installed it serves `index.html` for navigations itself. |
| PDF engine | `@mssio/qpdf-wasm` (qpdf 12.4.2). It owns the Web Worker; the app does not write its own worker. |
| Offline | PWA via `vite-plugin-pwa`: installable, works offline after the first online visit. |
| Package manager | npm. |

## 1. Architecture and layout

**Stack:** Vite 8, React 19, TypeScript (from the scaffold, React Compiler preset kept),
React Router 7 (`createBrowserRouter` + `RouterProvider`), Tailwind 4 via `@tailwindcss/vite`,
`tw-animate-css`, shadcn "new-york" primitives, `lucide-react`, `clsx`, `tailwind-merge`,
`class-variance-authority`, `@radix-ui/react-slot`, `@radix-ui/react-label`, `@mssio/qpdf-wasm`,
`vite-plugin-pwa`.

**Path alias:** `@/*` → `src/*` (tsconfig `paths` + Vite `resolve.alias`).

```
index.html                  title "PDF Toolbox", inline no-flash theme script, favicon + PWA links
public/favicon.svg          new icon (source for all PWA icons)
pwa-assets.config.ts        icon generation config (@vite-pwa/assets-generator)
src/main.tsx                createRoot + RouterProvider + PWA registration
src/router.tsx              AppShell layout route; "/" HomePage; "/decrypt" lazy DecryptPage
src/index.css               ported from old src/client/index.css (background gradients)
src/styles/globals.css      ported unchanged (theme tokens, light/dark)
src/components/AppShell.tsx         ported; footer copy changed
src/components/PdfFileDropzone.tsx  ported unchanged
src/components/ui/{button,card,input,label}.tsx  ported unchanged (select/textarea were unused: dropped)
src/lib/utils.ts            cn()
src/lib/theme.ts            THEME_STORAGE_KEY = "pdf-mss-io-theme" (same key as old app)
src/lib/use-theme.ts        ported unchanged
src/lib/qpdf.ts             getQpdf(): lazy singleton; describeQpdfError(): error → message
src/lib/filename.ts         decryptedFilename(): "a.pdf" → "a-d.pdf"
src/pages/HomePage.tsx      ported; decrypt card copy changed
src/pages/DecryptPage.tsx   ported; fetch replaced with qpdf; blob download
```

Scaffold leftovers removed: `src/App.tsx`, `src/App.css`, `src/assets/*`, `public/icons.svg`,
old `public/favicon.svg`.

**Loading:** `/decrypt` is a lazy route (`lazy` in the route object). `getQpdf()` dynamically imports
`@mssio/qpdf-wasm` and calls `createQpdf()` once, caching the promise. If creation rejects, the
cached promise is cleared so the next attempt retries. The home page never downloads qpdf.

## 2. Decrypt flow, errors, copy

**Flow:**
1. User picks/drops a PDF (dropzone validates type, as before) and enters the password.
2. Submit: read `File` + password from `FormData`. Validate: file present and non-empty
   ("Choose a PDF file."), password non-empty ("Password is required."). Set busy.
3. `const qpdf = await getQpdf(); const { output } = await qpdf.decrypt(file, { password });`
   A `File` input is copied to the worker, so the form's file stays usable for retries.
4. Success: `URL.createObjectURL(new Blob([output], { type: "application/pdf" }))`. Show the
   "Your PDF is ready" card; download button is `<a href={url} download={decryptedFilename(file.name)}>`.
   Reset the form.
5. The blob URL is revoked when the user clicks "Decrypt another file", and on unmount (effect
   cleanup keyed on the URL), which covers "Back to home" and any navigation away.

**Error messages** (same red box as before), produced by `describeQpdfError(error, phase)`:

| Cause | Message |
|---|---|
| No / empty file | Choose a PDF file. |
| Dropped non-PDF | File must be a PDF. |
| Empty password | Password is required. |
| `QpdfError` `INVALID_PASSWORD` | Incorrect password. Check it and try again. |
| `QpdfError` `INVALID_PDF` | This file isn't a readable PDF. |
| Any error while loading the engine (`getQpdf()` rejects) | Couldn't load the PDF engine. Check your connection and reload. |
| Any other error during `decrypt` | Could not decrypt this PDF. (+ `error.message` as a small muted detail line) |

Unencrypted input: qpdf outputs a plain copy; this is allowed (no pre-check with `info()`).

**Copy changes** (everything else identical to the old app):
- Decrypt intro: "Upload an encrypted PDF and enter its password. Decryption runs entirely in your
  browser with `qpdf` compiled to WebAssembly. Your file never leaves your device."
- Decrypt card note (amber shield icon kept): "Your file and password stay on this device. Nothing is uploaded."
- Success card description: "Decrypted in your browser. Download it now; the file isn't stored anywhere."
- Footer: "PDFs are processed locally in your browser. Nothing is uploaded."
- Home decrypt card: "Remove password protection from a PDF, right in your browser with `qpdf`."

## 3. Favicon, docs, testing

**Favicon:** hand-written `public/favicon.svg`: rounded square in the app's primary color, white
document with folded corner and an open padlock. Flat shapes, legible at 16 px.

**README.md** (rewrite): what it is, privacy model, stack, scripts (`dev`, `build`, `preview`,
`test`, `lint`), hosting `dist/` (SPA fallback snippets: nginx `try_files`, Netlify/Cloudflare
Pages `_redirects`, Caddy `try_files`, GitHub Pages `404.html` copy), `.wasm` as `application/wasm`,
`Cache-Control: no-cache` for `index.html` and `sw.js`, CSP needs (`script-src 'wasm-unsafe-eval'`,
`worker-src 'self'`), how to add a tool.

**AGENTS.md** (new), plus `CLAUDE.md` containing only `@AGENTS.md`: purpose and hard constraints
(static only, no backend, files never leave the browser, offline must keep working), file map,
qpdf rules (use `getQpdf()`, map errors via `describeQpdfError`, revoke blob URLs, pass `File`/copies
since byte inputs are transferred), UI conventions (shadcn in `components/ui`, `cn()`, tokens in
`globals.css`, same-key theme script in `index.html`), recipe for adding a tool (route + page + home
card + nav link), PWA notes (precache size limit, update behavior), commands to run before finishing.

**Tests (Vitest, Node environment):**
- `filename.test.ts`: `decryptedFilename` for `a.pdf`, `a.b.PDF`, no extension, trailing dot,
  leading-dot names, paths with `/` and `\`, empty/whitespace → `document-d.pdf`.
- `qpdf.test.ts`: `describeQpdfError` for each code and phase.
- `decrypt.integration.test.ts`: with the real package (runs inline in Node): build a tiny PDF
  in-memory, `encrypt` it, then `decrypt` with the right password → `info()` says not encrypted;
  wrong password → `QpdfError` `INVALID_PASSWORD` → mapped message.

**Manual verification:** `npm run build && npm run preview`: decrypt a real encrypted PDF (wrong
then right password), download name is `*-d.pdf`, theme toggle persists without flash, direct
load of `/decrypt` works, home page network panel shows no `.wasm` request.

## 4. PWA and offline

- `vite-plugin-pwa` (v2, supports Vite 8), `generateSW` strategy, `registerType: "autoUpdate"`,
  registered from `main.tsx` via `virtual:pwa-register`.
- Manifest: name "PDF Toolbox", short_name "PDF Toolbox", `display: "standalone"`, `start_url: "/"`,
  theme/background colors from the light theme tokens.
- Icons generated from `public/favicon.svg` by `@vite-pwa/assets-generator` (minimal 2023 preset):
  64/192/512 px, 512 maskable, 180 px `apple-touch-icon`. Generated PNGs are committed.
- Workbox: `globPatterns: ["**/*.{js,css,html,svg,png,ico,wasm,webmanifest}"]`,
  `maximumFileSizeToCacheInBytes: 3_000_000` (qpdf.wasm is ~2.2 MB > 2 MiB default),
  `navigateFallback: "/index.html"`. The lazy decrypt chunk, the qpdf worker script and the wasm
  are all precached.
- Behavior: first visit must be online; afterwards the whole app including decrypt works offline.
  New deployments activate on the next online launch; no update prompt (no user state to lose).
- Verification: after `build && preview`, DevTools shows the SW active and `qpdf*.wasm` in the
  precache; go offline, reload `/decrypt`, decrypt a file successfully.

## Out of scope

Docker/deploy scripts, merge/split/compress tools (the home "More soon" card stays), update-prompt UI,
browser E2E automation.
