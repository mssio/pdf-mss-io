# PDF Toolbox: static Vite + WASM app

Date: 2026-10-06
Status: approved in conversation, pending written-spec review

## Goal

Rebuild the PDF Toolbox from `../old_bun` (Bun server + React) in this Vite scaffold as a
**fully static, client-side app**, then extend it with five more tools. All PDF work runs in the
browser with qpdf compiled to WebAssembly (`@mssio/qpdf-wasm`). Files and passwords never leave
the device. `npm run build` outputs plain HTML/CSS/JS/WASM in `dist/` that the owner hosts
themselves. The app is an installable PWA that works offline.

The UI keeps the old app's look: same shell, theme toggle, cards, drop zone and styling. Only copy
that referred to the server changes.

**Tools:** Decrypt (ported), Encrypt, Merge, Extract pages, Compress, Info.

## Decisions (from the brainstorming conversation)

| Topic | Decision |
|---|---|
| Hosting | Static `dist/` only. No Docker, no `bin/build.sh`; the owner hosts it. |
| Server features | Dropped: 15-minute download links, cleanup timers/cron, 40 MB upload limit. |
| Routing | Clean URLs via `createBrowserRouter`. Hosts must rewrite unknown paths to `/index.html` (documented). Once the service worker is installed it serves `index.html` for navigations itself. |
| PDF engine | `@mssio/qpdf-wasm` 0.1.x (qpdf 12.4.2). It owns the Web Worker; the app does not write its own. |
| Offline | PWA via `vite-plugin-pwa`: installable, works offline after the first online visit. |
| Size policy | 250 MB combined input hard limit for every tool; warning above 100 MB on phones (section 3). |
| UI library | shadcn only (no Catalyst / other kits). Old look kept; added shadcn `checkbox`, `alert`, `badge`, `separator`. Non-error notices (phone warning, "already protected", compress "already small") use `Alert`. |
| Package manager | npm. |

Verified with throwaway probes against the real package (Node, 2026-10-06): merge, select pages,
encrypt (AES-256/128, owner-only), compress, info, `run(["--json", ...])` all work. Memory: merge
handled 1 GB; encrypt succeeded at 300 MB, threw `std::bad_alloc` at 400–500 MB, and at ≥600 MB
**resolved with a near-empty output** (package bug, to be reported upstream; the app guards against it).

## 1. Architecture and layout

**Stack:** Vite 8, React 19, TypeScript (scaffold, React Compiler preset kept), React Router 7
(`createBrowserRouter` + `RouterProvider`), Tailwind 4 via `@tailwindcss/vite`, `tw-animate-css`,
shadcn "new-york" primitives, `lucide-react`, `clsx`, `tailwind-merge`, `class-variance-authority`,
`@radix-ui/react-slot`, `@radix-ui/react-label`, `@radix-ui/react-checkbox`, `@radix-ui/react-separator`, `@mssio/qpdf-wasm`, `vite-plugin-pwa`, Vitest.

**Path alias:** `@/*` → `src/*` (tsconfig `paths` + Vite `resolve.alias`).

```
index.html                  title "PDF Toolbox", inline no-flash theme script, favicon + PWA links
public/favicon.svg          new icon (source for all PWA icons)
pwa-assets.config.ts        icon generation config (@vite-pwa/assets-generator)
src/main.tsx                createRoot + RouterProvider + PWA registration
src/router.tsx              AppShell layout route; "/" HomePage; each tool route lazy-loaded
src/tools.ts                tool registry: id, path, title, short description, icon (drives home grid + nav)
src/index.css               ported (background gradients)
src/styles/globals.css      ported unchanged (theme tokens, light/dark)
src/components/AppShell.tsx         ported; nav from registry; footer copy changed
src/components/PdfFileDropzone.tsx  ported; gains `multiple` mode (section 2)
src/components/ToolPage.tsx         shared tool layout: title, intro, form card, error box
src/components/ResultCard.tsx       shared success card: download button, notes, "another"/"home"
src/components/ErrorBox.tsx         the old red error paragraph, with optional muted detail line (kept as-is to match the old UI)
src/components/ui/{button,card,input,label}.tsx  ported shadcn, unchanged
src/components/ui/{checkbox,alert,badge,separator}.tsx  added from shadcn (new-york), same tokens
src/lib/utils.ts            cn()
src/lib/theme.ts            THEME_STORAGE_KEY = "pdf-mss-io-theme" (same key as old app)
src/lib/use-theme.ts        ported unchanged
src/lib/qpdf.ts             getQpdf() lazy singleton; describeQpdfError(); assertOutput()
src/lib/limits.ts           MAX_TOTAL_BYTES, PHONE_WARN_BYTES, checkSize(), isLikelyPhone()
src/lib/filename.ts         outputFilename(name, suffix): "a.pdf" + "-d" → "a-d.pdf"
src/lib/format.ts           formatBytes(), formatPdfDate()
src/lib/pdf-info.ts         parseQpdfJson(): qpdf --json → PdfDetails
src/lib/use-blob-url.ts     owns a blob URL; revokes on replace/reset/unmount
src/pages/HomePage.tsx      hero kept; grid of tool cards from registry
src/pages/{Decrypt,Encrypt,Merge,Extract,Compress,Info}Page.tsx
```

Scaffold leftovers removed: `src/App.tsx`, `src/App.css`, `src/assets/*`, `public/icons.svg`,
old `public/favicon.svg`. Old `select`/`textarea` UI files are not ported (unused).

**Loading:** every tool route is lazy (`lazy` in the route object). `getQpdf()` dynamically
imports `@mssio/qpdf-wasm` and calls `createQpdf()` once, caching the promise; if creation rejects
the cache is cleared so the next attempt retries. The home page never downloads qpdf.

**Navigation:** header keeps logo + Home + theme toggle. With six tools, tool links move into a
"Tools" area: inline links on ≥ md screens, and the home grid is the primary navigation on phones
(no hamburger menu). Header links and home cards both come from `src/tools.ts`.

**Home page:** hero and "Privacy-focused PDF utilities" badge kept; copy becomes "Simple, focused
tools for everyday PDF tasks, running entirely in your browser." Grid of six tool cards in the old
decrypt-card style (icon tile, title, description, "Open tool"). The "More soon" card is removed.

## 2. Shared tool behavior

Every tool page uses `ToolPage` + `ResultCard` and follows the old decrypt flow:

1. Choose file(s) via `PdfFileDropzone` (drag/drop or click; non-PDFs rejected: "File must be a PDF.").
2. Size check (section 3) runs as soon as files are chosen and again on submit.
3. Submit → busy state on the button (spinner + "-ing…" label) → `const qpdf = await getQpdf()`
   → helper call → `assertOutput(result)` → blob URL via `useBlobUrl` → `ResultCard`.
4. `ResultCard` has: primary download `<a download=...>`, tool-specific notes, "Back to home",
   and "<Tool> another file". The blob URL is revoked on "another", on replacement, and on unmount.

**Inputs passed to qpdf are `File` objects** (copied to the worker, never detached), so retries
with a different password reuse the same `File`.

**Passwords for protected inputs:** Merge, Extract, Compress and Info first try without a password.
On `INVALID_PASSWORD` they show a password field for that file (inline, focused) with the message
"This PDF is password-protected. Enter its password." and the user resubmits. Decrypt and Encrypt
have their password fields from the start.

**Output encryption:** outputs of Merge/Extract/Compress keep the input's encryption (qpdf default;
for Merge, the first file's). An integration test asserts this so a package change is noticed.

**Errors** (`describeQpdfError(error, phase)` → `{ message, detail? }`, shown in `ErrorBox`):

| Cause | Message |
|---|---|
| No / empty file | Choose a PDF file. |
| Dropped non-PDF | File must be a PDF. |
| Size over limit | Files must be 250 MB or less in total (you selected X). |
| Required password empty | Password is required. |
| `INVALID_PASSWORD` (decrypt) | Incorrect password. Check it and try again. |
| `INVALID_PASSWORD` (other tools) | This PDF is password-protected. Enter its password. / Incorrect password. (on retry) |
| `INVALID_PDF` | This file isn't a readable PDF. |
| `getQpdf()` rejects | Couldn't load the PDF engine. Check your connection and reload. |
| Out of memory (`FAILED` with `bad_alloc`, `out of memory`, `Aborted`, `qpdf crashed`, worker died) | Not enough memory to process this on this device. Try a smaller file or a computer. |
| `assertOutput` fails (empty or < 64 bytes, or no `%PDF-` header) | Same out-of-memory message (this is how the package's large-file bug surfaces). |
| Any other `FAILED` | Could not process this PDF. (+ `error.message` as muted detail) |

`warnings` from successful jobs are not shown (qpdf repairs are routine); they are logged to the
console.

**Output filenames** (`outputFilename`, old `-d` rule generalized; empty/odd names → `document`):

| Tool | Output |
|---|---|
| Decrypt | `name-d.pdf` (unchanged from old app) |
| Encrypt | `name-protected.pdf` |
| Extract | `name-pages.pdf` |
| Compress | `name-compressed.pdf` |
| Merge | `merged.pdf` |

## 3. Size policy

- `MAX_TOTAL_BYTES = 250 * 1024 * 1024`, applied to the sum of all selected inputs in every tool.
  Over the limit: error shown immediately, submit disabled.
- `PHONE_WARN_BYTES = 100 * 1024 * 1024`. If `isLikelyPhone()` and total > 100 MB: amber `Alert` notice
  (not blocking): "Large files may fail on phones. If it doesn't work, try a computer."
- `isLikelyPhone()`: `navigator.deviceMemory <= 4` when available (Chromium), otherwise
  `matchMedia("(pointer: coarse) and (max-width: 820px)")`.
- Constants live in `src/lib/limits.ts` only; README and AGENTS.md reference them.
- Manual check during implementation: run a 100 MB and a 250 MB encrypt on the owner's phone and
  adjust the constants if needed.

## 4. Tools

### Decrypt (`/decrypt`), ported
Same form and copy as before except:
- Intro: "Upload an encrypted PDF and enter its password. Decryption runs entirely in your browser
  with `qpdf` compiled to WebAssembly. Your file never leaves your device."
- Card note (amber shield kept): "Your file and password stay on this device. Nothing is uploaded."
- Result: "Decrypted in your browser. Download it now; the file isn't stored anywhere."
- Unencrypted input is allowed (qpdf returns a copy).

### Encrypt (`/encrypt`)
- Fields: PDF; "Password to open" + "Confirm password" (required, must match: "Passwords don't match.").
- "Permissions" section (checkboxes, all checked by default): Allow printing, Allow editing,
  Allow copying text and images, Allow comments and form filling → `allow.{print,modify,extract,annotate}`.
- Owner password: not shown. Generated per run with `crypto.getRandomValues` (32 bytes, base64url) so
  permissions are enforced; the user is told the permissions can't be changed later without
  re-encrypting the original.
- AES-256 (package default). No AES-128 option.
- Already-encrypted input: on `INVALID_PASSWORD` show "This PDF is already protected. Decrypt it first."
  with a link to `/decrypt`.

### Merge (`/merge`)
- Dropzone in `multiple` mode: each drop/pick **appends** to the list (duplicates allowed).
- List rows: index, file name, size, Move up / Move down buttons, Remove button (all keyboard
  accessible, with aria-labels). No drag-to-reorder library.
- Row shows an inline password field when that file needs one (after `INVALID_PASSWORD`; the error
  is attributed to the file by calling `info(file)` on each file without a password, in order, until
  one fails).
- Total size and file count shown under the list; size policy applies to the total.
- "Merge" enabled with ≥ 2 files. Call `merge(files, { password: perFilePasswords })`.
- Result note: "N files, P pages." (P from `info(output)`).

### Extract pages (`/extract`)
- After a file is chosen, call `info(file)` and show "This PDF has N pages." (or the password
  prompt if protected).
- Field "Pages" (required) with help text: "Examples: `1-3`, `1,4,7`, `5-z` (z = last page)."
  Client-side validation regex: `^\s*(\d+|z)(\s*-\s*(\d+|z))?(\s*,\s*(\d+|z)(\s*-\s*(\d+|z))?)*\s*$`
  → "Enter pages like 1-3,7 or 5-z." Bounds are left to qpdf; its error message is shown as detail.
- Call `selectPages(file, ranges)`. Result note: "Extracted P pages."

### Compress (`/compress`)
- Single file, no options (level 9 fixed).
- Result shows "Before → After (−X%)" using `formatBytes`.
- If output ≥ input: no download; ResultCard shows "This PDF is already as small as qpdf can make it.
  qpdf compresses the PDF's structure but doesn't shrink images." with "Compress another file".
- Intro sets expectations: "Repacks and recompresses the PDF's internal data. Works best on
  text-heavy PDFs; scanned or photo-heavy files shrink little."

### Info (`/info`)
- Single file; shows details instead of a download. No `ResultCard` download button; "Inspect
  another file" and "Back to home" only.
- Data: `run(["--json", "--json-key=pages", "--json-key=encrypt", "--json-key=attachments",
  "--json-key=qpdf", "in.pdf"])` (plus `--password=…` when given); treat exit 0 and 3 as success.
  `parseQpdfJson` extracts:
  - Document info from the trailer `/Info` object (`qpdf[1]["obj:<ref>"].value`): Title, Author,
    Subject, Keywords, Creator, Producer, CreationDate, ModDate. Strings are `u:`-prefixed in qpdf
    JSON v2; dates formatted from `D:YYYYMMDDHHmmSS…`.
  - PDF version (`info()`), page count, file size.
  - Page size of page 1 in mm and inches, with a named size when it matches (A4, Letter, Legal,
    A3, A5) within 2 pt; "Mixed sizes" if any page differs. `/MediaBox` may be inherited: walk
    `/Parent` until found.
  - Encryption: encrypted yes/no, method (`AESv3` → "AES-256", `AESv2` → "AES-128", `RC4` → "RC4"),
    and the permissions from `encrypt.capabilities` (print, modify, extract, annotate/forms).
  - Attachments: count and names (from `attachments`).
  - Linearized ("fast web view"): `run(["--check-linearization", "in.pdf"])` exit 0 → yes.
- Displayed as a definition list in a card, grouped: Document, Pages, Security, Other. Groups are split
  by `Separator`; "Encrypted", the method (e.g. "AES-256") and "Linearized" render as `Badge`s. Missing
  values are omitted, not shown as empty.

## 5. PWA and offline

- `vite-plugin-pwa` v2, `generateSW`, `registerType: "autoUpdate"`, registered from `main.tsx` via
  `virtual:pwa-register`.
- Manifest: name and short_name "PDF Toolbox", `display: "standalone"`, `start_url: "/"`,
  theme/background colors from the light theme tokens.
- Icons generated from `public/favicon.svg` by `@vite-pwa/assets-generator` (minimal 2023 preset):
  64/192/512 px, 512 maskable, 180 px `apple-touch-icon`. Generated PNGs are committed.
- Workbox: `globPatterns: ["**/*.{js,css,html,svg,png,ico,wasm,webmanifest}"]`,
  `maximumFileSizeToCacheInBytes: 3_000_000` (qpdf.wasm ~2.2 MB > 2 MiB default),
  `navigateFallback: "/index.html"`. All lazy tool chunks, the qpdf worker script and the wasm
  are precached.
- First visit must be online; afterwards everything works offline. New deployments activate on the
  next online launch; no update prompt.

## 6. Favicon and docs

**Favicon:** hand-written `public/favicon.svg`: rounded square in the app's primary color, white
document with folded corner and an open padlock. Flat shapes, legible at 16 px.

**README.md** (rewrite): what it is, the six tools, privacy model, stack, scripts (`dev`, `build`,
`preview`, `test`, `lint`), size limits and why, hosting `dist/` (SPA fallback snippets: nginx
`try_files`, Netlify/Cloudflare Pages `_redirects`, Caddy `try_files`, GitHub Pages `404.html`
copy), `.wasm` as `application/wasm`, `Cache-Control: no-cache` for `index.html` and `sw.js`, CSP
needs (`script-src 'wasm-unsafe-eval'`, `worker-src 'self'`), how to add a tool.

**AGENTS.md** (new), plus `CLAUDE.md` containing only `@AGENTS.md`: purpose and hard constraints
(static only, no backend, files never leave the browser, offline must keep working), file map,
qpdf rules (use `getQpdf()`; pass `File`s; map errors with `describeQpdfError`; always
`assertOutput`; revoke blob URLs via `useBlobUrl`), size policy location, UI conventions (shadcn in
`components/ui`, `cn()`, tokens in `globals.css`, theme script key), recipe for adding a tool
(registry entry + lazy route + page on `ToolPage`/`ResultCard` + tests), PWA notes (precache size
limit, update behavior), known package issue (large-input empty output), commands to run before
finishing.

## 7. Testing

**Vitest, Node environment:**
- `filename.test.ts`: `outputFilename` for `a.pdf`, `a.b.PDF`, no extension, trailing dot,
  leading-dot names, paths with `/` and `\`, empty/whitespace → `document-<suffix>.pdf`.
- `qpdf.test.ts`: `describeQpdfError` for each code, phase and out-of-memory pattern;
  `assertOutput` rejects empty, tiny and non-`%PDF-` outputs.
- `limits.test.ts`: `checkSize` at, below and above the limit.
- `pdf-info.test.ts`: `parseQpdfJson` on JSON captured from the real package (fixture file is
  qpdf's JSON text, not a PDF): doc info, `u:` strings, dates, inherited MediaBox, named sizes,
  mixed sizes, encryption method and permissions, attachments.
- `qpdf.integration.test.ts` (real package, inline in Node; PDFs built in-memory, then encrypted
  where needed):
  - decrypt right password → not encrypted; wrong → `INVALID_PASSWORD`.
  - encrypt with permissions → `info` with password shows encrypted; capabilities match.
  - merge 3+2 pages → 5; merge with an encrypted input + its password works and stays encrypted.
  - selectPages `1,4-z` on 5 pages → 3; invalid range → `FAILED` mapped to generic message.
  - compress returns a valid PDF; output of encrypted input stays encrypted.
  - `parseQpdfJson` on live `run --json` output for a PDF with Info dict.

**Manual verification** (`npm run build && npm run preview`, desktop + owner's phone):
each tool end to end with a real PDF; password prompts for protected inputs; size limit error and
phone warning; theme toggle persists without flash; direct load of every tool URL; home page loads
no `.wasm`; PWA: service worker active, `qpdf*.wasm` precached, offline reload of a tool page and a
successful run offline.

## Out of scope

Docker/deploy scripts; split, rotate, linearize, repair, thumbnails, image conversion; update-prompt
UI; drag-to-reorder; browser E2E automation; reporting the package bug (owner's call; a repro can be
provided).
