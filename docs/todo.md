# Release checks for 1.0.0

Release 1.0.0 (plan Task 17) starts only when **both** are true:

1. `npm run test:e2e` passes (all automated checks below).
2. Every owner box below is ticked (`- [x]`).

Status: Tasks 1–14 done. Task 15 adds browser tests for the six tools, which will move most of the
"Tools" boxes below into the automated table; Task 16 finalizes this file.

## Setup

```bash
cd pdf-mss-io
nvm use                                  # Node 24
npm install
npx playwright install chromium webkit   # once, ~300 MB, outside the repo
npm run test:e2e                         # builds, then runs the browser tests
npm run dev                              # http://localhost:5173 for the manual checks
```

Test PDFs are in `e2e/.fixtures/` after a test run (and in `.private/fixtures/`): `plain.pdf`
(5 pages, title "Plain sample"), `protected.pdf` (password `open-me`), `restricted.pdf` (opens without
a password, printing disabled). Also keep one real-world PDF of your own handy.

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
| No `type="password"` input anywhere; password fields masked and carry the password-manager opt-outs | `e2e/password-fields.spec.ts` |
| Offline: service worker active and wasm cached, then with the server stopped `/info` and `/decrypt` load and decrypting works (Chromium and WebKit) | `e2e/offline.spec.ts` |

## Owner checks

### Look and feel

- [ ] The pages look like the old app (fonts, background glow, card style) in light and dark mode.
- [ ] The browser tab shows the new favicon (dark tile, white document, open padlock) in light and dark browser themes.
- [ ] Type a password in Decrypt and in Encrypt and submit: neither the browser nor your password manager offers to save it.

### Tools (most of these become automated in Task 15)

Decrypt:
- [ ] `protected.pdf` with a wrong password → "Incorrect password. Check it and try again."; then `open-me` → `protected-d.pdf` opens without a password.
- [ ] `restricted.pdf` with an empty password → succeeds; the result prints normally.
- [ ] A `.txt` file → "File must be a PDF."; "Decrypt another file" and "Back to home" work.

Encrypt:
- [ ] Different passwords → "Passwords don't match."; empty → "Password is required."
- [ ] `plain.pdf`, password `secret`, printing unticked → `plain-protected.pdf` asks for `secret` in your PDF viewer, and printing is disabled.
- [ ] `protected.pdf` → "This PDF is password-protected. Remove its password with Decrypt first." and the "Go to Decrypt" link works.

Merge:
- [ ] Adding files in two batches appends them; up/down/remove work; up is disabled on the first row, down on the last; `merged.pdf` keeps the chosen order.
- [ ] `plain.pdf` + `restricted.pdf` → "2 files, 7 pages." plus the note that restrictions aren't kept.
- [ ] A protected, non-PDF or empty file → the error names that file; removing it clears the error.
- [ ] Keyboard only: Tab reaches the drop zone (Enter opens the file picker) and every row button.

Extract pages:
- [ ] `plain.pdf` → "This PDF has 5 pages."; pages ` 1 - 2 , Z ` → `plain-pages.pdf` with 3 pages.
- [ ] Pages `abc` → "Enter pages like 1-3,7 or 5-z."; pages `9` → "Could not process this PDF." with "out of range" detail.

Compress:
- [ ] `plain.pdf` → "Your PDF is smaller" with before → after; compressing that download again → "No smaller version" without a download button.

Info:
- [ ] `plain.pdf` → title, author, created date, 5 pages, PDF 1.7, Letter, "Not encrypted", Fast web view "No", Attachments "None".
- [ ] `restricted.pdf` → "Restrictions only (opens without a password)" with "AES-256" and "Printing" badges; a linearized PDF shows "Linearized".
- [ ] Your real-world PDF → no crash; missing fields are simply left out.

Size limit:
- [ ] A file over 250 MB (`mkfile 260m big.pdf`) → size-limit error and the button is disabled.

### Your browsers

- [ ] Open every tool once in your everyday browser (if it isn't Chrome): it works the same.
- [ ] After a new build, close every tab of the app and reopen it → the new version appears.

### Phone

Deploy `dist/` somewhere with HTTPS (`npm run preview -- --host` on the same Wi-Fi works for the non-offline checks):

- [ ] Add to Home Screen → opens full-screen with the padlock icon.
- [ ] Encrypt a ~100 MB PDF: works, or the memory message appears (if it fails, tell Claude to lower the limits).
- [ ] Encrypt a ~250 MB PDF: works, or the memory message appears (same).
- [ ] Airplane mode → open from the home screen → Decrypt works.

### Before release

- [ ] Every box above is ticked.
