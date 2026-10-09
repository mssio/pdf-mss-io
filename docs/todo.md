# Checks and follow-ups

Version 1.1.0 was released on 2026-10-09 (tag `v1.1.0`; see `CHANGELOG.md`), after 1.0.0 on 2026-10-07
(tag `v1.0.0`). Every owner check for both was done. For the next release, add its owner checks here as
unticked boxes and don't release until `npm run test:e2e` passes and every box is ticked.

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
| While qpdf writes, a progress bar rises (0–99%, never inside the announced status), then the result; checked for Compress and Encrypt on a 20 MB, 400-page PDF and verified with `inspectPdf` | `e2e/job-safeguard.spec.ts` |
| Info shows no progress bar | `e2e/info.spec.ts` |
| Footer shows "Ready offline" once installed and "/offline" shows it while offline; with no service worker it says "Not available offline yet" | `e2e/offline.spec.ts`, `e2e/shell.spec.ts` |
| Install banner: iPhone → How walks five step pages with full screenshots (Back/Next/Done, browser back), Not now remembered; Android → Install prompts once; none on desktop, in the installed app or during a job | `e2e/install.spec.ts` |
| Update prompt: a new deployment shows "Update available"; Later moves it to the footer button, which updates; an update during a job waits until the job is done | `e2e/update.spec.ts` |
| A job cut off by a page reload is explained once after the reload ("The page reloaded while a file was being processed…"), and a finished job leaves no notice | `e2e/phone.spec.ts` |
| Offline: service worker active and wasm cached, then with the server stopped `/info` and `/decrypt` load and decrypting works (Chromium and WebKit) | `e2e/offline.spec.ts` |

## Next versions

1.1.0's spec and plan stay in `docs/superpowers/` ([spec](superpowers/specs/2026-10-09-progress-bar-design.md),
[plan](superpowers/plans/2026-10-09-progress-bar.md)). Later versions are planned in `docs/notes/`:
[1.2.0](notes/1.2.0-plan.md) (page grid, Organize, images in Merge). When a release starts, copy its owner
checks here as unticked boxes; this file stays the release gate.
