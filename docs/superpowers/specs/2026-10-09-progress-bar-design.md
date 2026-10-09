# PDF Toolbox 1.1.0: real progress bar

Date: 2026-10-09
Status: approved; revised 2026-10-09 after an iPhone test (smooth bar motion, section 4) and to add the
update prompt (section 7, draft for owner review)

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

## Out of scope

- Progress for Info, `ensureNoOpenPassword` or post-steps (qpdf reports none).
- An overall percentage across several qpdf calls in one job.
- Cancelling a running job (the package can only `terminate()` the whole instance).
- Any change to size limits or memory guards.
- Showing the new version's number in the update dialog (the service worker doesn't carry it).
- Updating users still on 1.0.0 through the dialog: their cached app has no prompt, so they reach 1.1.0 the old way (close every tab, reopen), once.
