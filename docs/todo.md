# Checks and follow-ups

Version 1.0.0 was released on 2026-10-07 (tag `v1.0.0`; see `CHANGELOG.md`). Every owner check for it
was done. For the next release, add its owner checks here as unticked boxes and don't release until
`npm run test:e2e` passes and every box is ticked.

## Setup

```bash
nvm use                                  # Node 24
npm install
npx playwright install chromium webkit   # once, ~300 MB, outside the repo
npm run test:e2e                         # builds, then runs every browser check
```

## Automated checks (Playwright)

Covered by `npm run test:e2e`. Nothing to tick here: a passing run is the proof.

| Check | Spec file |
|---|---|
| Header logo + "PDF Toolbox", Home link, theme toggle, footer text with the app version, six tool cards, unknown addresses show "Page not found" with a way home | `e2e/shell.spec.ts` |
| Theme toggle survives a reload with no flash; follows the system theme when nothing is saved | `e2e/shell.spec.ts` |
| Every tool URL loads directly | `e2e/shell.spec.ts` |
| Home page loads no `.wasm` | `e2e/shell.spec.ts` |
| Nothing overflows sideways at 375 px (home and every tool) | `e2e/shell.spec.ts` |
| A page whose code fails to load shows "Something went wrong" inside the header and footer | `e2e/shell.spec.ts` |
| Decrypt: wrong → right password on the same file, `protected-d.pdf` opens without a password, empty password removes restrictions, non-PDF refused, "Decrypt another file" / "Back to home", the wasm loads only when a job runs, over 250 MB refused | `e2e/decrypt.spec.ts` |
| Encrypt: password validation, `plain-protected.pdf` needs the password and denies printing, password-protected input → Decrypt link, restriction-only input accepted | `e2e/encrypt.spec.ts` |
| Merge: append, reorder (move up), remove, disabled first-up/last-down, order kept in `merged.pdf`, restrictions note only when an input is restricted, merged output unencrypted, protected/unreadable/empty files named, error clears when the protected file is removed, keyboard path | `e2e/merge.spec.ts` |
| Extract: page count, loose ranges → `plain-pages.pdf` with 3 pages, invalid and out-of-range messages, protected input → Decrypt link | `e2e/extract.spec.ts` |
| Compress: smaller result with sizes, download is smaller and a valid 5-page PDF, second pass → "No smaller version" without a download, protected input → Decrypt link | `e2e/compress.spec.ts` |
| Info: plain PDF details, restriction badges, Linearized badge, protected input → Decrypt link | `e2e/info.spec.ts` |
| No `type="password"` input anywhere; password fields masked and carry the password-manager opt-outs | `e2e/password-fields.spec.ts` |
| Phones (small touch screen, either orientation): files over the phone limit are refused with "On phones, files must be … Use a computer for bigger files."; a computer gets the computer wording | `e2e/phone.spec.ts` |
| Every tool's result page shows how long the job took ("Finished in m:ss.") | all six tool specs |
| While a job runs, the step and elapsed time show ("Loading the PDF engine… 0:05", then the tool's step) plus a hint for files over 50 MB; a stuck engine times out with "This file took too long to process on this device…" and the next job works with a fresh engine | `e2e/job-safeguard.spec.ts` |
| A job cut off by a page reload is explained once after the reload ("The page reloaded while a file was being processed…"), and a finished job leaves no notice | `e2e/phone.spec.ts` |
| Offline: service worker active and wasm cached, then with the server stopped `/info` and `/decrypt` load and decrypting works (Chromium and WebKit) | `e2e/offline.spec.ts` |

## After 1.0.0 (not part of the release gate)

- **Real progress bar** (owner, in the `qpdf-wasm` repo, then here): give this prompt to Claude in the
  `@mssio/qpdf-wasm` repo:

  > In `@mssio/qpdf-wasm`, add streaming progress. Give every helper's options and `run()`'s options an
  > optional `onProgress?: (percent: number) => void`. When it's set, run qpdf with `--progress`, parse
  > each stdout line matching `/write progress: (\d+)%/` as Emscripten prints it (don't wait for the job
  > to end), and post `{ type: "progress", id, percent }` from the worker to the main thread. The
  > pool/executor forwards these to that job's callback; inline (Node) mode calls it directly. Keep
  > progress lines out of `RunResult.stdout`, don't call the callback after the job settles or after
  > `terminate()`, and keep the API backward compatible. Add unit and browser tests (percent values
  > rise from 0 to 100 for a large encrypt) and README docs, and release it as **1.1.0**.

  Then, in this repo: upgrade to `@mssio/qpdf-wasm@^1.1.0`, pass `onProgress` from `useQpdfJob`, show a
  percentage bar in `JobStatus`, and use "no progress for N seconds" for the stuck-engine time limit.

## Planned for 1.2.0: page grid, Organize, images in Merge

One shared **page grid** (a thumbnail per page; select, reorder, rotate, delete) used by three tools:

- **Merge**, which also takes images;
- **Extract**;
- a new **Organize** tool.

Everything still runs on the device, works offline and uploads nothing. Write the spec first (brainstorm →
`docs/superpowers/specs/`). Below are the decisions so far and the suggested defaults.

### Libraries (checked with Context7 and npm on 2026-10-08)

- **PDF.js (`pdfjs-dist`): add.** qpdf can't draw pages, and PDF.js is the only realistic in-browser
  renderer. Apache-2.0, latest 6.4.299 (2026-10-03); pin an exact version.
  - **Sizes:** `pdf.min.mjs` 459 KB and `pdf.worker.min.mjs` 1.26 MB, both under the 3 MB precache limit.
  - **Precache these wasm decoders:**
    - `openjpeg.wasm` 251 KB (JPEG 2000 images);
    - `jbig2.wasm` 104 KB (scanned documents);
    - `qcms_bg.wasm` 97 KB (colour profiles).
  - **Leave out:**
    - `quickjs-eval.wasm` 469 KB (form scripts);
    - `pdf.sandbox`;
    - the `*_nowasm_fallback.js` files.
  - **Fonts and character maps:** leave out `standard_fonts/` (816 KB) and `cmaps/` (1.6 MB) at first. Pages
    with non-embedded fonts or CJK text then show a substitute font in the thumbnail. The spec decides
    whether thumbnails need `standard_fonts/`; adding them means adding font extensions to the Workbox glob.
  - **Setup:** pass the worker and wasm locations as Vite `?url` imports
    (`GlobalWorkerOptions.workerSrc`, `wasmUrl`). Render at a target width
    (`scale = width / page.getViewport({ scale: 1 }).width`).
  - **Loading:** load it lazily on grid pages only. The home page must still load no `.wasm`
    (`shell.spec.ts`).
- **Drag to reorder: `@dnd-kit/react`, kept inside `PageGrid`.** Three options were compared:
  - `@dnd-kit/react` 0.5.0 (maintained, MIT): grids, `KeyboardSensor` and screen-reader announcements
    built in.
  - Legacy `@dnd-kit/core` 6.3.1 + `@dnd-kit/sortable` 10.0.0: stable, but no release since 2024-12.
  - `@hello-pangea/dnd`: strong accessibility, but single-direction lists only, so no multi-row grid.

  Pick `@dnd-kit/react`, pinned exact because it is still 0.x. Only `PageGrid` imports it, so a swap
  touches one file. It is a toolkit, not a component kit, so "shadcn only" still holds; note it in
  AGENTS.md. Drag is a bonus: move buttons and the keyboard path (as the Merge list has today) stay the
  primary way, and e2e tests use them.
- **Images → PDF: no library.**
  - `pdf-lib` would cover it but has had no release since 2022 (1.17.1).
  - A small hand-written builder is enough. It embeds JPEG as-is (`DCTDecode`). Other formats are
    decoded with `createImageBitmap` and a canvas, then stored with Flate (`CompressionStream`).
  - qpdf does the final assembly, so the builder only makes one-page PDFs.

### Applying a page plan with qpdf (verified 2026-10-08, qpdf-wasm 1.0.0)

A plan is a list of `{ file, page, rotation }`. One qpdf run applies it:

```
--empty --pages a.pdf 3 b.pdf 1 a.pdf 1 -- --rotate=+90:1 --rotate=+180:3 out.pdf
```

Pages from several files interleave in any order, and `--rotate=…:N` uses the **output** page number.
Encryption rules stay as they are:

- **Merge:** output is never encrypted (`--empty`).
- **Extract and Organize:** use the source file instead of `--empty`, so the owner restrictions stay.

Run it through `qpdf.run()` with `onProgress` (from 1.1.0), then `assertOutput()`.

### Shared pieces

- **`src/lib/page-plan.ts` + tests** (pure):
  - the plan model;
  - move, rotate and delete;
  - plan → qpdf args.
- **`src/components/PageGrid.tsx`:**
  - thumbnails about 150 px wide, rendered only when they scroll into view (`IntersectionObserver`), one
    or two at a time;
  - each canvas is turned into an image and freed, followed by `page.cleanup()`;
  - rotation shown with a CSS transform (no re-render);
  - per page: select, move (buttons, keyboard, drag), rotate left/right, delete.

  Try `content-visibility: auto` for long documents before adding a virtualization library.
- **Phones:** a 300-page PDF must stay responsive, so use small scale and few concurrent renders.

### The tools

- **Merge, renamed "Merge PDFs & images":**
  - **Inputs:** PDFs plus JPEG, PNG and WebP. Each image becomes a one-page PDF first.
  - **Grid:** shows every page of every input; the user arranges, then downloads.
  - **Single image:** allowed on its own (one photo → one PDF).
  - **Password check:** `ensureNoOpenPassword` runs on PDFs only.
  - **Keep:** the `/merge` URL.
  - **Discoverability:** consider an "Images to PDF" home card that links to `/merge`. The spec decides
    whether `src/tools.ts` gets an alias entry for it.
- **Extract:**
  - **Picking pages:** in the grid; the output is the selected pages in grid order, with their
    rotations.
  - **Range box:** stays, and edits the same selection (`page-ranges.ts`). For long documents typing
    "1-50" beats clicking.
  - **Restrictions:** kept.
- **Organize (new, `/organize`):**
  - **What it does:** one PDF; reorder, rotate and delete pages, then download all remaining pages.
  - **Restrictions:** kept.
  - **Rules:** like every tool except Decrypt, it refuses PDFs that need a password to open.
  - **Later:** if Extract and Organize turn out nearly identical, consider folding Extract into
    Organize.

### Images (inside Merge)

- **Accepted types:** JPEG, PNG and WebP, detected from the magic bytes, not the extension.
- **HEIC/HEIF:** refused with "Convert it to JPEG first" (only Safari decodes it).
- **GIF:** first frame only, or refuse (decide).
- **JPEG:** embedded without re-encoding. Read the EXIF orientation and rotate the page to match, or
  phone photos come out sideways.
- **Transparent PNG/WebP:** keep with an `SMask`, or flatten onto white (decide).
- **Page size:**
  - "Fit to A4" (default, with margins, portrait or landscape per image);
  - or "Same size as the image".
- **Memory:** a 12 MP photo is about 48 MB once decoded, so decode one image at a time and call
  `bitmap.close()` before the next.
- **Size limits:** the total size still counts against `MAX_TOTAL_BYTES` / `PHONE_MAX_BYTES`.

### Build order (one commit each, TDD, per AGENTS.md "Adding a tool")

1. **Libraries:**
   - add `pdfjs-dist` and `@dnd-kit/react` (exact versions);
   - ship the three wasm decoders with the build;
   - after `npm run build`, confirm the PDF.js worker and wasm are in `dist/sw.js`'s precache list and
     the home page still loads no wasm.
2. **Page plan:** `page-plan.ts` + tests, plus integration tests in `src/lib/qpdf.integration.test.ts`:
   - interleave two files;
   - rotate by output page;
   - restrictions kept for Organize and Extract, none for Merge.
3. **Image helpers:** `image-files.ts` (type sniffing, JPEG size and EXIF orientation) and
   `images-to-pdf.ts` (one-page PDFs), with tests; check outputs with `inspectPdf()`.
4. **`PageGrid`:** with thumbnails, the move/rotate/delete actions and the keyboard path.
5. **Organize:** page, registry entry, `e2e/organize.spec.ts`.
6. **Extract:** moved onto the grid; update `e2e/extract.spec.ts` (grid and range box agree).
7. **Merge:** moved onto the grid, with images and the rename; update `e2e/merge.spec.ts`:
   - mixed PDF + JPEG + PNG in a chosen order;
   - rotated JPEG → landscape page;
   - HEIC and non-images refused.
8. **Shell and docs:**
   - "six tools" → seven in the shell copy and tests;
   - add `/organize` to the offline and 375 px checks;
   - AGENTS.md: "What this is", the map, the libraries;
   - CHANGELOG `## 1.2.0`, `package.json` version.

If 1.2.0 runs long, split it: grid + Organize/Extract/Merge in 1.2.0, images in Merge in 1.3.0.

### Owner checks for 1.2.0 (tick before release)

- [ ] 10 photos from an iPhone (shared as JPEG) → Merge → one PDF; pages upright, in order, sharp.
- [ ] Same on an Android phone, in Chrome.
- [ ] A screenshot PNG with transparency looks right.
- [ ] A 300-page PDF in Organize on a phone: thumbnails appear while scrolling, the page stays responsive.
- [ ] A reordered and rotated PDF opens correctly in Preview/Acrobat and in a phone's PDF viewer.
- [ ] Merge with a PDF and photos mixed: pages in the arranged order.
- [ ] Drag to reorder works with a mouse and with touch; the move buttons work with a screen reader.
- [ ] Works offline after one online visit (airplane mode, installed PWA), including thumbnails.
