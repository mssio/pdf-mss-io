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

## Planned for 1.2.0: Images to PDF

A seventh tool: pick several images, put them in order, get one PDF. It all runs on the device, works
offline and uploads nothing. qpdf can't turn images into pages, so a small builder in `src/lib/` writes
the PDF. qpdf then only tidies the result.

**Decide in the spec first** (brainstorm → `docs/superpowers/specs/`). Suggested defaults:

- **Inputs:** JPEG, PNG and WebP. Refuse HEIC/HEIF with "Convert it to JPEG first": only Safari can
  decode it, and a wasm decoder is too heavy for the precache. GIF: first frame only, or refuse.
- **JPEG:** embed the bytes as they are (`DCTDecode`), with no re-encoding and no quality loss. Read the
  EXIF orientation and rotate the page to match, or phone photos come out sideways.
- **Other formats:** decode with `createImageBitmap` and a canvas, then store the pixels losslessly
  (Flate via `CompressionStream`). Keep transparency with an `SMask`, or flatten onto white (decide).
- **Page size:** one choice on the page, either "Fit to A4" (default, with margins, portrait or
  landscape per image) or "Same size as the image". Letter only if someone asks.
- **Order:** reuse the Merge list (`src/lib/merge-list.ts`: append, move up/down, remove, keyboard
  path).
- **Builder:** hand-written (like `imageHeavyPdf()` in the qpdf-wasm repo) rather than `pdf-lib`, which
  would add ~200 KB to the precache. Revisit if the edge cases pile up.
- **After building:** run the output through `qpdf.compress()` (object streams), with `onProgress` from
  1.1.0, then `assertOutput()`, as for every download.
- **Limits:** the total size is checked against `MAX_TOTAL_BYTES` / `PHONE_MAX_BYTES`. Decoded pixels
  can be far larger than the file (a 12 MP photo is ~48 MB as RGBA), so decode one image at a time and
  free each bitmap (`bitmap.close()`) before the next.
- **Output name:** `images.pdf`, or the first image's name with `.pdf`.

**Build** (AGENTS.md "Adding a tool"):

1. `src/lib/images-to-pdf.ts` + tests (TDD), a pure builder taking `{ bytes, kind, width, height,
   orientation }[]` and a page size, returning PDF bytes. Also `src/lib/image-files.ts` + tests: detect
   the type from the magic bytes, not the extension, and read the JPEG size and EXIF orientation.
   Valid output is checked with `inspectPdf()`.
2. An image dropzone. Generalize `PdfFileDropzone` (accept list + messages) or add `ImageFileDropzone`.
3. `src/pages/ImagesToPdfPage.tsx`, a registry entry in `src/tools.ts` (lucide `Images` icon), then
   the shell copy and tests that say "six tools", and AGENTS.md "What this is".
4. Integration test: a built PDF through `qpdf.compress()` in `src/lib/qpdf.integration.test.ts`.
5. `e2e/images-to-pdf.spec.ts`: JPEG + PNG + WebP in a chosen order → page count, order and page
   sizes checked with `inspectPdf()`, HEIC refused, non-image refused, rotated JPEG gives a landscape
   page. Add it to the offline spec's tool list and the 375 px overflow check.
6. `npm run build`: the new chunk is in `dist/sw.js`'s precache.
7. CHANGELOG `## 1.2.0`, `package.json` version.

**Owner checks for 1.2.0** (tick before release):

- [ ] 10 photos from an iPhone (shared as JPEG) → one PDF; pages upright, in order, sharp.
- [ ] Same on an Android phone, in Chrome.
- [ ] A screenshot PNG with transparency looks right.
- [ ] Works offline after one online visit (airplane mode, installed PWA).
