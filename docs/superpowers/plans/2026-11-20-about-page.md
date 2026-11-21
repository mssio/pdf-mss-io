# 1.1.1 About Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 1.1.1 with an MIT license, an `/about` page (trust message, both repo links, the PDF engine's
third-party credits) and an "About" footer link.

**Architecture:** A pure parser turns `@mssio/qpdf-wasm`'s `THIRD_PARTY_NOTICES.md` (imported `?raw`, bundled
into the lazy About chunk, so it's precached) into structured credits. `AboutPage.tsx` renders them with shadcn
`Card`s and native `<details>`. One footer `Link` reaches it.

**Tech Stack:** Vite 8, React 19, React Router 8, shadcn (new-york), Tailwind tokens, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-20-about-page-design.md`

## Global Constraints

- Branch `release/1.1.1` (already created from `post-release-1.1.0-cleanup`). Commit and push after each task.
- No runtime network fetches; the notices text is bundled. GitHub links are plain `<a>`s.
- shadcn primitives and theme tokens only; no raw hex; `cn()` for class merging.
- External links: `target="_blank" rel="noopener noreferrer"`, `ExternalLink` icon `aria-hidden`, `sr-only` "(opens in a new tab)".
- Headings: one `h1` "About PDF Toolbox", `h2` "Source code" and "Credits", `h3` per library.
- No horizontal scroll at 320 px; tap targets ≥ 44 px (`min-h-11`) for links and `<summary>`.
- Lead copy, verbatim: "PDF Toolbox runs entirely in your browser. Your files and passwords never leave your device. The code is open source (MIT), so anyone can check."
- Repo URLs verbatim: `https://github.com/mssio/pdf-mss-io`, `https://github.com/mssio/qpdf-wasm`.
- IJG sentence verbatim: "This software is based in part on the work of the Independent JPEG Group."

## Review Focus

- **Upgrading `@mssio/qpdf-wasm` changes the notices format** → the unit test against the real package file fails loudly instead of the page silently showing nothing (Task 2, real-file test).
- **Phone at 320 px with long license lines and URLs** → text wraps, page never scrolls sideways (Task 3, e2e overflow test).
- **Opening /about offline** → page and credits render from the precache (Task 3, `offline.spec.ts`).
- **Keyboard-only user** → can Tab to each repo link and open a license with Enter (Task 3, e2e keyboard test).
- **Dark mode** → `<pre>` uses `bg-muted text-foreground`, not a fixed light background (Task 3, code review; covered by tokens rule).

---

### Task 1: MIT license and version 1.1.1

**Files:**
- Create: `LICENSE`
- Modify: `package.json`, `package-lock.json`, `AGENTS.md` (test-build example "Version 1.1.0 · test …" → 1.1.1), `CHANGELOG.md`, `README.md`

- [ ] **Step 1:** `npm version 1.1.1 --no-git-tag-version` (updates `package.json` and the lockfile), then add `"license": "MIT"` to `package.json` after `"version"`.
- [ ] **Step 2:** Write `LICENSE`: the standard MIT text (opensource.org/license/mit) with the line `Copyright (c) 2026 Mario Suharja`.
- [ ] **Step 3:** `CHANGELOG.md`: add above 1.1.0:

```markdown
## [1.1.1] - Unreleased

### Added

- An About page (footer → About): links to the source code of PDF Toolbox and of its PDF engine, and the
  credits and licenses of the software inside the engine.
- PDF Toolbox is now open source under the MIT license.
```

  README: add a `## License` section at the end: "MIT, see [LICENSE](LICENSE). The PDF engine (`@mssio/qpdf-wasm`) is Apache-2.0; its third-party licenses are shown on the About page." Update the `AGENTS.md` test-build example to 1.1.1.
- [ ] **Step 4:** Run `npm run build && grep -c '1.1.1' dist/assets/index-*.js`. Expected: build succeeds, count ≥ 1.
- [ ] **Step 5:** Commit `chore: version 1.1.1 and MIT license`, push.

### Task 2: Third-party notices parser

**Files:**
- Create: `src/lib/third-party-notices.ts`, `src/lib/third-party-notices.test.ts`

**Interfaces:**
- Produces:

```ts
export const IJG_ACKNOWLEDGEMENT = "This software is based in part on the work of the Independent JPEG Group.";
export interface LicenseText { title: string | null; text: string }      // title from a "### X" heading
export interface ThirdPartyLibrary {
  name: string;               // the "## " heading text, e.g. "zlib (zlib-1.3.2, via Emscripten 6.0.11 ports)"
  sourceUrl: string | null;   // from a prose line "Source: https://… …" (first URL), else null
  notes: string[];            // other prose lines under the heading, backticks stripped
  licenses: LicenseText[];    // each ````text … ```` fence, in order
}
export function parseThirdPartyNotices(markdown: string): ThirdPartyLibrary[];
```

  Rules: everything before the first `## ` is skipped. Inside a fence (opening line starts with four backticks
  plus `text`, closing line exactly four backticks), lines are kept verbatim (no `#` handling) and the text is
  trimmed of leading/trailing blank lines. A `### X` heading names the next fence; a fence without one gets `null`.

- [ ] **Step 1: Write the failing tests**

```ts
import { readFileSync } from "node:fs";
// fixture test
test("splits libraries, titled and untitled fences, source and notes", () => {
  const md = "# T\n\nintro\n\n## lib-a 1.0\n\nSource: https://example.com/a (tag v1), compiled.\n\n### LICENSE\n\n````text\n\n# not a heading\nA\n\n````\n\n## lib-b\n\nUses `x`.\n\n````text\nB\n````\n";
  expect(parseThirdPartyNotices(md)).toEqual([
    { name: "lib-a 1.0", sourceUrl: "https://example.com/a", notes: [], licenses: [{ title: "LICENSE", text: "# not a heading\nA" }] },
    { name: "lib-b", sourceUrl: null, notes: ["Uses x."], licenses: [{ title: null, text: "B" }] },
  ]);
});
// real-file test: guards against a qpdf-wasm upgrade changing the format
test("parses the notices shipped in @mssio/qpdf-wasm", () => {
  const md = readFileSync("node_modules/@mssio/qpdf-wasm/THIRD_PARTY_NOTICES.md", "utf8");
  const libs = parseThirdPartyNotices(md);
  expect(libs.map((l) => l.name.split(" ")[0])).toEqual(["qpdf", "zlib", "libjpeg", "Emscripten", "musl", "libc++"]);
  expect(libs[0].sourceUrl).toBe("https://github.com/qpdf/qpdf");
  expect(libs[0].licenses.map((l) => l.title)).toEqual(["LICENSE.txt", "NOTICE.md"]);
  expect(libs.filter((l) => l.name !== libs[5].name).every((l) => l.licenses.length > 0 && l.licenses.every((t) => t.text.length > 0))).toBe(true);
  expect(libs[5].notes.length).toBeGreaterThan(0);  // libc++: note only, no license text
  expect(md).toContain(IJG_ACKNOWLEDGEMENT);
});
```

- [ ] **Step 2:** `npx vitest run src/lib/third-party-notices.test.ts` → FAIL (module not found).
- [ ] **Step 3:** Implement `parseThirdPartyNotices` as a single line scanner per the rules above.
- [ ] **Step 4:** Same command → PASS.
- [ ] **Step 5:** Commit `feat: parse the PDF engine's third-party notices`, push.

### Task 3: About page, route, footer link

**Files:**
- Create: `src/pages/AboutPage.tsx`, `e2e/about.spec.ts`
- Modify: `src/router.ts` (route after `/offline`), `src/components/AppShell.tsx` (footer), `e2e/offline.spec.ts`, `AGENTS.md` (Map: AboutPage, third-party-notices)

**Interfaces:**
- Consumes: `parseThirdPartyNotices`, `IJG_ACKNOWLEDGEMENT` (Task 2).
- Notices import (the package's `exports` blocks a subpath import, so use the relative path):
  `import noticesMarkdown from "../../node_modules/@mssio/qpdf-wasm/THIRD_PARTY_NOTICES.md?raw";` parsed once at module level.

- [ ] **Step 1: Write the failing e2e tests** in `e2e/about.spec.ts`:
  - `"footer About link opens the About page"`: from `/`, `footer` → link "About" → URL `/about`, `h1` "About PDF Toolbox" visible, lead text visible.
  - `"repo links open GitHub in a new tab"`: link named /PDF Toolbox/ has `href` `https://github.com/mssio/pdf-mss-io`, link /qpdf-wasm/ has `https://github.com/mssio/qpdf-wasm`; both `target="_blank"`, `rel="noopener noreferrer"`; text "Version " + package version visible.
  - `"credits list the engine's libraries"`: `h3`s include text "qpdf 12.4.2" and "libjpeg"; IJG sentence visible; every `details` closed initially.
  - `"keyboard opens a license"`: focus the first `summary` within Credits, press Enter, its `details` has `open`, its `pre` visible.
  - `"no sideways scroll at 320 px"`: viewport 320×640, open every `details` (click each summary), `scrollWidth - innerWidth ≤ 0`.
  - In `offline.spec.ts`, after the `/offline` check: `goto /about`, heading "About PDF Toolbox" and text "libjpeg" visible.
- [ ] **Step 2:** `npm run test:e2e -- about` → FAIL (no route).
- [ ] **Step 3:** `src/pages/AboutPage.tsx` exporting `function Component()`. Layout as `OfflinePage`: wrapper `mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14 grid gap-6`, three `Card`s:
  1. Header card: `h1` "About PDF Toolbox" (`text-lg font-semibold`) + lead in `CardDescription`.
  2. "Source code" card: two rows (name as the link with `ExternalLink` icon, one line description, `Badge variant="secondary"` with the license). Descriptions: "This app." / "The PDF engine: qpdf compiled to WebAssembly." Then `Version {__APP_VERSION__}` in `text-muted-foreground text-sm`.
  3. "Credits" card: "The PDF engine is built from this software:" then the IJG sentence, then per library an `h3` (name), source link if any (same external-link treatment, text = URL with `break-all`), notes as `text-sm text-muted-foreground`, and per license a `<details>` with `<summary>` "{title ?? 'License'}" (`min-h-11 cursor-pointer` + focus-visible ring tokens) and `<pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 font-mono text-xs text-foreground">`.
  4. "Back to home" `Button` as on `/offline`.
- [ ] **Step 4:** Route `{ path: "/about", lazy: () => import("@/pages/AboutPage") }` in `src/router.ts`. Footer in `AppShell.tsx`: after the build label and before the update button, `{" · "}<Link to="/about" className="underline-offset-4 hover:underline">About</Link>`.
- [ ] **Step 5:** `npm run test:e2e -- about offline shell` → PASS.
- [ ] **Step 6:** Update the `AGENTS.md` Map (`src/pages/AboutPage.tsx /about: source links + engine credits from qpdf-wasm's THIRD_PARTY_NOTICES.md`; add `third-party-notices` to the pure-helpers list).
- [ ] **Step 7:** Full gate: `npm run lint && npm test && npm run build && npm run test:e2e`, all pass; `grep -o 'AboutPage-[^"]*\.js' dist/sw.js` prints one file.
- [ ] **Step 8:** Commit `feat: About page with source links and engine credits`, push.
