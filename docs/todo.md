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
| Header logo + "PDF Toolbox", Home link, theme toggle, footer text, six tool cards, unknown addresses show "Page not found" with a way home | `e2e/shell.spec.ts` |
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
| Offline: service worker active and wasm cached, then with the server stopped `/info` and `/decrypt` load and decrypting works (Chromium and WebKit) | `e2e/offline.spec.ts` |

## Owner checks

Only a person can check these. Tick each box after checking it.

- [ ] Screenshots in `test-results/screenshots/` (light and dark, 375 px and 1280 px) look right and match the old app's style.
- [ ] The favicon (dark tile, white document, open padlock) shows in a real browser tab, in light and dark browser themes.
- [ ] Encrypt `plain.pdf` with password `secret` and printing unticked: your PDF viewer asks for `secret` and blocks printing.
- [ ] Type a password in Decrypt and in Encrypt and submit: neither the browser nor your password manager offers to save it.
- [ ] Open every tool once in your everyday browser (if it isn't Chrome): it works the same.
- [ ] After a new build, open the app once (online), close every tab, then reopen it → the new version appears.
- [ ] Inspect one real-world PDF of your own in Info → no crash; missing fields are simply left out.

Phone (deploy `dist/` somewhere with HTTPS; `npm run preview -- --host` on the same Wi-Fi works for the non-offline checks):

- [ ] Add to Home Screen → opens full-screen with the padlock icon.
- [ ] Encrypt a ~100 MB PDF: works, or the memory message appears (if it fails, tell Claude to lower the limits).
- [ ] Encrypt a ~250 MB PDF: works, or the memory message appears (same).
- [ ] Airplane mode → open from the home screen → Decrypt works.
- [ ] Every box above is ticked.
