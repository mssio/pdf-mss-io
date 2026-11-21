# 1.1.1: source links, MIT license, About page

Status: approved 2026-11-20.

## Why

The app's promise is that files and passwords never leave the device. Public source code lets anyone check
that. The site also ships `qpdf.wasm` (qpdf, zlib, libjpeg, Emscripten, musl, LLVM libc++), whose licenses ask
for notices the site doesn't show today. One page does both jobs.

## Approaches

- **Footer link only:** cheapest, but can't hold the third-party notices; the footer already wraps on phones.
- **About page + one footer link (picked):** room for the trust message, both repos and the credits; works
  offline; room for more later.
- **Both a footer "Source code" link and an About page:** source one tap closer, more footer clutter.

The owner asked for the recommendation and approved the About page.

## Scope

- Branch `release/1.1.1` from `post-release-1.1.0-cleanup` (its 1.1.0 docs ship with this release).
- `LICENSE`: MIT, "Copyright (c) 2026 Mario Suharja". `package.json`: `"license": "MIT"`.
- Version 1.1.1: `package.json` (+ lockfile), the `AGENTS.md` test-build example, `CHANGELOG.md` entry.
  README version and `docs/todo.md` follow the usual release-PR flow.
- Non-goals: home-page link, contributing guide, any tool change.

## `/about` page

Lazy route `/about` in `src/router.ts`, `src/pages/AboutPage.tsx` exporting `Component`. Layout matches
`/offline` and the not-found page: centered `Card`s in `max-w-lg` (the notices card may use `max-w-2xl`
if text needs it — builder's call), shadcn only, theme tokens only.

Content, top to bottom:

1. `h1` "About PDF Toolbox". Lead: "PDF Toolbox runs entirely in your browser. Your files and passwords never
   leave your device. The code is open source (MIT), so anyone can check."
2. **Source code** — two rows, each: name, one line of what it is, license badge, link:
   - "PDF Toolbox" — this app — MIT — `https://github.com/mssio/pdf-mss-io`
   - "qpdf-wasm" — the PDF engine (qpdf compiled to WebAssembly) — Apache-2.0 — `https://github.com/mssio/qpdf-wasm`
   - Version line: "Version 1.1.1" (from `__APP_VERSION__`).
3. **Credits** — "The PDF engine is built from this software:" then one entry per library in
   `THIRD_PARTY_NOTICES.md` (name + version as in its `##` heading, source link when present). The required
   sentence "This software is based in part on the work of the Independent JPEG Group." shown as plain text.
   Full license texts behind a native `<details>`/`<summary>` per library (closed by default), in a `<pre>`
   with `whitespace-pre-wrap`, small mono text and a max height with scroll so the page stays short.
4. "Back to home" button, as on `/offline`.

Notices come from `@mssio/qpdf-wasm/THIRD_PARTY_NOTICES.md` imported with `?raw` (bundled into the About
chunk, precached; no hand copy). A pure parser `src/lib/third-party-notices.ts` (+ test) splits it into
`{ name, intro, sections: { title, text }[] }`. If the package's file format changes, the test catches it.

## UI / UX rules

- **Mobile first:** readable at 320 px; long URLs and license lines wrap (`break-words` / `pre-wrap`),
  no horizontal page scroll. Links and summaries are at least 44 px tall to tap.
- **External links:** `target="_blank" rel="noopener noreferrer"`, an `ExternalLink` lucide icon
  (`aria-hidden`), and "(opens in a new tab)" in `sr-only` text. Link text is the repo name, never
  "click here".
- **Headings:** one `h1`, then `h2` per card (Source code, Credits), `h3` per library. Matches reading order.
- **Keyboard and focus:** everything reachable by Tab; visible focus ring (existing `focus-visible` tokens);
  `<summary>` is keyboard-operable natively.
- **Offline:** the page itself works offline (precached chunk). No network fetch at runtime.
- **Copy style:** short sentences, about what happens on the device (AGENTS.md).
- **Title:** the tab title stays "PDF Toolbox", as on every other page.

## Footer

Add " · About" (`Link` to `/about`, same `underline-offset-4 hover:underline` style as the offline link),
placed after the version and before the update button / offline link.

## Tests

- Unit: `third-party-notices.test.ts` against the real package file (every library found, IJG sentence
  present, each section non-empty) and a small fixture.
- E2E `e2e/about.spec.ts`: footer link opens `/about`; both repo links have the right `href`, `target`
  and `rel`; credits list qpdf and libjpeg with the IJG sentence; a `<details>` opens; no horizontal
  scroll at 320 px. Extend `offline.spec.ts` to open `/about` offline.
- `npm run lint && npm test && npm run build && npm run test:e2e`; confirm the About chunk is in `dist/sw.js`.

## Left to the builder

Exact card spacing, badge styling, and the `pre` max height.
