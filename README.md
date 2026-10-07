# PDF Toolbox

Private PDF tools that run entirely in your browser. PDFs and passwords never leave the device:
every operation runs locally with [qpdf](https://github.com/qpdf/qpdf) compiled to WebAssembly
([`@mssio/qpdf-wasm`](https://www.npmjs.com/package/@mssio/qpdf-wasm)). The build is plain static
files, and the app installs as a PWA that works offline after the first visit.

Current version: **1.0.0** ([changelog](CHANGELOG.md)).

## Tools

| Tool | Path | What it does |
|---|---|---|
| Decrypt | `/decrypt` | Removes a PDF's password (or, with an empty password, its owner restrictions). |
| Encrypt | `/encrypt` | Adds an open password (AES-256) and permissions for printing, editing, copying and comments. |
| Merge | `/merge` | Combines several PDFs in the order you choose. |
| Extract pages | `/extract` | Saves selected pages (`1-3,7`, `5-z`) as a new PDF. |
| Compress | `/compress` | Repacks and recompresses the PDF structure (images are not downsampled). |
| Info | `/info` | Shows properties, page size, restrictions and attachments. |

Only Decrypt accepts PDFs that need a password to open; the other tools ask you to decrypt first.
PDFs that open without a password but carry restrictions work everywhere.

**Size limit:** 250 MB combined per operation (phones get a warning above 100 MB). qpdf's
WebAssembly memory runs out on larger inputs. The values live in `src/lib/limits.ts`.

## Requirements

- Node 24 LTS (`nvm use` reads `.nvmrc`). Vitest 5 does not support Node 25.
- npm

## Scripts

```bash
npm install
npm run dev       # dev server on http://localhost:5173
npm test          # unit + integration tests (real qpdf wasm in Node)
npm run test:e2e  # browser tests with Playwright (builds first)
npm run lint
npm run build     # type-check and build static files into dist/
npm run preview   # serve dist/ on http://localhost:4173 (service worker active)
npm run icons     # regenerate PWA icons from public/favicon.svg
```

Before the first `npm run test:e2e`, install the browsers once: `npx playwright install chromium webkit` (~300 MB, outside the repo).

## Stack

Vite 8, React 19, React Router 8 (data router, lazy routes), TypeScript 6.0, Tailwind CSS 4,
shadcn/ui (new-york) on Radix, `@mssio/qpdf-wasm`, `vite-plugin-pwa`, Vitest 5, Playwright (E2E).

## Hosting `dist/`

`dist/` is static. Any web server or static host works if it does three things:

The app must be served from the domain root (`https://example.com/`), not a sub-path; `start_url` and `scope` are `/`.

1. **Falls back to `index.html`** for unknown paths, so `/decrypt` loads on a direct visit or refresh.
2. Serves `.wasm` as `application/wasm` (fastest compile; other types still work).
3. Sends `Cache-Control: no-cache` for `index.html` and `sw.js` so updates are picked up.
   Files in `assets/` are content-hashed and can be cached forever.

**nginx**

```nginx
location / {
  try_files $uri /index.html;
}
location = /index.html { add_header Cache-Control "no-cache"; }
location = /sw.js      { add_header Cache-Control "no-cache"; }
location /assets/      { add_header Cache-Control "public, max-age=31536000, immutable"; }
# .wasm must be served as application/wasm: check nginx's mime.types has "application/wasm wasm;".
# Add it there if missing. Don't put a separate types {} block here; it replaces the whole MIME map.
```

nginx `add_header` inside a `location` replaces headers set at `server` level (for example a
CSP); repeat them there if you use both.

**Netlify / Cloudflare Pages:** add `public/_redirects` containing `/*  /index.html  200`.

**Caddy**

```caddy
example.com {
  root * /srv/pdf-toolbox
  try_files {path} /index.html
  file_server
}
```

**GitHub Pages:** copy `dist/index.html` to `dist/404.html` after building. Use a user/organization site or a custom domain, since project sites live under `/repo/`.

**Content-Security-Policy:** if you set one, allow `script-src 'self' 'wasm-unsafe-eval'` plus the
inline theme script in `index.html` (by its `sha256-` hash, or `'unsafe-inline'`), `worker-src 'self'`, and
`connect-src 'self'` (needed to fetch the wasm). Without the theme script allowance the page still works but flashes the wrong
theme on load.

## Offline

The service worker precaches the whole app, including the qpdf worker and `.wasm` (about 2.7 MB in total),
after the first online visit. A new deployment is used after every tab of the app has been closed and the app is opened again; open pages are never reloaded.

## Adding a tool

1. Write any non-React logic in `src/lib/` with a unit test.
2. Create `src/pages/<Name>Page.tsx` exporting `function Component()`, built from `ToolPage`,
   `ResultCard`, `PdfFileDropzone`, `useQpdfJob` and `useBlobUrl` (see `CompressPage.tsx`).
3. Add an entry to `src/tools.ts`; the route, header link and home card follow from it.
4. Add an integration test for the qpdf call in `src/lib/qpdf.integration.test.ts`.

## Release checks

Release 1.0.0 needs `npm run test:e2e` to pass and every owner box in [docs/todo.md](docs/todo.md) ticked.

See [AGENTS.md](AGENTS.md) for the rules the code follows.
