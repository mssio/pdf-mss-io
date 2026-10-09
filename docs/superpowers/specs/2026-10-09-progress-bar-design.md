# PDF Toolbox 1.1.0: real progress bar

Date: 2026-10-09
Status: approved; revised 2026-10-09 after an iPhone test (smooth bar motion, section 4) and to add the
update prompt (section 7), offline readiness status (section 8) and the large-file reload fix
(section 9), and the install banner (section 10, draft for owner review)

## Goal

`@mssio/qpdf-wasm` 1.1.0 (released 2026-10-08) reports qpdf's write progress through an optional
`onProgress(percent)` callback. Release **PDF Toolbox 1.1.0** that uses it:

- show a percentage bar while qpdf writes a tool's output;
- detect a stuck engine faster and more fairly: once progress flows, fail on *no progress for 30 s*
  instead of only on a size-based total time.

1.1.0 also adds an **update prompt** (section 7): while online, the app checks for a newer deployment
and offers to switch to it. Nothing else changes in 1.1.0. Images and Organize stay in 1.2.0 (`docs/notes/1.2.0-plan.md`).
This spec replaces `docs/notes/1.1.0-plan.md`, deleted in the commit that adds this spec.

## Decisions (from the brainstorming conversation)

| Topic | Decision |
|---|---|
| Scope | Progress bar + stall-based time limit only. |
| Package | `@mssio/qpdf-wasm@^1.1.0`. Additive API; existing calls compile and behave as before. |
| Wiring | Explicit: `useQpdfJob().run()` passes the job an `onProgress` as a second argument; each page hands it only to the qpdf call that writes its download. No proxy around `Qpdf`, no global progress store. |
| Time limits | Size-based limit (`jobTimeoutMs`) until the first progress call; each call from 0–99 resets the deadline to 30 s (`STALL_TIMEOUT_MS`); a call at 100 resets it to `jobTimeoutMs` again for post-steps. A job that keeps progressing is never cut off. |
| After 100% | "Finishing…" text, no bar (a bar stuck at 100% looks frozen). |
| Info tool | No bar. `info()` takes no `onProgress`, and the Info tool's `run()` calls write no PDF. |
| UI primitive | shadcn new-york v4 `Progress`, adapted to `@radix-ui/react-progress`. |
| Bar motion | The fill glides to each new value (~600 ms, ease-out) and slides in from 0 when the bar appears, because qpdf's percent comes in bursts (section 1). No motion with "Reduce Motion" on. The `%` text always shows qpdf's real value. |
| Update prompt | In 1.1.0 (owner, 2026-10-09). Checks hourly, when the app returns to the foreground and when the device comes back online; dialog "Update available" with Later / Update now; after Later, an "Update to the latest version" button in the footer. Never reloads during a job. Static hosting only. |
| Offline status | In 1.1.0 (owner, 2026-10-09): footer shows whether the app is ready offline or still downloading; clicking opens `/offline` with the download progress. The first visit is put under the service worker's control as soon as the download finishes (`clientsClaim`). |
| Large-file reload | In 1.1.0 (owner, 2026-10-09): a 245 MB encrypt on the iPhone reloaded the page after 100% with no message. Keep the crash notice armed while the download is built, free the engine's memory before building it, then re-test; lower `PHONE_MAX_BYTES` only if it still fails. |
| Install banner | In 1.1.0 (owner, 2026-10-09): phones only, never once installed. Android Chrome/Edge: a real Install button (`beforeinstallprompt`). iPhone Safari: "How" opens `/install`, one step per page (`/install/1`…`/install/5`), each with a full-iPhone screenshot from the owner's phone in a phone frame (personal details blurred or replaced, address shown as `pdf.mss.io`). "Not now" hides it for 30 days. |
| App version | `1.1.0`. |

## 1. What the package gives us

Checked against the published 1.1.0 tarball and the package's spec §7
(`qpdf-wasm/docs/superpowers/specs/2026-10-08-streaming-progress-design.md`):

- `merge`, `split`, `selectPages`, `rotate`, `encrypt`, `decrypt`, `linearize`, `compress` and `run()`
  accept `onProgress?: (percent: number) => void`. `info()` does not.
- Integers 0–100, strictly rising within one output file, each passed on at once (at most 101 calls
  per file). Called on the main thread.
- **No calls before qpdf starts writing.** Reading the input and copying pages report nothing; for
  object-heavy PDFs that can be most of the job.
- No calls after the promise settles or after `terminate()`. Calls for a job keep coming until it
  settles even if the UI moved on, so the app must drop them itself.
- One percent can take ~0.5 s on desktop (compress) and several times that on phones. The package
  suggests a 30 s stall limit.
- **The percent counts objects written, not bytes** (measured 2026-10-09 on a 24 MB PDF with many
  small objects and a few 4 MB streams: encrypt went 0→25% in 3 ms, then paused on each big stream
  and jumped ~15% at a time). On a phone the first burst finishes before the first frame, so the bar
  first appeared at 36% in the owner's iPhone test. The bar shows how much of the file is written in
  objects, not how much time is left.
- **Same qpdf 12.4.2, byte-identical `qpdf.wasm` (2,226,004 bytes).** The out-of-memory behavior is
  unchanged, so `assertOutput()`, `MAX_TOTAL_BYTES`, `PHONE_MAX_BYTES` (250 MB) and the 3 MB
  precache limit stay as they are.

## 2. Data flow

### `useQpdfJob` (`src/lib/use-qpdf-job.ts`) and `src/lib/job-progress.ts`

```ts
// src/lib/job-progress.ts (with the pure helpers withProgress and createOnProgress)
export type JobStatusState = {
  phase: "load" | "run" | "finishing";
  label: string;
  startedAt: number;
  sizeBytes: number;
  /** Write progress 0–99 once qpdf reports it; null before the first call and again after 100. */
  percent: number | null;
};

// src/lib/use-qpdf-job.ts
run<T>(job: (qpdf: Qpdf, onProgress: (percent: number) => void) => Promise<T>, options: RunOptions)
```

The `onProgress` built for one `run()`:

1. always tells the time limiter (`progress(percent)`, section 3), even for a stale job: a stale job
   still occupies the shared engine, and if its limit expired, `resetQpdf()` would kill the engine
   under the job the user started since;
2. stops there if `id !== generation.current` (stale job, or after `reset()` / unmount);
3. otherwise sets status: `percent < 100` → `{ phase: "run", percent }`; `percent === 100` →
   `{ phase: "finishing", percent: null }`.

The phase used for error messages (`JobPhase` in `src/lib/qpdf.ts`) stays `"load" | "run"`;
`finishing` counts as `run`. `describeQpdfError` doesn't change.

### Pages

Each page passes `{ onProgress }` to the one call that writes its download:

| Tool | Call that gets `onProgress` | Before it (indeterminate) | After it ("Finishing…") |
|---|---|---|---|
| Decrypt | `qpdf.decrypt(file, { password, onProgress })` | — | `assertOutput` |
| Encrypt | `qpdf.encrypt(file, { …, onProgress })` | `ensureNoOpenPassword` | `assertOutput` |
| Merge | `qpdf.merge(files, { onProgress })` | `ensureNoOpenPassword` per file | `assertOutput` |
| Extract | `qpdf.selectPages(file, ranges, { onProgress })` | — (the page-count check is its own earlier job) | `qpdf.info(output.slice())` |
| Compress | `qpdf.compress(file, { onProgress })` | `ensureNoOpenPassword` | `assertOutput` |
| Info | none | whole job | — |

`ensureNoOpenPassword` and every `info()` call get no callback. A job that writes twice would restart
the bar, so the rule (documented in `AGENTS.md`) is: **pass `onProgress` only to the call that writes
the download.**

## 3. Time limits (`src/lib/run-job.ts`, `src/lib/qpdf.ts`)

`ENGINE_LOAD_TIMEOUT_MS` (120 s) and `jobTimeoutMs(sizeBytes)` keep their values. New constant in
`src/lib/qpdf.ts`, next to them:

```ts
/** Longest gap allowed between two progress calls while qpdf writes (package spec §7 suggests 30 s). */
export const STALL_TIMEOUT_MS = 30_000;
```

`runWithTimeLimits` gains a resettable job deadline:

- `TimeLimitedRun` gets `stallMs: number`. The job callback becomes `job(engine, progress)`, where
  `progress(percent)` re-arms the deadline: `percent < 100` → `stallMs` from now; `percent === 100` →
  `jobMs` from now.
- Before the first `progress` call the deadline is `jobMs` from job start, as today.
- Whichever deadline fires rejects with `JobTimeoutError`; `useQpdfJob` then calls `resetQpdf()` and
  shows today's message ("This file took too long to process on this device…"). Copy unchanged.
- `progress` after the race has settled (success, failure or timeout) does nothing.
- The load limit and the "late failure is swallowed" behavior are unchanged.

`useQpdfJob` composes the two: the `progress` from `runWithTimeLimits` is called inside its own
`onProgress` (after the generation check) and the result is what the page's job receives.

## 4. UI

### `src/components/ui/progress.tsx`

shadcn new-york v4 `Progress`, imports changed to `@radix-ui/react-progress`. Theme tokens only:
track `bg-primary/20`, indicator `bg-primary`, `h-2 rounded-full`. Add `@radix-ui/react-progress` to
`dependencies`. `value` is passed to Radix's Root (the stock component omits it) so `aria-valuenow` is set.

Indicator motion: `transition-transform duration-600 ease-out motion-reduce:transition-none` instead of
the stock `transition-all` (150 ms), so a 15% jump glides instead of snapping.

### `JobStatus` (`src/components/JobStatus.tsx`)

| State | Shows |
|---|---|
| `load` | `Loading the PDF engine… 0:05` (as today) |
| `run`, `percent === null` | `Encrypting… 0:12` (as today, no bar) |
| `run`, `percent` 0–99 | `Encrypting… 0:34`, then a row with the bar and `62%` |
| `finishing` | `Finishing… 0:41`, no bar |

- The bar row is a small `ProgressRow` inside `JobStatus.tsx`. It renders the bar at 0 on mount and
  sets the real percent on the next animation frame, so the bar slides in from the left instead of
  appearing at, say, 36%. Later values go through the same frame. The bar's `aria-valuenow` follows the
  shown value, at most one frame behind qpdf; the `62%` text shows qpdf's value at once.
- The elapsed clock's 1 s interval is keyed on whether a job runs, not on the status object: progress
  replaces the status several times a second, and restarting the interval on each update froze the
  clock (found in the final review).
- The "Large files can take a few minutes on phones." hint stays (over 50 MB).
- The doc comment loses "(qpdf reports no percentage)".
- "Finishing…" is the only new user-facing string.

### Accessibility

- The step line stays the polite live region (`role="status"`), so step changes ("Loading the PDF
  engine…" → "Encrypting…" → "Finishing…") are announced as today.
- The bar sits **outside** the live region: `role="progressbar"` (from Radix) with `aria-label` = the
  step label and `aria-valuenow` = percent. Screen readers can query it, but it doesn't flood
  announcements.
- The visible `62%` text is `aria-hidden` (the bar already carries the value) and `tabular-nums`.
- At most 101 status updates per file; no throttling needed.

## 5. Testing

### Unit (Vitest)

`src/lib/run-job.test.ts` (fake timers):

- no progress → fails at `jobMs`, not before;
- progress every 20 s for longer than `jobMs` → succeeds;
- progress, then 30 s of silence → `JobTimeoutError`;
- progress 100, then a 60 s post-step → succeeds; silence past `jobMs` after 100 → `JobTimeoutError`;
- `progress` after a timeout or after the job settled → no effect, no throw.

`useQpdfJob` (a small pure helper for the status transition if testing the hook directly is clumsy):

- progress after `reset()` doesn't change status;
- 0–99 → `run` with `percent`; 100 → `finishing`.

`src/lib/qpdf.integration.test.ts`: `compress` with `onProgress` (Node, inline) reports strictly
rising values ending at 100. Guards against a package regression.

### E2E (Playwright)

- New fixture in `e2e/global-setup.ts`: a real, valid PDF of several MB with large content streams,
  so writing lasts long enough for the bar to render.
- `e2e/job-safeguard.spec.ts`: an init script installs a `MutationObserver` that records every
  `aria-valuenow` of `[role=progressbar]` into `window`. After Compress and Encrypt of that fixture:
  recorded values strictly rise, at least one is between 1 and 99, the result page follows, and the
  download is verified with `inspectPdf()`. Recording avoids racing the live DOM.
- Bar motion: in the Compress test, the first recorded value is 0 (the slide-in) and the indicator's
  computed `transition-duration` is at least 0.5 s; with `reducedMotion: "reduce"` it is 0 s.
- The elapsed clock keeps ticking while progress arrives several times a second (worker messages
  spaced 50 ms apart by an init script).
- `e2e/info.spec.ts`: no progressbar ever appears during an Info job.
- Existing assertions ("Loading the PDF engine… 0:05", step + timer, timeouts) pass unchanged.
- A stalled-while-writing engine can't be provoked in a browser; the unit tests cover it.

## 6. Docs and release

- `package.json`: `version` `1.1.0`; `@mssio/qpdf-wasm` `^1.1.0`; `@radix-ui/react-progress`.
- `CHANGELOG.md`: 1.1.0 entry (progress bar, "Finishing…", stall limit, package upgrade).
- `AGENTS.md`:
  - `run()`'s job signature `(qpdf, onProgress)` and "pass `onProgress` only to the call that writes
    the download";
  - the stall limit (`STALL_TIMEOUT_MS`) in the qpdf rules;
  - Map: `src/components/ui/progress.tsx`;
  - Known package issue: 1.1.0 still bundles qpdf 12.4.2 with the same wasm, limits unchanged.
- After `npm run build`, confirm `dist/sw.js` still precaches `qpdf.wasm`.
- `docs/todo.md`:
  - automated-check rows for the bar (job-safeguard) and "Info shows no bar";
  - unticked owner boxes for 1.1.0:
    - [ ] Real iPhone: Compress and Encrypt a ~200 MB PDF; the bar moves, "Finishing…" shows, the
      download opens, and no false "took too long" appears.
    - [ ] Desktop browser: the same with a large PDF; the bar is smooth and the result is correct.
    - [ ] Installed PWA updates to 1.1.0 (close all tabs, reopen) and still works offline.
  - the "Next versions" paragraph already points 1.1.0 at this spec (changed with the spec commit).

## 7. Update prompt

### Why

`registerType: 'prompt'` already makes a new deployment wait instead of taking over open pages, but
1.0.0 has no prompt UI: the new version is only used once every tab of the app has been closed and it
is opened again. On an iPhone home-screen app that is easy to miss, and testing showed it confuses even
the owner. 1.1.0 adds the prompt.

### Static hosting only

No backend. The check is the browser re-fetching `/sw.js` (a few KB) and comparing it byte for byte;
each build writes a new `sw.js` (its precache list carries every file's revision), so a changed file
means a new version. The new files download into the cache in the background; the app is told when
they are ready. **Hosting requirement:** HTTPS (already needed for offline), and `sw.js` and
`index.html` must not be long-cached by a CDN (`Cache-Control: no-cache` or a short edge cache).
Hashed files under `assets/` can be cached forever. Browsers bypass their own HTTP cache for `sw.js`.

### What the user sees

- When a new version has **finished downloading**:

  > **Update available**
  > A new version of PDF Toolbox is ready. Updating reloads the page, so anything you've chosen here
  > will need to be chosen again.
  > [Later] [Update now]

- **Update now** activates the new service worker and reloads the page.
- **Later** (or Esc) closes the dialog. It doesn't reopen for the rest of the session; the footer shows
  a button after the version: `… · Version 1.1.0 · Update to the latest version`.
- **During a job nothing interrupts.** If the update becomes ready while a job runs, the dialog waits
  until the job ends. The footer button is disabled while a job runs. (A reload mid-job would lose the
  work and trigger the crash notice.)
- **A result on screen isn't interrupted either** (owner review, 2026-10-09): while a download is shown
  (`useBlobUrl` holds one), the dialog waits until the user moves on ("… another file", Back to home).
  The footer button stays usable: tapping it is the user's own choice.
- **Every tab reloads safely.** Activating the update switches all open tabs. Each tab reloads itself
  (`createUpdateReload` in `src/lib/update-check.ts`) once nothing is in progress: it waits for a running
  job and, unless the user tapped Update now in that tab, for a result on screen, and only after things
  stayed quiet for 0.5 s (a job ends a moment before its download shows). Pages that had no controlling
  worker when they loaded (the first visit, a hard reload) reload on `controllerchange` while an update
  was waiting: vite-plugin-pwa 2.0's own reload only covers pages that were controlled at load, and it
  ignores `updateServiceWorker`'s `reloadPage` argument.
- **Offline:** no checks. Coming back online triggers one.
- Closing every tab still works: the next launch already uses the new version.
- Copy (the only new strings): "Update available", the sentence above, "Later", "Update now",
  "Update to the latest version".

### When it checks

- Once an hour while the app is open (`UPDATE_CHECK_INTERVAL_MS = 3_600_000`).
- When the device comes back online (`online` event), always.
- When the app returns to the foreground (`visibilitychange` → `visible`), unless the last check was
  less than 60 s ago (`UPDATE_CHECK_MIN_GAP_MS = 60_000`), so switching apps doesn't spam requests.
- Never while `navigator.onLine` is false.
- A check fetches `sw.js` with `cache: "no-store"`; only on HTTP 200 does it call
  `registration.update()` (the plugin's documented recipe), so a down server is never mistaken for a
  new version. A check that is already installing an update is skipped. A failed check waits for the
  next trigger.

### Units

| File | Responsibility |
|---|---|
| `src/lib/update-check.ts` | `startUpdateChecks({ check, isOnline, … }) → stop`, `checkForUpdate(swUrl, registration)`, `shouldShowUpdatePrompt({ updateReady, dismissed, jobRunning })`. Pure (timers, events and fetch injected), unit-tested. |
| `src/lib/job-activity.ts` | Whether any qpdf job runs: `jobStarted()`, `jobFinished()`, `isJobRunning()`, `subscribeJobActivity(listener)`. `useQpdfJob` calls it next to `markJobStarted`/`markJobFinished`. Unit-tested. |
| `src/lib/use-app-update.ts` | Wraps `useRegisterSW` (`virtual:pwa-register/react`); starts the checks in `onRegisteredSW`; returns `{ updateReady, promptOpen, jobRunning, later, updateNow }`. `updateNow()` does nothing while a job runs. |
| `src/components/ui/alert-dialog.tsx` | shadcn new-york v4 AlertDialog on `@radix-ui/react-alert-dialog` (focus trap, Esc = Later, screen-reader roles). |
| `src/components/UpdatePrompt.tsx` | `UpdateDialog` and `UpdateFooterButton`, mounted by `AppShell`. |
| `src/main.tsx` | Stops calling `registerSW()`; the hook registers the service worker. |

Everything is bundled into the precache; the only new runtime request is the `sw.js` check.

### Tests

- Unit: the checker (hourly tick, offline skip, `online` always checks, foreground throttle, failed
  check is harmless, `stop()`), `checkForUpdate` (200 → update; non-200 or network error → no update;
  installing → no fetch), `shouldShowUpdatePrompt` (all combinations), the job store.
- E2E `e2e/update.spec.ts` (service workers on, own server on a copy of `dist/`, like
  `offline.spec.ts`): after the worker is active, the test rewrites the copy's `sw.js` and
  `index.html` (a simulated deploy) and fires `online`.
  - The dialog appears; **Later** closes it and shows the footer button; the button reloads into the
    new version (a marker in the new `index.html`).
  - A Compress running with slowed progress (`spaceOutProgress`): the dialog stays closed while the
    job runs and the footer button is disabled; after the result, the dialog appears and **Update
    now** reloads into the new version.
- `offline.spec.ts` and the rest stay green.

### Docs and release gate

- AGENTS.md "PWA notes": replace "no prompt UI … open pages are never reloaded" with the prompt
  behavior and the hosting requirement.
- CHANGELOG 1.1.0: "Added: a prompt to update to the latest version (checks while online)".
- `docs/todo.md`: automated-check row for `e2e/update.spec.ts`; owner box: with the app installed on
  the iPhone, serve a newer test build; the dialog appears, Later shows the footer button, and
  updating shows the new build code in the footer.

## 8. Offline readiness status

### What happened

On the owner's iPhone the installed app opened offline, but a tool page failed with the error screen.
The service worker installs all-or-nothing: until every precached file (≈30 files, 2.2 MB of them the
PDF engine) is downloaded, it doesn't take over, and nothing is available offline. The home page can
still appear from the browser's ordinary cache, so the app *looks* installed while tool pages and the
engine (separate, on-demand files) can't load. Nothing tells the user. Also, without `clientsClaim`
the first visit never comes under the worker's control, even after the download finishes; only the
next launch does.

Confirmed by the owner's screenshot (2026-10-09): offline, the Encrypt page showed "Something went
wrong / This page couldn't load" while the footer read `Version 1.1.0 · test 5ab1b63`. The shell was the
current build, so it came from Safari's HTTP cache; a controlling worker would have served the tool's
chunk too (and an older controlling worker would have served an older shell). The worker was not in
control.

### Behavior

- **`clientsClaim: true`** in the Workbox options: the first install takes control of the open page as
  soon as it finishes. With `registerType: 'prompt'` this only affects the first install. Updates still
  wait for "Update now" (section 7), which reloads anyway.
- The footer shows the offline state after the version (and after the update button, if any), as a
  link to `/offline`:

| State | When | Footer link text |
|---|---|---|
| `ready` | a worker is active and controls the page, or is active and every listed file is cached | `Ready offline` |
| `downloading` | the first install is running (`installing`, no active worker), or active but not yet in control | `Downloading for offline use… 40%` (no percent if the file list is unknown) |
| `not-ready` | service workers work here but nothing is installed (e.g. the first visit was interrupted) | `Not available offline yet` |
| `unsupported` | no service worker (plain HTTP such as a LAN test address, some private modes) | `Offline use not available` |

- An update downloading in the background doesn't change `ready` (the current version stays complete);
  section 7 handles updates.
- **`/offline` page** (lazy route like the tools, not on the home grid): a heading with the state, the
  same `Progress` bar while downloading (`done / total` files), the PDF engine called out separately
  ("PDF engine: downloaded" or "PDF engine: waiting"), and a plain list of the files with a check mark once
  cached. Copy: "Keep PDF Toolbox open until this says Ready offline. After that it works without a
  connection." For `unsupported`: "This address can't keep files for offline use. Open PDF Toolbox from
  its https:// address." For `not-ready`: "Open PDF Toolbox once while online and keep it open until
  this says Ready offline."
- Offline, `sw.js` can't be fetched, so the expected list is unknown; when the state is `ready`, `/offline`
  lists the files in the precache instead (all present by definition).
- The status polls once a second while `downloading` or `not-ready`, and otherwise re-reads on
  `controllerchange`, `online` and `offline`.

### How it's measured (static hosting only)

- Files expected: parsed from `sw.js` (`{url:"…",revision:…}` entries, the generated precache list),
  fetched with `cache: "no-store"` while online. The first install only happens online, so the list is
  always available when there is something to measure. If parsing fails, the bar is indeterminate.
- Files present: the keys of the `workbox-precache…` caches (Workbox writes each file straight into
  its precache cache during install), normalized to paths without `?__WB_REVISION__=`.
- No new runtime requests besides that `sw.js` fetch (the same file the update check uses).

### Units

| File | Responsibility |
|---|---|
| `src/lib/offline-status.ts` | Pure: `parsePrecacheList(source)`, `cachedPath(url)`, `offlineState({ supported, controlled, installing, active, expected, cached })`, `offlineLabel(state)`. Unit-tested. |
| `src/lib/use-offline-status.ts` | Reads the registration and caches, fetches and parses `sw.js`, polls while downloading. |
| `src/components/OfflineStatusLink.tsx` | The footer link. |
| `src/pages/OfflinePage.tsx` | `/offline`. |

### Tests

- Unit: `parsePrecacheList` (real minified shape, quoted keys, no entries → null), `cachedPath`,
  `offlineState` for every row of the table, `offlineLabel`.
- E2E: `offline.spec.ts` asserts the footer reaches "Ready offline" before the server stops, and that
  `/offline` shows "Ready offline" while offline. Every other spec (service workers blocked) sees "Not
  available offline yet"; `shell.spec.ts`'s exact footer text is updated.

## 9. Large-file reload on the iPhone

### What happened

Offline on the owner's iPhone, encrypting a 245 MB PDF: the bar ran quickly to 100%, then the page
reloaded with no message. (The bar is fast because qpdf counts objects and the file has few, large
ones; see section 1. That part is expected.)

### Cause (likely, to be confirmed on the device)

Memory at the end of a job is at its peak:

- the worker holds the engine instance for `ensureNoOpenPassword`'s `info()` and the one for
  `encrypt()` (each with its own copy of the 245 MB input) until the browser collects them;
- the output (≈245 MB) is transferred to the page;
- `useBlobUrl().show()` then copies it into a `Blob` (another ≈245 MB).

iOS kills the page when it runs out of memory. That happens after `useQpdfJob` has already called
`markJobFinished()`, so the crash notice ("The page reloaded while a file was being processed…") is
not shown: the reload looks unexplained.

### Fix

1. **Crash notice covers the download step.** For outputs over `RELEASE_ENGINE_AFTER_BYTES`,
   `useBlobUrl().show()` arms the crash guard (`markJobStarted`) before building the `Blob` and disarms
   it 2 s after the URL is created (`markJobFinished` on a timer), so a kill while building or rendering
   the download is explained. Small outputs are not guarded: a deliberate reload (or "Update now") right
   after a small job would otherwise show a false "page reloaded" notice (caught by `e2e/phone.spec.ts`).
2. **Free the engine's memory before building the download.** After a successful job whose input is
   over `RELEASE_ENGINE_AFTER_BYTES` (50 MB), `useQpdfJob` calls `resetQpdf()`: the worker is
   terminated, which frees every engine instance at once instead of waiting for garbage collection.
   The next job loads a fresh engine (from cache; well under a second on the test devices).
3. **Re-test on the iPhone** with the same 245 MB PDF, offline and online, for Encrypt, Compress and
   Decrypt. If it still reloads (now with the notice), the owner picks the largest size that passed,
   and `PHONE_MAX_BYTES` in `src/lib/limits.ts` is lowered to it. That constant exists for this.

### Tests

- Unit: the crash guard is armed while `show()` builds the Blob and released after 2 s (fake timers,
  fake storage); `shouldReleaseEngine(sizeBytes)` (at/under/over 50 MB).
- E2E: after a large job the next job still works (fresh engine): Compress `twenty-mb.pdf` is below the
  threshold, so the E2E uses a 60 MB real fixture (`sixty-mb-real.pdf`, generated) and runs Compress
  twice.
- Owner check: the 245 MB re-test above.

## 10. Install banner (phones only)

### Why

The offline app only works reliably once it is on the home screen and has finished downloading
(sections 8–9). Most people don't know they can add a website to the home screen.

### What is possible (static hosting only)

- **Android Chrome / Edge / Samsung Internet:** the browser fires `beforeinstallprompt`; calling
  `prompt()` on it from a click opens the browser's own install dialog. A real button is possible.
- **iPhone / iPad (every iOS browser):** no API. Only the user can add the app (Safari: page menu →
  Share → Add to Home Screen). The banner can only show the steps.
- **Desktop:** out of scope (owner, 2026-10-09): the banner is for phones only.

### Behavior

- Shows only when **all** hold:
  - a small touch screen (`hasSmallTouchScreen()`, the touch-screen half of `isLikelyPhone()` in
    `src/lib/limits.ts`; the low-memory half is left out so laptops never see it);
  - not already running as an installed app (`matchMedia("(display-mode: standalone)")` or
    `navigator.standalone`);
  - an install path exists here: a captured `beforeinstallprompt` (Android), or iOS Safari (iPhone/iPod
    user agent, or an iPad reporting a Mac user agent with touch; not `CriOS`/`FxiOS`/`EdgiOS`, whose
    menus differ from the screenshots);
  - "Not now" wasn't tapped in the last 30 days;
  - no job is running and no result is on screen (`job-activity`, like the update dialog).
- Placement: a slim card under the header, above `CrashNotice`, on every page except `/install/…`.
- **Android:**
  > **Install PDF Toolbox** to open it like an app and use it offline. [Install] [Not now]

  Install calls the saved event's `prompt()`. The event can be used once; after it the banner hides.
  `appinstalled` hides it for good.
- **iPhone:**
  > **Add PDF Toolbox to your Home Screen** to open it like an app and use it offline. [How] [Not now]

  How opens `/install`.
- **"Not now"** stores the time in `localStorage` (`pdf-mss-io-install-dismissed`, inside try/catch;
  without storage the banner simply shows again next visit).
- **`/install/:step` pages** (one lazy route, linked only from the banner; `/install` = step 1; an
  unknown step number shows step 1). One step per page so each screenshot can be shown whole:
  - heading "Add PDF Toolbox to your Home Screen", then "Step 2 of 5";
  - the instruction (below);
  - the **full** iPhone screenshot inside a phone-shaped frame (CSS only: rounded corners, a thin
    `border-foreground` bezel, `max-height` so the whole phone fits a phone screen), with the button to
    tap circled in orange;
  - **Back** (hidden on step 1) and **Next** links, **Done** on step 5 (back to home), and five dots
    showing the position (the current one `aria-current="step"`);
  - each step is its own address, so the phone's back gesture works.

  | Step | Instruction | Image |
  |---|---|---|
  | 1 | In Safari, tap the menu button at the left of the address bar. | `ios-1-menu.webp` |
  | 2 | Tap **Share**. | `ios-2-share.webp` |
  | 3 | Scroll down and tap **Add to Home Screen**. | `ios-3-add-to-home-screen.webp` |
  | 4 | Keep **Open as Web App** on and tap **Add**. | `ios-4-add.webp` |
  | 5 | Open **PDF Toolbox** from your Home Screen. Keep it open while online until the footer says **Ready offline**. | `ios-5-home-screen.webp` |

  Step 1 also says: "On older iPhones the Share button is at the bottom of the screen." The pages work
  on any device (they are just instructions).
- **Screenshots** (`public/install/*.webp`): the owner's iPhone (iOS 26 Safari), full screen, 600 px
  wide (~600 × 1300), ~50–80 KB each, metadata stripped. Personal details removed without cropping:
  - status bar replaced by a clean one (time 9:41, full signal and battery, no camera/VPN indicators);
  - the test address replaced with `pdf.mss.io` / `https://pdf.mss.io/`;
  - share sheet: the contacts row and the app row blurred (owner's choice: blur, so it still looks
    real); bookmark folder names replaced with a generic name;
  - home screen: dock, badges and every other app blurred; only the PDF Toolbox icon stays sharp.
- **Precache:** `webp` is added to Workbox `globPatterns`, so the steps work offline.

### Units

| File | Responsibility |
|---|---|
| `src/lib/install-banner.ts` | Pure: `isIosSafari(userAgent, maxTouchPoints)`, `installBannerKind({ smallTouchScreen, standalone, iosSafari, promptAvailable, dismissedAt, now, busy }) → "android" \| "ios" \| null`, `INSTALL_DISMISS_MS` (30 days), `readDismissedAt(storage)`, `saveDismissedAt(storage, now)`. Unit-tested. |
| `src/lib/use-install-banner.ts` | Captures `beforeinstallprompt` (module level, so an early event isn't missed), listens for `appinstalled`, reads the environment, returns `{ kind, install, dismiss }`. |
| `src/components/InstallBanner.tsx` | The card. |
| `src/pages/InstallPage.tsx` | `/install/:step`: one step per page, phone-framed screenshot, Back / Next / Done, dots. |
| `src/lib/limits.ts` | Exports `hasSmallTouchScreen()`; `isLikelyPhone()` uses it. |

### Tests

- Unit: `isIosSafari` (iPhone Safari, iPhone Chrome/Firefox/Edge, iPad desktop UA with touch, Mac
  without touch, Android), `installBannerKind` (each condition turning it off, Android vs iOS, the 30-day
  boundary), dismissal storage (missing, garbage, throwing storage).
- E2E `e2e/install.spec.ts`:
  - iPhone (Playwright `devices["iPhone 15"]` user agent and viewport, Chromium): banner shows; How →
    step 1; Next through steps 2–5 (each "Step n of 5", its image loaded with `naturalWidth > 0`, the
    whole phone frame inside the viewport); Back returns a step; the browser's back goes to the previous
    step; Done returns home; `/install/9` shows step 1; Not now hides the banner and it stays hidden
    after a reload.
  - Android phone viewport + a dispatched fake `beforeinstallprompt` with a stubbed `prompt()`: Install
    calls `prompt()` once and the banner hides.
  - Installed (init script makes `display-mode: standalone` match): no banner.
  - Desktop: no banner, even with a fake `beforeinstallprompt`.
  - During a job: no banner.
- `offline.spec.ts`: `/install/3`'s image is in the precache (offline load shows it).

### Owner checks

- iPhone Safari (not installed): banner shows; How's steps match what Safari shows; after adding, the
  installed app shows no banner.
- Android Chrome, if available: Install opens the browser's dialog.

## Out of scope

- Progress for Info, `ensureNoOpenPassword` or post-steps (qpdf reports none).
- An overall percentage across several qpdf calls in one job.
- Cancelling a running job (the package can only `terminate()` the whole instance).
- Any change to size limits or memory guards.
- An install banner on desktop browsers (owner: phones only).
- Byte-level download progress (the list has no sizes; files are counted, the engine is shown separately).
- Showing the new version's number in the update dialog (the service worker doesn't carry it).
- Updating users still on 1.0.0 through the dialog: their cached app has no prompt, so they reach 1.1.0 the old way (close every tab, reopen), once.
