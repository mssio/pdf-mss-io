# PDF Toolbox: static Vite + WASM app

Date: 2026-10-06
Status: approved; revised 2026-10-06 (latest stable versions, password-protected PDFs rejected outside Decrypt,
release 1.0.0 on `@mssio/qpdf-wasm` 1.0.0; Playwright E2E tests and never-saved password fields)

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
| PDF engine | `@mssio/qpdf-wasm` **1.0.0** (qpdf 12.4.2). It owns the Web Worker; the app does not write its own. |
| Password-protected input | **Only Decrypt accepts PDFs that need a password to open.** Every other tool rejects them and points to Decrypt. PDFs that open without a password but carry owner restrictions ("restriction-only") are accepted by every tool. No password fields outside Decrypt. |
| Offline | PWA via `vite-plugin-pwa`: installable, works offline after the first online visit. |
| Size policy | 250 MB combined input hard limit for every tool; warning above 100 MB on phones (section 3). |
| UI library | shadcn only (no Catalyst / other kits). Old look kept; added shadcn `checkbox`, `alert`, `badge`, `separator`. Non-error notices use `Alert`. |
| Versions | Latest stable of every package (section 1), verified to build, lint and test together on 2026-10-06. |
| Runtime | Node 24 LTS (`.nvmrc` = `24`, `engines.node` = `>=24`). Node 25 is end-of-life and Vitest 5 doesn't support it. |
| Package manager | npm. |
| E2E tests | Playwright against the production build (`vite preview`), run locally with `npm run test:e2e` (no CI). Chromium runs every spec; WebKit runs the offline spec only. See section 9. |
| Password fields | No `<input type="password">` anywhere. Password inputs use `SecretInput` (masked text field + password-manager ignore attributes) so neither the browser nor a password manager offers to save them. See section 10. |
| Release | The app ships as **version 1.0.0**: `package.json` `version` is `1.0.0`, `CHANGELOG.md` has a 1.0.0 entry, `main` is tagged `v1.0.0`, and a GitHub release `v1.0.0` carries `pdf-toolbox-1.0.0.zip` (the built `dist/`). See section 8. |

Verified with throwaway probes against the real package (Node, 2026-10-06), using valid PDFs, first
with 0.1.0 and again with **1.0.0** (same API and byte-identical `qpdf.wasm`; only `engines.node` rose to `>=24`):
merge, select pages, encrypt (AES-256/128, owner-only), compress, info and `run(["--json", ...])`
all work. Merge output is never encrypted. PDFs encrypted with only an owner password report
`encrypted: true` but open without a password; `decrypt(file, { password: "" })` removes their
restrictions. With restriction-only input, Extract and Compress keep the restrictions, Merge output has
none, and Encrypt replaces them. Memory: compress handled 400 MB and merge 600 MB; encrypt succeeded at 300 MB, threw
`std::bad_alloc` at 400 MB, and at 600 MB **resolved with a near-empty output** (package or
qpdf-in-wasm issue, to be reported upstream; the app guards against it).

## 1. Architecture and layout

**Versions** (latest stable on 2026-10-06; installed with `^`):

| Package | Version | Note |
|---|---|---|
| react, react-dom | 19.3.0 | |
| react-router | 8.4.0 | v8 needs React ≥ 19.2.7 and Node ≥ 22.22 |
| vite | 8.3.3 | |
| @vitejs/plugin-react | 6.1.2 | React Compiler preset kept from the scaffold |
| @rolldown/plugin-babel / @babel/core / babel-plugin-react-compiler | 0.2.4 / 8.0.6 / 1.0.0 | |
| tailwindcss, @tailwindcss/vite | 4.3.3 | |
| tw-animate-css | 1.4.0 | |
| vite-plugin-pwa / @vite-pwa/assets-generator | 2.0.0 / 2.0.0 | |
| vitest | 5.0.3 | needs Node 22.12+, 24 or 26+ |
| typescript | 6.0.3 | **not 7.0.2**: typescript-eslint 8.71.1 supports TypeScript < 6.1 only |
| eslint / @eslint/js / typescript-eslint | 10.12.0 / 10.0.1 / 8.71.1 | |
| eslint-plugin-react-hooks / eslint-plugin-react-refresh / globals | 7.1.1 / 0.5.7 / 17.13.0 | |
| @types/react, @types/react-dom | 19.3.0 | |
| @types/node | ^24 | matches the Node 24 runtime, not the latest 26.x |
| @mssio/qpdf-wasm | 1.0.0 | requires Node ≥ 24, matching the runtime |
| @playwright/test | 1.63.0 | dev only; browsers installed with `npx playwright install chromium webkit` (~300 MB, outside the repo) |
| lucide-react / clsx / tailwind-merge / class-variance-authority | 1.52.0 / 2.1.1 / 3.7.0 / 0.7.1 | |
| @radix-ui/react-slot / -label / -checkbox / -separator | 1.4.0 / 2.1.16 / 1.3.12 / 1.1.16 | |

**Path alias:** `@/*` → `src/*` (tsconfig `paths` + Vite `resolve.alias`).

```
.nvmrc                      24
index.html                  title "PDF Toolbox", inline no-flash theme script, favicon + PWA links
public/favicon.svg          new icon (source for all PWA icons)
pwa-assets.config.ts        icon generation config (@vite-pwa/assets-generator)
src/main.tsx                createRoot + RouterProvider + PWA registration
src/router.ts               AppShell layout route; "/" HomePage; one lazy route per tool
src/tools.ts                tool registry: id, path, title, nav label, description, icon, lazy loader
src/index.css               ported (background gradients)
src/styles/globals.css      ported unchanged (theme tokens, light/dark)
src/components/AppShell.tsx         ported; nav from registry; footer copy changed
src/components/PdfFileDropzone.tsx  ported look; controlled; gains `multiple` mode
src/components/ToolPage.tsx         shared tool layout: title, intro, card
src/components/ResultCard.tsx       shared success card: download button, notes, "another"/"home"
src/components/ErrorBox.tsx         the old red error paragraph, optional muted detail and Decrypt link
src/components/SizeNotice.tsx       over-limit error or phone warning for the selected total
src/components/ui/{button,card,input,label}.tsx           ported shadcn, unchanged
src/components/ui/{checkbox,alert,badge,separator}.tsx    added from shadcn (new-york), same tokens
src/components/ui/secret-input.tsx  masked, never-saved password input (section 10)
src/lib/utils.ts            cn()
src/lib/theme.ts            THEME_STORAGE_KEY = "pdf-mss-io-theme" (same key as old app)
src/lib/use-theme.ts        ported unchanged
src/lib/qpdf.ts             getQpdf(), ensureNoOpenPassword(), describeQpdfError(), assertOutput()
src/lib/use-qpdf-job.ts     busy/error state for one qpdf job; ignores results after reset/unmount
src/lib/use-blob-url.ts     owns one blob URL; revokes on replace/clear/unmount
src/lib/limits.ts           MAX_TOTAL_BYTES, PHONE_WARN_BYTES, checkSize(), isLikelyPhone()
src/lib/pdf-files.ts        isPdfFile(), pickPdfFiles()
src/lib/filename.ts         outputFilename(name, suffix)
src/lib/format.ts           formatBytes(), sizeChange(), parsePdfDate()
src/lib/page-ranges.ts      normalizePageRanges()
src/lib/passwords.ts        generateOwnerPassword(), validateNewPassword()
src/lib/merge-list.ts       merge file-list reducer (add, move, remove)
src/lib/pdf-info.ts         parseQpdfJson(): qpdf --json → PdfDetails
src/pages/HomePage.tsx      hero kept; grid of tool cards from the registry
src/pages/{Decrypt,Encrypt,Merge,Extract,Compress,Info}Page.tsx
src/test/make-pdf.ts        builds valid PDFs in memory for tests
playwright.config.ts        E2E config (section 9)
e2e/                        Playwright specs, global setup and helpers (section 9)
```

Scaffold leftovers removed: `src/App.tsx`, `src/App.css`, `src/assets/*`, `public/icons.svg`,
old `public/favicon.svg`. Old `select`/`textarea` UI files are not ported (unused).

**Loading:** every tool route is lazy. `getQpdf()` dynamically imports `@mssio/qpdf-wasm` and calls
`createQpdf()` once, caching the promise; if creation rejects the cache is cleared so the next
attempt retries. The home page never downloads qpdf.

**Navigation:** header keeps logo + Home + theme toggle. Tool links show inline on ≥ md screens; on
phones the home grid is the navigation (no hamburger menu). Header links, home cards and routes all
come from `src/tools.ts`.

**Home page:** hero and "Privacy-focused PDF utilities" badge kept; copy becomes "Simple, focused
tools for everyday PDF tasks, running entirely in your browser." Grid of six tool cards in the old
decrypt-card style (icon tile, title, description, "Open tool"). The "More soon" card is removed.

## 2. Shared tool behavior

Every tool page uses `ToolPage` + `ResultCard` and follows the old decrypt flow:

1. Choose file(s) via `PdfFileDropzone` (drag/drop or click; non-PDFs rejected: "File must be a PDF.").
2. Size check (section 3) runs as soon as files are chosen; submit is disabled over the limit.
3. Submit → busy state on the button (spinner + "-ing…" label) → `getQpdf()` →
   (every tool except Decrypt) `ensureNoOpenPassword(qpdf, file)` for each input → helper call →
   `assertOutput(output)` → blob URL via `useBlobUrl` → `ResultCard`.
4. `ResultCard` has: primary download `<a download=...>`, tool-specific notes, "Back to home",
   and "<Verb> another file". The blob URL is revoked on "another", on replacement, and on unmount.

**Inputs passed to qpdf are `File` objects** (copied to the worker, never detached), so a retry
reuses the same `File`.

**Password-protected inputs (all tools except Decrypt):** `ensureNoOpenPassword(qpdf, file)` calls
`qpdf.info(file)` with no password and returns its `PdfInfo`. If it rejects with `INVALID_PASSWORD`
(the PDF needs a password to open), it throws `PasswordProtectedError`. Restriction-only PDFs
(`encrypted: true`, opened without a password) pass. The page shows: "This PDF is password-protected.
Remove its password with Decrypt first." with a "Go to Decrypt" link. Merge names the file:
"“name.pdf” is password-protected. Remove its password with Decrypt first."

**Errors** (`describeQpdfError(error, phase)` → `{ message, detail?, decryptFirst? }`, shown in `ErrorBox`):

| Cause | Message |
|---|---|
| No / empty file | Choose a PDF file. |
| Dropped non-PDF | File must be a PDF. |
| Size over limit | Files must be 250 MB or less in total (you selected X). |
| `PasswordProtectedError` | This PDF is password-protected. Remove its password with Decrypt first. (+ link) |
| `UnreadablePdfError` (Merge names the file) | “name.pdf” isn't a readable PDF. |
| `INVALID_PASSWORD` in Decrypt | Incorrect password. Check it and try again. |
| `INVALID_PDF` | This file isn't a readable PDF. |
| `getQpdf()` rejects (phase `load`) | Couldn't load the PDF engine. Check your connection and reload. |
| Out of memory (`FAILED` whose message contains `bad_alloc`, `out of memory`, `Aborted` or `qpdf crashed`) | Not enough memory to process this on this device. Try a smaller file or a computer. |
| `assertOutput` fails (fewer than 64 bytes, or no `%PDF-` header) | Same out-of-memory message (this is how the package's large-file issue surfaces). |
| Any other error | Could not process this PDF. (+ `error.message` as muted detail) |

`warnings` from successful jobs are not shown (qpdf repairs are routine); they are logged with
`console.warn`.

**Output filenames** (`outputFilename(name, suffix)`, old `-d` rule generalized; a name that is
empty after trimming becomes `document`):

| Tool | Output |
|---|---|
| Decrypt | `name-d.pdf` (unchanged from old app) |
| Encrypt | `name-protected.pdf` |
| Extract | `name-pages.pdf` |
| Compress | `name-compressed.pdf` |
| Merge | `merged.pdf` |

## 3. Size policy

- `MAX_TOTAL_BYTES = 250 * 1024 * 1024`, applied to the sum of all selected inputs in every tool.
  Exactly 250 MB is allowed. Over the limit: error shown immediately, submit disabled.
- `PHONE_WARN_BYTES = 100 * 1024 * 1024`. If `isLikelyPhone()` and total > 100 MB: amber `Alert`
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
- Password field (`SecretInput`, section 10) is **optional**: label "Password", placeholder "Document open password", help text
  "Leave empty if the PDF opens without a password but has restrictions." Empty → `password: ""`.
  Decrypting a restriction-only PDF with an empty password removes its restrictions.
- Result: "Decrypted in your browser. Download it now; the file isn't stored anywhere."
- Unencrypted input is allowed (qpdf returns a copy).

### Encrypt (`/encrypt`)
- Fields: PDF; "Password to open" + "Confirm password", both `SecretInput` (section 10) (`validateNewPassword`: empty → "Password is
  required."; mismatch → "Passwords don't match.").
- "Permissions" (checkboxes, all checked by default): Allow printing, Allow editing, Allow copying
  text and images, Allow comments and form filling → `allow.{print,modify,extract,annotate}`.
- Owner password: not shown. `generateOwnerPassword()` per run (32 random bytes, base64url) so
  permissions are enforced. Note under the permissions: "Permissions can't be changed later without
  the original file."
- AES-256 (package default). No AES-128 option.
- Password-protected input → `PasswordProtectedError` (shared rule). Restriction-only input is
  accepted; its old restrictions are replaced by the new password and permissions.

### Merge (`/merge`)
- Dropzone in `multiple` mode: each drop/pick **appends** to the list (duplicates allowed).
- List rows: position, file name, size, Move up / Move down buttons, Remove button (keyboard
  accessible, with aria-labels). No drag-to-reorder library.
- Total size and file count shown under the list; size policy applies to the total.
- "Merge" enabled with ≥ 2 files. Each file is checked with `ensureNoOpenPassword` in list order;
  the first password-protected one is named in the error. An empty input → “name.pdf” is empty. Then `merge(files)`.
- Result note: "N files, P pages." (P = sum of the inputs' page counts). If any input was restriction-only, an
  `Alert` adds: "Restrictions from the original files aren't kept in the merged PDF."

### Extract pages (`/extract`)
- After a file is chosen, run `ensureNoOpenPassword` (it returns `info`) and show "This PDF has N pages."
  (or the shared error).
- Field "Pages" (required) with help text: "Examples: `1-3`, `1,4,7`, `5-z` (z = last page)."
  `normalizePageRanges` removes spaces and lower-cases `Z`, then validates against
  `^(\d+|z)(-(\d+|z))?(,(\d+|z)(-(\d+|z))?)*$`; invalid → "Enter pages like 1-3,7 or 5-z." Bounds
  are left to qpdf; its message is shown as detail (e.g. "number 9 out of range").
- Call `selectPages(file, normalized)`. Result note: "Extracted P pages in your browser."

### Compress (`/compress`)
- Single file, no options (level 9 fixed).
- Result shows "Before → After (−X%)" using `formatBytes` and `sizeChange`.
- If output ≥ input: no download; ResultCard shows an `Alert`: "This PDF is already as small as qpdf
  can make it. qpdf compresses the PDF's structure but doesn't shrink images."
- Intro sets expectations: "Repacks and recompresses the PDF's internal data. Works best on
  text-heavy PDFs; scanned or photo-heavy files shrink little."

### Info (`/info`)
- Single file; shows details instead of a download. Buttons: "Inspect another file" and "Back to home".
- Password-protected input → `PasswordProtectedError` (shared rule); restriction-only input is shown.
- Data: `PdfInfo` from `ensureNoOpenPassword` for PDF version and page count; `run(["--json",
  "--json-key=pages", "--json-key=encrypt", "--json-key=attachments", "--json-key=qpdf", "in.pdf"])` (exit 0 or 3 = success);
  `run(["--check-linearization", "in.pdf"])`: linearized when stdout contains "no linearization errors" (qpdf exits 0 either way). `parseQpdfJson` extracts:
  - Document info from the trailer `/Info` object (`qpdf[1]["obj:<ref>"].value`): Title, Author,
    Subject, Keywords, Creator, Producer, CreationDate, ModDate. Strings are `u:`-prefixed in qpdf
    JSON v2 (`b:` binary strings are skipped); dates parsed from `D:YYYYMMDDHHmmSS[Z|±HH'mm']`.
  - Page size of page 1 in mm and inches, with a named size when it matches A4, Letter, Legal, A3
    or A5 within 2 pt (either orientation, "landscape" noted); "Mixed sizes" if any page differs.
    `/MediaBox` may be inherited: walk `/Parent` until found; references are resolved.
  - Security: "Not encrypted", or "Restrictions only (opens without a password)" with the method
    (`AESv3` → "AES-256", `AESv2` → "AES-128", `RC4` → "RC4") and permissions from
    `encrypt.capabilities`: printing (`printhigh`), editing (`modifyother`), copying (`extract`),
    comments and forms (`modifyannotations`).
  - Attachments: count and names (`preferredname`, falling back to the key).
- Displayed in a card, grouped Document / Pages / Security / Other, groups split by `Separator`.
  "Linearized", the encryption method and each denied permission show as `Badge`s. Missing values are omitted, not shown as empty.

## 5. PWA and offline

- `vite-plugin-pwa`, `generateSW`, `registerType: "prompt"` with no prompt UI, registered from `main.tsx` via
  `virtual:pwa-register`. A new deployment is downloaded the next time the app is opened online and used once every tab of the app has been closed and it is opened again; open pages are never reloaded.
- Manifest: name and short_name "PDF Toolbox", `display: "standalone"`, `start_url: "/"`,
  `theme_color` and `background_color` `#ffffff`.
- Icons generated from `public/favicon.svg` by `@vite-pwa/assets-generator` (minimal 2023 preset):
  64/192/512 px, 512 maskable, 180 px `apple-touch-icon`, `favicon.ico`. Generated files are committed.
- Workbox: `globPatterns: ["**/*.{js,css,html,svg,png,ico,wasm,webmanifest}"]`,
  `maximumFileSizeToCacheInBytes: 3_000_000` (qpdf.wasm ~2.2 MB > 2 MiB default),
  `navigateFallback: "/index.html"`. All lazy tool chunks, the qpdf worker script and the wasm
  are precached (verified in a prototype build).
- First visit must be online; afterwards everything works offline. No update prompt.

## 6. Favicon and docs

**Favicon:** hand-written `public/favicon.svg`: rounded square in the app's primary color (#171717),
white document with folded corner and an open padlock. Flat shapes, legible at 16 px (checked).

**README.md** (rewrite): what it is, the six tools, privacy model, the password-protected-input rule, stack,
Node 24 requirement, scripts (`dev`, `build`, `preview`, `test`, `lint`, `icons`), size limits and
why, hosting `dist/` (SPA fallback snippets: nginx `try_files`, Netlify/Cloudflare Pages
`_redirects`, Caddy `try_files`, GitHub Pages `404.html` copy), `.wasm` as `application/wasm`,
`Cache-Control: no-cache` for `index.html` and `sw.js`, CSP needs (`script-src 'wasm-unsafe-eval'`,
`worker-src 'self'`), how to add a tool.

**AGENTS.md** (new), plus `CLAUDE.md` containing only `@AGENTS.md`: purpose and hard constraints
(static only, no backend, files never leave the browser, offline must keep working, only Decrypt
accepts PDFs that need a password to open), file map, qpdf rules (use `getQpdf()`; pass `File`s; `ensureNoOpenPassword`
first; map errors with `describeQpdfError`; always `assertOutput`; blob URLs via `useBlobUrl`), size
policy location, UI conventions, recipe for adding a tool, PWA notes, version notes (TypeScript held
at 6.0 for typescript-eslint; Node 24), known package issue, commands to run before finishing.

## 7. Testing

**Vitest 5, Node environment:**
- Unit tests for every `src/lib` module without React: `filename`, `format`, `limits`, `pdf-files`,
  `page-ranges`, `passwords`, `merge-list`, `pdf-info`, and `qpdf` (`describeQpdfError`,
  `assertOutput`).
- `qpdf.integration.test.ts` (real package, inline in Node; PDFs from `src/test/make-pdf.ts`):
  decrypt right / wrong / empty password, owner-only restrictions removed with an empty password,
  retry with the same `File` after a wrong password; `ensureNoOpenPassword` rejects a PDF that
  needs a password and accepts plain and restriction-only PDFs (returning their info); encrypt with permissions; merge 3+2 → 5 pages and not encrypted;
  `selectPages` `1,4-z` → 3 pages and out-of-range → `FAILED`; compress returns a valid PDF;
  `parseQpdfJson` on live `run --json` output.

**Manual verification** (`npm run build && npm run preview`, desktop + owner's phone): each tool
end to end with a real PDF; password-protected input rejected with the Decrypt link in all five other tools,
restriction-only input accepted;
size limit error and phone warning; theme toggle persists without flash; direct load of every tool
URL; home page loads no `.wasm`; PWA: service worker active, `qpdf*.wasm` precached, offline reload
of a tool page and a successful run offline.

Browser-level behavior is covered by the Playwright suite in section 9.

## 8. Release 1.0.0

- `package.json`: `"version": "1.0.0"`; `@mssio/qpdf-wasm` installed as `^1.0.0`.
- `CHANGELOG.md` (new, Keep a Changelog format) with a `## [1.0.0] - <release date>` entry listing
  the six tools, offline/PWA support, the size limit and the port from the Bun server.
- README states the current version and links the changelog.
- `docs/todo.md` has two parts: an "Automated checks (Playwright)" table mapping each check to the
  spec file that covers it, and "Owner checks" boxes for what needs a person. The release does not
  start until `npm run test:e2e` passes and every owner box is ticked.
- Release steps (each needs the owner's go-ahead, since they publish or touch `main`): open a PR from
  `port-vite-wasm` to `main`; after it merges, tag the merge commit `v1.0.0` and push the tag; build
  `dist/`, zip it as `pdf-toolbox-1.0.0.zip`, and create the GitHub release `v1.0.0` with the
  changelog entry as notes and the zip attached.

## 9. End-to-end tests (Playwright)

**Goal:** automate every browser check that doesn't need human eyes or a real phone, so the owner's
manual list shrinks to about 9 items and the same checks run on every future change.

**Setup**
- `@playwright/test` 1.63.0 (dev). One-time `npx playwright install chromium webkit`.
- `playwright.config.ts`: `testDir: "e2e"`, `globalSetup: "e2e/global-setup.ts"`,
  `webServer` = `vite preview --port 4173 --strictPort` (`baseURL` `http://localhost:4173`),
  projects `chromium` (Desktop Chrome, every spec) and `webkit` (Desktop Safari,
  `testMatch: /offline\.spec\.ts/` only). The offline spec starts its own server on a free port
  (asked from the OS with `net.createServer().listen(0)`), so parallel projects never collide.
- Script `"test:e2e": "npm run build && playwright test"`. `npm test` stays unit + integration only.
- Git-ignored: `e2e/.fixtures/`, `test-results/`, `playwright-report/`.

**Fixtures** (`e2e/global-setup.ts`, regenerated each run with `makePdf` + the real qpdf in Node):
`plain.pdf` (5 pages, title "Plain sample"), `two-pages.pdf`, `protected.pdf` (password `open-me`),
`restricted.pdf` (no open password, printing denied), `linearized.pdf`, `not-a-pdf.pdf` (text with a
`.pdf` name), `empty.pdf` (0 bytes), `oversize.pdf` (260 MB sparse file; size check only, never parsed).

**Helpers** (`e2e/helpers.ts`): `chooseFiles(page, ...names)` (sets the hidden file input),
`download(page, linkName)` → saved path + suggested filename, and `inspectPdf(path, password?)` →
`{ encrypted, pageCount, capabilities }` using qpdf in Node, so downloads are verified for real.

**Specs**
- `e2e/shell.spec.ts`: logo + "PDF Toolbox" header, Home link, theme toggle; theme persists across
  reload with no flash (dark class present on first paint); follows `prefers-color-scheme` when no
  choice is saved; footer copy; every tool URL loads directly; the home page requests no `.wasm`;
  at 375 px `document.documentElement.scrollWidth <= innerWidth` on home and every tool; the route
  error screen appears when a tool's JS chunk is blocked (`page.route` abort) and keeps header/footer.
- `e2e/decrypt.spec.ts`, `encrypt.spec.ts`, `merge.spec.ts`, `extract.spec.ts`, `compress.spec.ts`,
  `info.spec.ts`: every automatable box from `docs/todo.md` for that tool — exact messages, the "Go
  to Decrypt" link, download names, outputs verified with `inspectPdf` (decrypted → not encrypted;
  encrypted → needs the password, chosen permissions; merged/extracted page counts and order;
  compressed smaller and "No smaller version" on a second pass), Merge keyboard path (Tab/Enter to the
  drop zone, row buttons focusable), the 260 MB size error with the button disabled.
- `e2e/password-fields.spec.ts`: no `input[type=password]` on any page; Decrypt/Encrypt password
  inputs carry the ignore attributes and computed `-webkit-text-security: disc`.
- `e2e/offline.spec.ts` (Chromium and WebKit): starts its own `vite preview` on a free port, opens
  `/decrypt`, waits for `navigator.serviceWorker.ready` and a cached `qpdf-*.wasm`, reloads so the
  worker controls the page, **stops the server**, then navigates to `/info` and `/decrypt` and
  decrypts `protected.pdf` successfully. (Playwright's `context.setOffline` breaks navigation in
  WebKit, so stopping the server is the offline technique; verified 2026-10-06 in both engines.)
- `e2e/screenshots.spec.ts` (Chromium): home and each tool, light and dark, at 375 × 812 and
  1280 × 800, saved to `test-results/screenshots/<page>-<theme>-<width>.png` for the owner's visual
  review. It asserts nothing beyond the page rendering.

## 10. Password fields that are never saved

- `src/components/ui/secret-input.tsx` exports `SecretInput`: the shadcn `Input` with `type="text"`,
  class `[-webkit-text-security:disc]`, `autoComplete="off"`, `autoCorrect="off"`,
  `autoCapitalize="off"`, `spellCheck={false}`, and `data-1p-ignore`, `data-lpignore="true"`,
  `data-bwignore`, `data-form-type="other"`. All other props pass through.
- Used for Decrypt "Password" and Encrypt "Password to open" / "Confirm password". No
  `type="password"` input exists anywhere in the app.
- Why: browsers ignore `autocomplete="off"` on password inputs and offer to save them on submit;
  a masked text field isn't treated as a password, and the data attributes opt out of 1Password,
  LastPass, Bitwarden and Dashlane. `-webkit-text-security` works in Chrome, Edge, Safari and
  Firefox ≥ 114.
- Trade-offs (accepted): screen readers may read the typed characters; password managers can't
  fill saved PDF passwords; no show/hide toggle.
- Verification: Playwright (section 9) checks the markup; the owner checks that no save prompt
  appears in their browser and password manager.

## Out of scope

Docker/deploy scripts; password fields for input PDFs outside Decrypt; CI; split, rotate, linearize, repair,
thumbnails, image conversion; update-prompt UI; drag-to-reorder; component
tests (no jsdom; covered by E2E instead); Firefox E2E runs; automating real-phone checks; reporting the package issue (owner's call; a repro can be provided).
