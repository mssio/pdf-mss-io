# Owner checks before 1.0.0

Manual checks only a person can do (in a real browser or on a phone). Tick each box (`- [x]`) after
checking it. **Release 1.0.0 (plan Task 13) does not start while any box here is unticked.**

Each section becomes checkable once its task is done; the status line says which ones are ready.

## Setup

```bash
cd pdf-mss-io
nvm use            # Node 24
npm install
npm run dev        # http://localhost:5173
```

Test PDFs (available after Task 4): `.private/fixtures/plain.pdf` (5 pages, title "Plain sample"),
`protected.pdf` (password `open-me`), `restricted.pdf` (opens without a password, printing disabled).
Also keep one real-world PDF of your own handy.

## Task 1: App shell (ready)

- [ ] Home page shows the "PDF" badge + "Toolbox" header, Home link and a theme toggle button.
- [ ] Footer reads "PDFs are processed locally in your browser. Nothing is uploaded."
- [ ] Theme toggle switches light/dark; the choice survives a reload with no flash of the wrong theme.
- [ ] With no saved choice, the app follows the system light/dark setting.
- [ ] The browser tab shows the new favicon (dark tile, white document, open padlock) in light and dark browser themes.
- [ ] The page looks like the old app (fonts, background glow, card style).

## Task 4: Decrypt (ready)

- [ ] Header shows a "Decrypt" link on a wide window; home shows the Decrypt card.
- [ ] `protected.pdf` with a wrong password → "Incorrect password. Check it and try again."
- [ ] `protected.pdf` with `open-me` → "Your PDF is ready"; the download is named `protected-d.pdf` and opens without a password.
- [ ] `restricted.pdf` with an empty password → succeeds; the result prints normally.
- [ ] A `.txt` file → "File must be a PDF."
- [ ] "Decrypt another file" returns to an empty form; "Back to home" works.
- [ ] DevTools → Network: opening `/` alone loads no `.wasm`; the first Decrypt loads `qpdf-*.wasm` once.

## Task 5: Encrypt (ready)

- [ ] Different passwords → "Passwords don't match."; empty → "Password is required."
- [ ] `plain.pdf`, password `secret`, printing unticked → `plain-protected.pdf` asks for `secret` in your PDF viewer, and printing is disabled.
- [ ] `protected.pdf` → "This PDF is password-protected. Remove its password with Decrypt first." and the "Go to Decrypt" link works.
- [ ] `restricted.pdf` → succeeds.

## Task 6: Merge (ready)

- [ ] Adding files in two batches appends them; up/down/remove work; up is disabled on the first row, down on the last.
- [ ] `plain.pdf` + `restricted.pdf` → "2 files, 7 pages." plus the note that restrictions aren't kept; `merged.pdf` has the pages in the chosen order.
- [ ] Adding `protected.pdf` → the error names "protected.pdf" and links to Decrypt.
- [ ] Keyboard only: Tab reaches the drop zone (Enter opens the file picker) and every row button.
- [ ] Adding a non-PDF renamed to `.pdf` (or an empty file) → the error names that file.
- [ ] After removing the file an error was about, the error disappears.

## Task 7: Extract pages (ready)

- [ ] `plain.pdf` → "This PDF has 5 pages."; Extract stays disabled until then.
- [ ] Pages ` 1 - 2 , Z ` → `plain-pages.pdf` with 3 pages; "Extracted 3 pages in your browser."
- [ ] Pages `abc` → "Enter pages like 1-3,7 or 5-z."; pages `9` → "Could not process this PDF." with "out of range" detail.
- [ ] `protected.pdf` → password-protected error with the Decrypt link.

## Task 8: Compress (ready)

- [ ] `plain.pdf` → "Your PDF is smaller" with before → after and a percentage; the download opens.
- [ ] Compressing that downloaded file again → "No smaller version", the qpdf note, and no download button.
- [ ] `protected.pdf` → password-protected error with the Decrypt link.

## Task 9: Info (ready)

- [ ] `plain.pdf` → title "Plain sample", author "Test Author", a created date, 5 pages, PDF 1.7, Letter, "Not encrypted", file size, Fast web view "No", Attachments "None".
- [ ] `restricted.pdf` → "Restrictions only (opens without a password)" with "AES-256" and "Printing" badges.
- [ ] `protected.pdf` → password-protected error with the Decrypt link.
- [ ] Your real-world PDF → no crash; missing fields are simply left out.
- [ ] A linearized PDF (e.g. the Encrypt/Compress output re-saved with "fast web view", or any web-optimized PDF) shows the "Linearized" badge; `plain.pdf` shows "No".

## Task 10: PWA and offline (ready)

Run `npm run build && npm run preview` and open http://localhost:4173 in Chrome.

- [ ] DevTools → Application → Service workers: `sw.js` is activated; Cache storage contains `qpdf-*.wasm`.
- [ ] Application → Manifest: name "PDF Toolbox", icons shown, no installability errors.
- [ ] Network → Offline, then reload `/decrypt` directly → the page loads, and decrypting `protected.pdf` works.
- [ ] Offline, `/info` also loads and works.
- [ ] Back online: after a new build, close every tab of the app and reopen it → the new version appears.

## Task 12: Final checks (ready)

Desktop (`npm run preview`; Chrome plus Safari or Firefox):

- [ ] Every tool URL loads when pasted into a new tab (`/decrypt`, `/encrypt`, `/merge`, `/extract`, `/compress`, `/info`).
- [ ] Both themes look right on every page.
- [ ] Window 375 px wide: header shows only Home + theme toggle; home grid is one column; nothing overflows.
- [ ] A file over 250 MB (`mkfile 260m big.pdf`) → size-limit error and the button is disabled.
- [ ] With the dev server stopped mid-session, clicking a tool you haven't opened yet shows "Something went wrong" with Reload / Back to home, inside the normal header and footer.

Phone (deploy `dist/` somewhere with HTTPS, or `npm run preview -- --host` on the same Wi-Fi for the non-offline checks):

- [ ] Add to Home Screen → opens full-screen with the padlock icon.
- [ ] Encrypt a ~100 MB PDF: works, or the memory message appears (if it fails, tell Claude to lower the limits).
- [ ] Encrypt a ~250 MB PDF: works, or the memory message appears (same).
- [ ] Airplane mode → open from the home screen → Decrypt works.

## Before release

- [ ] Every box above is ticked.
