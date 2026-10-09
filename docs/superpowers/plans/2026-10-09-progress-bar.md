# Progress Bar (1.1.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship PDF Toolbox 1.1.0: a percentage bar while qpdf writes a tool's output, "Finishing…" after 100%, and a stuck-engine limit of 30 s without progress while qpdf writes.

**Architecture:** `@mssio/qpdf-wasm` 1.1.0 calls `onProgress(percent)` while qpdf writes. `runWithTimeLimits` gains a resettable deadline that progress calls re-arm. A new pure module `src/lib/job-progress.ts` turns progress into job status and drops calls from stale jobs. `useQpdfJob().run()` hands each job an `onProgress`, and every page passes it to the one qpdf call that writes its download. `JobStatus` renders a shadcn `Progress` bar outside its live region.

**Tech Stack:** Vite 8, React 19, TypeScript ~6.0.3, Vitest 5 (Node env, `src/**/*.test.ts` only), Playwright (Chromium for every spec), shadcn new-york v4 + Radix, `@mssio/qpdf-wasm` 1.1.0 (qpdf 12.4.2).

**Spec:** `docs/superpowers/specs/2026-10-09-progress-bar-design.md`

## Global Constraints

- No backend, no CDN, nothing new loaded at runtime outside the Workbox precache (`AGENTS.md` hard constraints).
- `@mssio/qpdf-wasm` `^1.1.0`; never import it as a value in app code (type imports only; tests may import it).
- `STALL_TIMEOUT_MS = 30_000`. `ENGINE_LOAD_TIMEOUT_MS` (120 s) and `jobTimeoutMs()` keep their values.
- Pass `onProgress` **only** to the qpdf call that writes the download: `decrypt`, `encrypt`, `merge`, `selectPages`, `compress`. Never to `ensureNoOpenPassword`, `info()` or `run()`.
- Only new user-facing string: `Finishing…` (with the Unicode ellipsis `…`, like every other step).
- shadcn only; theme tokens only (`bg-primary`, `bg-primary/20`, `text-muted-foreground`); `cn()` for class merging.
- `MAX_TOTAL_BYTES`, `PHONE_MAX_BYTES`, `assertOutput()` and the 3 MB precache limit stay unchanged (1.1.0's `qpdf.wasm` is byte-identical to 1.0.0's: SHA-256 starts `b7530183edceab14`).
- App version `1.1.0`. Merging to `main`, tagging and releasing need the owner's go-ahead.
- Commit each task and push right away. Work on branch `feat/progress-bar`, created from `docs/spec-1.1.0`.
- Before calling a task done: `npm run lint && npm test && npm run build`; for Tasks 4–5 also `npm run test:e2e`.

## Review Focus

1. **A stale job still holds the shared engine.** After "Compress another file" or leaving the page, the old job keeps running and sending progress. Its time limit must still be re-armed by those calls. If it isn't, it would time out after 30 s and `resetQpdf()` would kill the engine under the user's new job. Pinned in Task 3 (`createOnProgress` re-arms even when not current).
2. **Slow work after 100%.** Extract runs `info(output)` after `selectPages` reaches 100%. On a big file on a phone that can take over 30 s and must not count as stuck. Pinned in Task 2 ("100 restores the job limit").
3. **Progress, then silence.** An engine that stops mid-write must fail 30 s after the last percent, not after the 22-minute size limit. Pinned in Task 2.
4. **Screen readers.** The bar's percentages must not be announced every second. The bar must sit outside `aria-live`, and its value must still be readable (`aria-valuenow`). shadcn's stock `Progress` does **not** forward `value` to Radix's Root, which would drop `aria-valuenow`. Pinned in Task 5 (E2E recorder checks both).
5. **Progress arriving after the job ended.** A call that lands after `setStatus(null)` must not bring the bar back. Pinned in Task 3 (`withProgress(null, …)` stays `null`).

---

## File map

| File | Change | Responsibility |
|---|---|---|
| `package.json`, `package-lock.json` | modify | `@mssio/qpdf-wasm` ^1.1.0, `@radix-ui/react-progress`, version 1.1.0 |
| `src/lib/qpdf.integration.test.ts` | modify | Node check that `compress` reports progress |
| `src/lib/qpdf.ts` | modify | `STALL_TIMEOUT_MS` |
| `src/lib/run-job.ts` / `.test.ts` | modify | resettable deadline, `progress` passed to the job |
| `src/lib/job-progress.ts` / `.test.ts` | create | `JobStatusState`, `withProgress`, `createOnProgress` |
| `src/lib/use-qpdf-job.ts` | modify | wires progress into status and limits; job gets `(qpdf, onProgress)` |
| `src/components/ui/progress.tsx` | create | shadcn new-york v4 `Progress` (Radix) |
| `src/components/JobStatus.tsx` | modify | bar, percent, "Finishing…" |
| `src/pages/{Decrypt,Encrypt,Merge,Extract,Compress}Page.tsx` | modify | pass `onProgress` to the writing call |
| `src/test/make-pdf.ts` | modify | `fillerBytes` option for a slow-to-write fixture |
| `e2e/global-setup.ts`, `e2e/helpers.ts` | modify | `twenty-mb.pdf` fixture; progress recorder |
| `e2e/job-safeguard.spec.ts`, `e2e/info.spec.ts` | modify | bar tests; Info shows no bar |
| `AGENTS.md`, `CHANGELOG.md`, `docs/todo.md` | modify | docs and release gate |

---

### Task 1: Upgrade to `@mssio/qpdf-wasm` 1.1.0

**Files:**
- Modify: `package.json`, `package-lock.json`
- Test: `src/lib/qpdf.integration.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `onProgress?: (percent: number) => void` on `Qpdf` methods (from the package's `ProgressOptions` type).

- [ ] **Step 1: Create the branch**

```bash
git switch docs/spec-1.1.0 && git pull --ff-only && git switch -c feat/progress-bar
```

- [ ] **Step 2: Write the failing test**

Append to `src/lib/qpdf.integration.test.ts` (it already imports `makePdf`, `describe`, `expect`, `test`, and has `qpdf` and `pdfFile`):

```ts
describe("progress", () => {
  test("compress reports strictly rising write progress that ends at 100", async () => {
    const seen: number[] = [];
    await qpdf.compress(pdfFile(makePdf(50)), { onProgress: (percent: number) => seen.push(percent) });
    expect(seen.length).toBeGreaterThan(1);
    expect(seen.at(-1)).toBe(100);
    expect(seen.every((percent, i) => i === 0 || percent > seen[i - 1])).toBe(true);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/lib/qpdf.integration.test.ts -t progress`
Expected: FAIL (`expected 0 to be greater than 1`). 1.0.0 ignores the option.

- [ ] **Step 4: Upgrade**

```bash
npm install @mssio/qpdf-wasm@^1.1.0
```

Check `package.json` reads `"@mssio/qpdf-wasm": "^1.1.0"` and `node_modules/@mssio/qpdf-wasm/package.json` says `"version": "1.1.0"`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: all PASS, including `progress`.

- [ ] **Step 6: Confirm the precache still holds the wasm**

Run: `npm run build && grep -o 'qpdf[^"]*\.wasm' dist/sw.js`
Expected: one match (e.g. `assets/qpdf-XXXX.wasm`); the build doesn't fail on the 3 MB limit.

- [ ] **Step 7: Lint, commit, push**

```bash
npm run lint
git add package.json package-lock.json src/lib/qpdf.integration.test.ts
git commit -m "chore: upgrade @mssio/qpdf-wasm to 1.1.0 (write progress)"
git push -u origin feat/progress-bar
```

---

### Task 2: Stall-based time limit in `runWithTimeLimits`

**Files:**
- Modify: `src/lib/qpdf.ts` (next to `ENGINE_LOAD_TIMEOUT_MS`, line ~44)
- Modify: `src/lib/run-job.ts`
- Test: `src/lib/run-job.test.ts`

**Interfaces:**
- Consumes: `JobTimeoutError` from `@/lib/qpdf`.
- Produces:
  - `export const STALL_TIMEOUT_MS = 30_000` in `src/lib/qpdf.ts`.
  - `runWithTimeLimits<E, T>({ load, job, loadMs, jobMs, stallMs, onRun })` where `job: (engine: E, progress: (percent: number) => void) => Promise<T>`. `progress(p)` re-arms the job deadline: `p < 100` → `stallMs` from now; `p >= 100` → `jobMs` from now. Calls after the run settled do nothing.

- [ ] **Step 1: Add `stallMs` to the existing tests**

In `src/lib/run-job.test.ts`, every existing `runWithTimeLimits({ … })` call gets `stallMs: 3000` right after `jobMs`. There are five calls. For example the first becomes:

```ts
    const result = runWithTimeLimits({
      load: async () => "engine",
      job: async (engine) => `${engine} done`,
      loadMs: 1000,
      jobMs: 1000,
      stallMs: 3000,
      onRun,
    });
```

- [ ] **Step 2: Write the failing tests**

Add inside the `describe("runWithTimeLimits", …)` block in `src/lib/run-job.test.ts`:

```ts
  /** A job that never settles on its own; `report` sends progress, `finish` resolves it. */
  function controllableJob() {
    const handle: { report: (percent: number) => void; finish: (value: string) => void } = {
      report: () => {},
      finish: () => {},
    };
    const job = (_engine: string, progress: (percent: number) => void) => {
      handle.report = progress;
      return new Promise<string>((resolve) => (handle.finish = resolve));
    };
    return { handle, job };
  }

  const limits = { load: async () => "engine", loadMs: 1000, jobMs: 5000, stallMs: 3000, onRun: () => {} };

  test("steady progress keeps a job alive past the job limit", async () => {
    const { handle, job } = controllableJob();
    const result = runWithTimeLimits({ ...limits, job });
    await vi.advanceTimersByTimeAsync(0); // engine loaded, job started
    for (let percent = 0; percent < 5; percent++) {
      handle.report(percent);
      await vi.advanceTimersByTimeAsync(2000); // 10 s in total, twice jobMs
    }
    handle.finish("done");
    await expect(result).resolves.toBe("done");
    expect(vi.getTimerCount()).toBe(0);
  });

  test("no progress for stallMs while writing fails with JobTimeoutError", async () => {
    const { handle, job } = controllableJob();
    const result = runWithTimeLimits({ ...limits, job });
    let settled = false;
    result.catch(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    handle.report(10);
    await vi.advanceTimersByTimeAsync(2999);
    expect(settled).toBe(false);
    const assertion = expect(result).rejects.toBeInstanceOf(JobTimeoutError);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
  });

  test("100 restores the job limit for work after writing", async () => {
    const { handle, job } = controllableJob();
    const result = runWithTimeLimits({ ...limits, job });
    let settled = false;
    result.catch(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    handle.report(50);
    handle.report(100);
    await vi.advanceTimersByTimeAsync(4999); // past stallMs, within jobMs
    expect(settled).toBe(false);
    const assertion = expect(result).rejects.toBeInstanceOf(JobTimeoutError);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
  });

  test("progress after the job settled or timed out does nothing", async () => {
    const done = controllableJob();
    const finished = runWithTimeLimits({ ...limits, job: done.job });
    await vi.advanceTimersByTimeAsync(0);
    done.handle.finish("done");
    await finished;
    done.handle.report(50);
    expect(vi.getTimerCount()).toBe(0);

    const stuck = controllableJob();
    const timedOut = runWithTimeLimits({ ...limits, job: stuck.job });
    const assertion = expect(timedOut).rejects.toBeInstanceOf(JobTimeoutError);
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
    stuck.handle.report(50);
    expect(vi.getTimerCount()).toBe(0);
  });
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run src/lib/run-job.test.ts`
Expected: "steady progress…" FAILS with `JobTimeoutError`, and "no progress for stallMs…" FAILS (it settles only at 5 s). TypeScript isn't checked by Vitest, so the extra `stallMs` doesn't error here.

- [ ] **Step 4: Add the constant**

In `src/lib/qpdf.ts`, directly below `export const ENGINE_LOAD_TIMEOUT_MS = 120_000;`:

```ts

/**
 * Longest gap allowed between two progress calls while qpdf writes (0–99%). One percent can take
 * seconds on a phone; the package suggests 30 s. Before the first call and after 100%, jobTimeoutMs applies.
 */
export const STALL_TIMEOUT_MS = 30_000;
```

- [ ] **Step 5: Implement the resettable deadline**

Replace everything from `type TimeLimitedRun` to the end of `src/lib/run-job.ts` with:

```ts
type TimeLimitedRun<E, T> = {
  load: () => Promise<E>;
  /** `progress(percent)` re-arms the job's time limit; see runWithTimeLimits. */
  job: (engine: E, progress: (percent: number) => void) => Promise<T>;
  loadMs: number;
  jobMs: number;
  /** Longest gap allowed between progress calls below 100%. */
  stallMs: number;
  /** Called once the engine has loaded and the job starts. */
  onRun: () => void;
};

/**
 * Loads the engine, then runs the job, each under its own time limit. The job's limit is jobMs until
 * it reports progress; each report below 100 resets it to stallMs, and 100 resets it to jobMs (for
 * work after writing). A load that finishes after its limit never starts the job; a job's late
 * failure after its limit is swallowed; progress after the run settled is ignored.
 */
export async function runWithTimeLimits<E, T>({
  load,
  job,
  loadMs,
  jobMs,
  stallMs,
  onRun,
}: TimeLimitedRun<E, T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let expire = () => {};
  let settled = false;
  const arm = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => expire(), ms);
  };
  const limit = (ms: number, error: Error) =>
    new Promise<never>((_, reject) => {
      expire = () => reject(error);
      arm(ms);
    });
  const progress = (percent: number) => {
    if (!settled) arm(percent < 100 ? stallMs : jobMs);
  };
  try {
    const engine = await Promise.race([load(), limit(loadMs, new EngineLoadTimeoutError())]);
    clearTimeout(timer);
    onRun();
    const deadline = limit(jobMs, new JobTimeoutError());
    const work = job(engine, progress);
    work.catch(() => {}); // if the time limit wins, the job's late failure must not surface as unhandled
    return await Promise.race([work, deadline]);
  } finally {
    settled = true;
    clearTimeout(timer);
  }
}
```

The `EngineLoadTimeoutError` class and the import at the top of the file stay as they are.

- [ ] **Step 6: Pass `stallMs` from the hook so the app compiles**

In `src/lib/use-qpdf-job.ts`, add `STALL_TIMEOUT_MS,` to the `@/lib/qpdf` import list (after `resetQpdf,`) and add `stallMs: STALL_TIMEOUT_MS,` right after `jobMs: jobTimeoutMs(sizeBytes),`. Task 3 rewrites this hook; this step only keeps `tsc -b` green.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/lib/run-job.test.ts`
Expected: all 9 PASS.

- [ ] **Step 8: Full check, commit, push**

```bash
npm run lint && npm test && npm run build
git add src/lib/qpdf.ts src/lib/run-job.ts src/lib/run-job.test.ts src/lib/use-qpdf-job.ts
git commit -m "feat: stall-based job time limit driven by write progress"
git push
```

---

### Task 3: Job progress state, wired into `useQpdfJob`

**Files:**
- Create: `src/lib/job-progress.ts`
- Test: `src/lib/job-progress.test.ts`
- Modify: `src/lib/use-qpdf-job.ts`
- Modify: `src/components/JobStatus.tsx` (type import only)

**Interfaces:**
- Consumes: `runWithTimeLimits` (with `job(engine, progress)` and `stallMs`) and `STALL_TIMEOUT_MS` from Task 2.
- Produces:
  - `src/lib/job-progress.ts`:
    - `type JobStatusState = { phase: "load" | "run" | "finishing"; label: string; startedAt: number; sizeBytes: number; percent: number | null }`
    - `withProgress(status: JobStatusState | null, percent: number): JobStatusState | null`
    - `createOnProgress({ isCurrent, rearm, setStatus }): (percent: number) => void`
  - `useQpdfJob().run<T>(job: (qpdf: Qpdf, onProgress: (percent: number) => void) => Promise<T>, { label, sizeBytes })`. Callers that ignore the second argument keep working.
  - `use-qpdf-job.ts` no longer exports `JobStatusState`; import it from `@/lib/job-progress`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/job-progress.test.ts`:

```ts
import { describe, expect, test, vi } from "vitest";

import { createOnProgress, type JobStatusState, withProgress } from "@/lib/job-progress";

const running: JobStatusState = { phase: "run", label: "Encrypting…", startedAt: 1000, sizeBytes: 42, percent: null };

describe("withProgress", () => {
  test("0–99 shows the bar at that percent and keeps the rest of the status", () => {
    expect(withProgress(running, 0)).toEqual({ ...running, phase: "run", percent: 0 });
    expect(withProgress(running, 62)).toEqual({ ...running, phase: "run", percent: 62 });
    expect(withProgress(running, 99)).toEqual({ ...running, phase: "run", percent: 99 });
  });

  test("100 switches to finishing without a bar", () => {
    expect(withProgress({ ...running, percent: 99 }, 100)).toEqual({ ...running, phase: "finishing", percent: null });
  });

  test("a job that already ended stays ended", () => {
    expect(withProgress(null, 50)).toBeNull();
  });
});

describe("createOnProgress", () => {
  function setup(current: boolean) {
    let status: JobStatusState | null = running;
    const rearm = vi.fn();
    const setStatus = vi.fn((update: (s: JobStatusState | null) => JobStatusState | null) => {
      status = update(status);
    });
    const onProgress = createOnProgress({ isCurrent: () => current, rearm, setStatus });
    return { onProgress, rearm, setStatus, status: () => status };
  }

  test("the shown job's progress re-arms its time limit and updates the status", () => {
    const { onProgress, rearm, status } = setup(true);
    onProgress(40);
    expect(rearm).toHaveBeenCalledWith(40);
    expect(status()).toMatchObject({ phase: "run", percent: 40 });
  });

  test("a stale job still re-arms its own time limit but never touches the status", () => {
    const { onProgress, rearm, setStatus } = setup(false);
    onProgress(40);
    expect(rearm).toHaveBeenCalledWith(40); // else it would time out and reset the engine under the new job
    expect(setStatus).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/job-progress.test.ts`
Expected: FAIL with "Failed to resolve import "@/lib/job-progress"".

- [ ] **Step 3: Implement**

Create `src/lib/job-progress.ts`:

```ts
/** What a running job is doing, for JobStatus. */
export type JobStatusState = {
  /** load: engine loading; run: qpdf working; finishing: qpdf wrote 100%, the job's last steps run. */
  phase: "load" | "run" | "finishing";
  label: string;
  startedAt: number;
  sizeBytes: number;
  /** qpdf's write progress, 0–99; null before qpdf starts writing and once it reaches 100. */
  percent: number | null;
};

/** The status after a write-progress call. A job that already ended (null) stays ended. */
export function withProgress(status: JobStatusState | null, percent: number): JobStatusState | null {
  if (!status) return null;
  return percent >= 100 ? { ...status, phase: "finishing", percent: null } : { ...status, phase: "run", percent };
}

type ProgressWiring = {
  /** False once the screen no longer shows this job (reset, unmount, a newer job). */
  isCurrent: () => boolean;
  /** Re-arms this job's time limit (runWithTimeLimits' `progress`). */
  rearm: (percent: number) => void;
  setStatus: (update: (status: JobStatusState | null) => JobStatusState | null) => void;
};

/** The `onProgress` one job receives. */
export function createOnProgress({ isCurrent, rearm, setStatus }: ProgressWiring): (percent: number) => void {
  return (percent) => {
    // Always re-arm: a stale job still occupies the shared engine, and if its limit expired,
    // resetQpdf() would kill the engine under the job the user started since.
    rearm(percent);
    if (isCurrent()) setStatus((status) => withProgress(status, percent));
  };
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run src/lib/job-progress.test.ts`
Expected: 5 PASS.

- [ ] **Step 5: Wire it into the hook**

In `src/lib/use-qpdf-job.ts`:

1. Add the import below the `crash-guard` import:

```ts
import { createOnProgress, type JobStatusState } from "@/lib/job-progress";
```

2. Delete these two lines:

```ts
/** What a running job is doing, for JobStatus. */
export type JobStatusState = { phase: JobPhase; label: string; startedAt: number; sizeBytes: number };
```

3. Replace the doc comment of `useQpdfJob` and the `run` callback's opening, from `/**\n * Busy, status and error state` through the closing `});` of `runWithTimeLimits({ … })`, with:

```ts
/**
 * Busy, status and error state for one qpdf job at a time. Results and progress that arrive after
 * reset() or unmount are dropped, so a slow job can't overwrite a newer screen. The job receives an
 * `onProgress` to pass to the qpdf call that writes its download (only that one). An engine that
 * doesn't load within ENGINE_LOAD_TIMEOUT_MS, or a job that exceeds its time limit (see
 * runWithTimeLimits), fails with a clear message and the (presumably stuck) engine is replaced.
 */
export function useQpdfJob({ nameFiles = false }: { nameFiles?: boolean } = {}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorDescription | null>(null);
  const [status, setStatus] = useState<JobStatusState | null>(null);
  /** How long the last successful job took, for the result page. */
  const [lastDurationMs, setLastDurationMs] = useState<number | null>(null);
  const generation = useRef(0);

  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );

  const run = useCallback(
    async <T>(
      job: (qpdf: Qpdf, onProgress: (percent: number) => void) => Promise<T>,
      { label, sizeBytes }: RunOptions,
    ): Promise<T | null> => {
      const id = ++generation.current;
      const isCurrent = () => id === generation.current;
      const startedAt = Date.now();
      setBusy(true);
      setError(null);
      setStatus({ phase: "load", label, startedAt, sizeBytes, percent: null });
      setLastDurationMs(null);
      let phase: JobPhase = "load";
      markJobStarted();
      try {
        const result = await runWithTimeLimits({
          load: getQpdf,
          job: (qpdf, progress) => job(qpdf, createOnProgress({ isCurrent, rearm: progress, setStatus })),
          loadMs: ENGINE_LOAD_TIMEOUT_MS,
          jobMs: jobTimeoutMs(sizeBytes),
          stallMs: STALL_TIMEOUT_MS,
          onRun: () => {
            phase = "run";
            if (isCurrent()) setStatus({ phase: "run", label, startedAt, sizeBytes, percent: null });
          },
        });
```

4. In the rest of `run`, replace the three remaining `id !== generation.current` / `id === generation.current` checks with `!isCurrent()` / `isCurrent()`. The `catch` and `finally` bodies are otherwise unchanged.

`JobPhase` stays imported from `@/lib/qpdf` and is still used for errors. `describeQpdfError` is unchanged.

- [ ] **Step 6: Point `JobStatus` at the new type**

In `src/components/JobStatus.tsx` replace:

```ts
import type { JobStatusState } from "@/lib/use-qpdf-job";
```

with:

```ts
import type { JobStatusState } from "@/lib/job-progress";
```

Run `grep -rn "JobStatusState" src e2e` and make sure no other file imports it from `use-qpdf-job`.

- [ ] **Step 7: Full check, commit, push**

```bash
npm run lint && npm test && npm run build
git add src/lib/job-progress.ts src/lib/job-progress.test.ts src/lib/use-qpdf-job.ts src/components/JobStatus.tsx
git commit -m "feat: job progress state; run() hands each job an onProgress"
git push
```

---

### Task 4: Progress bar in `JobStatus`

**Files:**
- Create: `src/components/ui/progress.tsx`
- Modify: `src/components/JobStatus.tsx`
- Modify: `package.json`, `package-lock.json`

**Interfaces:**
- Consumes: `JobStatusState` (`phase` includes `"finishing"`, `percent: number | null`) from Task 3.
- Produces: `Progress` (`React.ComponentProps<typeof ProgressPrimitive.Root>`) from `@/components/ui/progress`, rendering `role="progressbar"` with `aria-valuenow` = `value`.

The bar only appears once pages pass `onProgress` (Task 5), so this task is verified by build, lint and the unchanged E2E suite. Task 5 adds the E2E tests that see the bar.

- [ ] **Step 1: Add the Radix package**

```bash
npm install @radix-ui/react-progress@^1.1.17
```

- [ ] **Step 2: Add the shadcn primitive**

Create `src/components/ui/progress.tsx` (shadcn new-york v4 `progress`, with per-package Radix import; **`value` is also passed to Root**, which the stock component omits, so Radix sets `aria-valuenow`):

```tsx
import * as ProgressPrimitive from "@radix-ui/react-progress";
import * as React from "react";

import { cn } from "@/lib/utils";

function Progress({ className, value, ...props }: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-primary/20", className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="h-full w-full flex-1 bg-primary transition-all"
        style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
```

- [ ] **Step 3: Render the bar and "Finishing…"**

Replace the whole of `src/components/JobStatus.tsx` with:

```tsx
import { useEffect, useState } from "react";

import { Progress } from "@/components/ui/progress";
import { formatElapsed } from "@/lib/format";
import type { JobStatusState } from "@/lib/job-progress";

const LARGE_FILE_BYTES = 50 * 1024 * 1024;

const STEP_TEXT: Record<Exclude<JobStatusState["phase"], "run">, string> = {
  load: "Loading the PDF engine…",
  finishing: "Finishing…",
};

/**
 * The running job's step and elapsed time, plus a hint for large files. While qpdf writes, a bar
 * shows its progress; after 100% the step reads "Finishing…" (the job may still check the output).
 */
export function JobStatus({ status }: { status: JobStatusState | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!status) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [status]);

  if (!status) return null;
  const step = status.phase === "run" ? status.label : STEP_TEXT[status.phase];
  return (
    <div className="grid gap-1.5 text-sm text-muted-foreground">
      <div role="status" aria-live="polite" className="grid gap-0.5">
        <p className="tabular-nums">
          {step}{" "}
          {/* Not announced: a live region that changes every second would drown out screen readers. */}
          <span aria-hidden="true">{formatElapsed(now - status.startedAt)}</span>
        </p>
        {status.sizeBytes > LARGE_FILE_BYTES ? <p className="text-xs">Large files can take a few minutes on phones.</p> : null}
      </div>
      {status.percent !== null ? (
        // Outside the live region: screen readers can query the bar, but percentages aren't announced.
        <div className="flex items-center gap-2">
          <Progress value={status.percent} aria-label={status.label} className="flex-1" />
          <span aria-hidden="true" className="w-9 text-right text-xs tabular-nums">
            {status.percent}%
          </span>
        </div>
      ) : null}
    </div>
  );
}
```

Correction (final review): the `useEffect` dependency on `status` restarts the 1 s interval on every progress update, which freezes the elapsed clock while progress arrives faster than once a second. The shipped code keys the effect on `running = status !== null`; `e2e/job-safeguard.spec.ts` "the elapsed time keeps ticking…" pins it.

- [ ] **Step 4: Full check including E2E (nothing visible may change yet)**

```bash
npm run lint && npm test && npm run test:e2e
```

Expected: all PASS. In particular, `e2e/job-safeguard.spec.ts` still finds "Loading the PDF engine… 0:05" and "Compressing… m:ss".

- [ ] **Step 5: Commit, push**

```bash
git add package.json package-lock.json src/components/ui/progress.tsx src/components/JobStatus.tsx
git commit -m "feat: progress bar and Finishing step in JobStatus"
git push
```

---

### Task 5: Pages pass `onProgress`; E2E proof

**Files:**
- Modify: `src/pages/DecryptPage.tsx`, `src/pages/EncryptPage.tsx`, `src/pages/MergePage.tsx`, `src/pages/ExtractPage.tsx`, `src/pages/CompressPage.tsx`
- Modify: `src/test/make-pdf.ts`
- Modify: `e2e/global-setup.ts`, `e2e/helpers.ts`
- Test: `e2e/job-safeguard.spec.ts`, `e2e/info.spec.ts`

**Interfaces:**
- Consumes: `run(job: (qpdf, onProgress) => …)` (Task 3), `JobStatus` bar with `role="progressbar"`, `aria-valuenow` and the live region `[aria-live]` (Task 4).
- Produces: `makePdf(pages, { fillerBytes })`; E2E helpers `recordProgress(page)` and `recordedProgress(page)`; fixture `twenty-mb.pdf` (400 pages, ~20 MB, compresses smaller).

- [ ] **Step 1: Add a slow-to-write option to `makePdf`**

In `src/test/make-pdf.ts`:

1. Change the doc comment's first line and the signature:

```ts
/**
 * Builds a valid, uncompressed PDF in memory: `pages` Letter pages (or `size`), a correct xref table,
 * and an optional Info dictionary with Title, Author and CreationDate. `fillerBytes` adds a comment
 * of that many printable characters to each page's content stream, so the PDF is big and takes a
 * while to write (for progress tests).
 */
export function makePdf(
  pages: number,
  options: { title?: string; size?: [number, number]; fillerBytes?: number } = {},
): Uint8Array<ArrayBuffer> {
```

2. Replace the `const text = …` line inside the page loop with:

```ts
    const text =
      `BT /F1 24 Tf 72 700 Td (Page ${i}) Tj ET` + (options.fillerBytes ? `\n%${filler(options.fillerBytes, i)}` : "");
```

3. Append below `makePdf`:

```ts
/** `length` printable ASCII characters (33–122), deterministic per `seed`; a PDF comment can hold them. */
function filler(length: number, seed: number): string {
  const chars: string[] = [];
  let state = seed;
  for (let i = 0; i < length; i++) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    chars.push(String.fromCharCode(33 + ((state >>> 16) % 90)));
  }
  return chars.join("");
}
```

- [ ] **Step 2: Generate the fixture**

In `e2e/global-setup.ts`, after the `linearized.pdf` line:

```ts
    // Real and ~20 MB: writing it takes long enough for the progress bar to render.
    await writeFile(fixture("twenty-mb.pdf"), makePdf(400, { fillerBytes: 50_000 }));
```

- [ ] **Step 3: Add the progress recorder to the E2E helpers**

Append to `e2e/helpers.ts`:

```ts
export type RecordedProgress = { values: number[]; insideLiveRegion: boolean };

/**
 * Records every value the job progress bar shows (deduplicated, in order) and whether the bar ever sat
 * inside an aria-live region. Call before page.goto; read with recordedProgress(). Recording avoids
 * racing a bar that may only be visible for a fraction of a second.
 */
export async function recordProgress(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const record = { values: [] as number[], insideLiveRegion: false };
    Object.assign(window, { __progress: record });
    new MutationObserver(() => {
      const bar = document.querySelector('[role="progressbar"]');
      const value = bar?.getAttribute("aria-valuenow");
      if (!bar || value == null) return;
      if (bar.closest("[aria-live]")) record.insideLiveRegion = true;
      if (Number(value) !== record.values.at(-1)) record.values.push(Number(value));
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-valuenow"] });
  });
}

export async function recordedProgress(page: Page): Promise<RecordedProgress> {
  return page.evaluate(() => (window as unknown as { __progress: RecordedProgress }).__progress);
}
```

- [ ] **Step 4: Write the failing E2E tests**

In `e2e/job-safeguard.spec.ts`, change the helpers import to:

```ts
import { chooseFiles, download, inspectPdf, type RecordedProgress, recordedProgress, recordProgress } from "./helpers";
```

and append:

```ts
/** The bar showed, its values only rose, at least one sat between 1 and 99, and it was never announced. */
function expectRisingBar({ values, insideLiveRegion }: RecordedProgress) {
  expect(values.length).toBeGreaterThan(0);
  expect(values.every((percent, i) => i === 0 || percent > values[i - 1])).toBe(true);
  expect(values.every((percent) => percent >= 0 && percent <= 99)).toBe(true);
  expect(values.some((percent) => percent >= 1 && percent <= 99)).toBe(true);
  expect(insideLiveRegion).toBe(false);
}

test("compressing shows a rising progress bar, then the result", async ({ page }) => {
  await recordProgress(page);
  await page.goto("/compress");
  await chooseFiles(page, "twenty-mb.pdf");
  await page.getByRole("button", { name: "Compress", exact: true }).click();
  await expect(page.getByText("Your PDF is smaller")).toBeVisible();
  expectRisingBar(await recordedProgress(page));
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  const file = await download(page, "Download compressed PDF");
  expect(await inspectPdf(file.path)).toMatchObject({ pageCount: 400, encrypted: false });
});

test("encrypting shows a rising progress bar, then the result", async ({ page }) => {
  await recordProgress(page);
  await page.goto("/encrypt");
  await chooseFiles(page, "twenty-mb.pdf");
  await page.getByLabel("Password to open", { exact: true }).fill("secret");
  await page.getByLabel("Confirm password", { exact: true }).fill("secret");
  await page.getByRole("button", { name: "Encrypt", exact: true }).click();
  await expect(page.getByText("Your PDF is protected")).toBeVisible();
  expectRisingBar(await recordedProgress(page));
  const file = await download(page, "Download protected PDF");
  expect(await inspectPdf(file.path, "secret")).toMatchObject({ pageCount: 400, encrypted: true });
});
```

In `e2e/info.spec.ts`, change the helpers import to `import { chooseFiles, recordedProgress, recordProgress } from "./helpers";` and append:

```ts
test("shows no progress bar (qpdf reports none for Info)", async ({ page }) => {
  await recordProgress(page);
  await inspect(page, "twenty-mb.pdf");
  await expect(row(page, "Pages")).toHaveText("400");
  expect((await recordedProgress(page)).values).toEqual([]);
});
```

- [ ] **Step 5: Run them to verify the bar tests fail**

Run: `npm run test:e2e -- e2e/job-safeguard.spec.ts e2e/info.spec.ts`
Expected: the two "rising progress bar" tests FAIL at `expect(values.length).toBeGreaterThan(0)` (no page passes `onProgress` yet). The Info test PASSES. If the fixture step itself fails, fix that first.

- [ ] **Step 6: Pass `onProgress` to each writing call**

`src/pages/DecryptPage.tsx`:

```tsx
    const output = await job.run(async (qpdf, onProgress) => {
      const decrypted = await qpdf.decrypt(file, { password, onProgress });
```

`src/pages/EncryptPage.tsx`:

```tsx
    const output = await job.run(async (qpdf, onProgress) => {
      await ensureNoOpenPassword(qpdf, file);
      const encrypted = await qpdf.encrypt(file, {
        userPassword: password,
        ownerPassword: generateOwnerPassword(),
        allow,
        onProgress,
      });
```

`src/pages/MergePage.tsx`:

```tsx
    const merged = await job.run(async (qpdf, onProgress) => {
```

and

```tsx
      const { output, warnings } = await qpdf.merge(files, { onProgress });
```

`src/pages/ExtractPage.tsx`: only the submit job (the "Counting pages…" job stays as it is):

```tsx
    const extracted = await job.run(async (qpdf, onProgress) => {
      const { output, warnings } = await qpdf.selectPages(file, normalized, { onProgress });
```

`src/pages/CompressPage.tsx`:

```tsx
    const output = await job.run(async (qpdf, onProgress) => {
      await ensureNoOpenPassword(qpdf, file);
      const compressed = await qpdf.compress(file, { onProgress });
```

Check that `InfoPage.tsx` is untouched: `grep -n onProgress src/pages/InfoPage.tsx` prints nothing.

The existing test "a running job shows a step and a timer" in `e2e/job-safeguard.spec.ts` can now catch the brief "Finishing…" step. Widen its regex:

```ts
  await expect(page.getByText(/^(Loading the PDF engine…|Compressing…|Finishing…) \d+:\d\d$/)).toBeVisible();
```

- [ ] **Step 7: Run the E2E suite**

Run: `npm run test:e2e`
Expected: all PASS. If a "rising progress bar" test is flaky only on `values.length` or the 1–99 check (the write finished before React rendered a frame), raise the fixture to `makePdf(800, { fillerBytes: 50_000 })` and the expected `pageCount` in both tests and the Info test to 800. Don't weaken the assertions.

- [ ] **Step 8: Full check, commit, push**

```bash
npm run lint && npm test && npm run build
git add src/pages src/test/make-pdf.ts e2e/global-setup.ts e2e/helpers.ts e2e/job-safeguard.spec.ts e2e/info.spec.ts
git commit -m "feat: show write progress in Decrypt, Encrypt, Merge, Extract and Compress"
git push
```

---

### Task 6: Docs, version and release gate

**Files:**
- Modify: `package.json`, `package-lock.json` (version)
- Modify: `CHANGELOG.md`, `AGENTS.md`, `docs/todo.md`

**Interfaces:**
- Consumes: names from Tasks 1–5 (`STALL_TIMEOUT_MS`, `src/lib/job-progress.ts`, `src/components/ui/progress.tsx`, `twenty-mb.pdf`).
- Produces: documentation only.

- [ ] **Step 1: Bump the version**

```bash
npm version 1.1.0 --no-git-tag-version
```

Expected: `package.json` and `package-lock.json` read `1.1.0`. The footer shows `__APP_VERSION__`, so no code change is needed.

- [ ] **Step 2: Changelog**

In `CHANGELOG.md`, insert above `## [1.0.0] - 2026-10-07`:

```markdown
## [1.1.0] - Unreleased

### Added

- A progress bar while the PDF is being written (Decrypt, Encrypt, Merge, Extract pages, Compress),
  then "Finishing…" for the last checks.

### Changed

- A stuck PDF engine is detected sooner: once a job reports progress, it stops after 30 seconds
  without any.
- `@mssio/qpdf-wasm` 1.1.0 (same qpdf 12.4.2 and the same `qpdf.wasm`; it adds progress reporting).
```

The owner replaces `Unreleased` with the date when releasing.

- [ ] **Step 3: `AGENTS.md`**

1. In "Map", after the `src/components/ui/secret-input.tsx` line add:

```
src/components/ui/progress.tsx  shadcn Progress; passes `value` to Radix so `aria-valuenow` is set
```

and after the `src/lib/use-qpdf-job.ts` line add:

```
src/lib/job-progress.ts   JobStatusState; turns qpdf write progress into status (drops stale jobs)
```

2. In "qpdf rules", replace the bullet that starts `- Run jobs through \`useQpdfJob().run(async (qpdf) => …` (through `("Finished in m:ss.").`) with:

```markdown
- Run jobs through `useQpdfJob().run(async (qpdf, onProgress) => …, { label: "Encrypting…", sizeBytes })`; it maps
  errors with `describeQpdfError`, ignores results and progress after `reset()` or unmount, shows the step via
  `<JobStatus status={job.status} />`, and enforces limits via `runWithTimeLimits` (`src/lib/run-job.ts`): the engine must load within
  `ENGINE_LOAD_TIMEOUT_MS`; the job then has `jobTimeoutMs(sizeBytes)`, except that while qpdf reports 0–99%
  each report allows `STALL_TIMEOUT_MS` (30 s) until the next, and 100% restores `jobTimeoutMs`;
  on any timeout the stuck engine is replaced (`resetQpdf()`). `label` and `sizeBytes` are required:
  always pass the real input size. Pass `durationMs={job.lastDurationMs}` to `ResultCard` ("Finished in m:ss.").
- Pass `onProgress` **only** to the qpdf call that writes the download (`decrypt`, `encrypt`, `merge`,
  `selectPages`, `compress`): never to `ensureNoOpenPassword`, `info()` or `run()`. `JobStatus` shows a bar for
  0–99% and "Finishing…" after 100%; a second writing call would restart the bar.
```

3. Replace the "Known package issue" paragraph with:

```markdown
`@mssio/qpdf-wasm` 1.0.0 (qpdf 12.4.2) runs out of wasm memory on large inputs: encrypt threw
`std::bad_alloc` at 400 MB and at 600 MB resolved with a near-empty output instead of rejecting.
That's why `assertOutput()` guards every download and why `MAX_TOTAL_BYTES` is 250 MB. 1.1.0 ships the
byte-identical `qpdf.wasm` (same SHA-256), so this still holds. Re-check both if a later upgrade changes the wasm.
```

- [ ] **Step 4: `docs/todo.md`**

1. Replace the intro paragraph's last two sentences ("For the next release, add its owner checks here …") with:

```markdown
Release 1.1.0 (progress bar) is in progress; its owner checks are below. Don't release until
`npm run test:e2e` passes and every box is ticked.
```

2. Add two rows to the automated-check table, after the `e2e/job-safeguard.spec.ts` row:

```markdown
| While qpdf writes, a progress bar rises (0–99%, never inside the announced status), then the result; checked for Compress and Encrypt on a 20 MB, 400-page PDF and verified with `inspectPdf` | `e2e/job-safeguard.spec.ts` |
| Info shows no progress bar | `e2e/info.spec.ts` |
```

3. Insert a new section above `## Next versions`:

```markdown
## Owner checks for 1.1.0

- [ ] Real iPhone: Compress and Encrypt a ~200 MB PDF. The bar moves, "Finishing…" shows, the download opens, and no "took too long" message appears.
- [ ] Desktop browser: the same with a large PDF. The bar moves smoothly and the result is correct.
- [ ] Installed PWA: after closing every tab and reopening online, the footer shows 1.1.0, and the app still works offline.
```

4. Replace the "Next versions" paragraph with:

```markdown
1.1.0 (real progress bar): spec [2026-10-09-progress-bar-design.md](superpowers/specs/2026-10-09-progress-bar-design.md),
plan [2026-10-09-progress-bar.md](superpowers/plans/2026-10-09-progress-bar.md). Later versions are planned in
`docs/notes/`: [1.2.0](notes/1.2.0-plan.md) (page grid, Organize, images in Merge). When a release starts, copy
its owner checks here as unticked boxes; this file stays the release gate.
```

- [ ] **Step 5: Final verification**

```bash
npm run lint && npm test && npm run build && grep -o 'qpdf[^"]*\.wasm' dist/sw.js && npm run test:e2e
```

Expected: everything passes, and the wasm is listed in the precache.

- [ ] **Step 6: Commit, push, open a PR (no merge)**

```bash
git add package.json package-lock.json CHANGELOG.md AGENTS.md docs/todo.md
git commit -m "docs: 1.1.0 changelog, AGENTS rules for progress, owner checks"
git push
gh pr create --base main --head feat/progress-bar --title "1.1.0: progress bar" --body "Implements docs/superpowers/specs/2026-10-09-progress-bar-design.md. Owner checks in docs/todo.md are unticked; merge and release need the owner's go-ahead."
```

Add the PR attribution footer from the session's instructions to the body. Don't merge, tag or release.

---

### Task 7: Smooth bar motion (added 2026-10-09 after the owner's iPhone test)

qpdf's percent counts objects, so it arrives in bursts. On the iPhone, encrypt first showed the bar at 36% and then jumped ~15% at a time (spec §1). The bar should glide instead. Spec §4 "Indicator motion" and the `ProgressRow` bullet are the requirements.

> **As built (2026-10-09):** Step 1's `values[0]` check in the existing Compress test passed on the old
> code, because the uniform fixture reports 0 first, so it proved nothing and was dropped. Instead,
> `spaceOutProgress` now takes `{ gapMs, burstBelow? }`: progress below `burstBelow` is held and delivered
> in one task with the first value at or above it. A new test, "a bar whose first progress arrives in a
> burst slides in from 0", uses `{ gapMs: 20, burstBelow: 36 }` and expects `values[0] === 0` and
> `values[1] >= 35`. Before the fix it failed with `Received: 36`, the iPhone symptom.
> `compressWithVisibleBar` calls `spaceOutProgress(page, { gapMs: 50 })`. Result: 55/55 E2E;
> progress tests 30/30 with `--repeat-each=10`.

**Files:**
- Modify: `src/components/ui/progress.tsx` (Indicator classes)
- Modify: `src/components/JobStatus.tsx` (new `ProgressRow`)
- Test: `e2e/job-safeguard.spec.ts`

**Interfaces:**
- Consumes: `spaceOutProgress(page, gapMs)`, `recordProgress`, `recordedProgress` from `e2e/helpers.ts`; the indicator's `data-slot="progress-indicator"`.
- Produces: nothing new for other code.

- [ ] **Step 1: Write the failing tests**

In `e2e/job-safeguard.spec.ts`, in the test "compressing shows a rising progress bar, then the result", replace `expectRisingBar(await recordedProgress(page));` with:

```ts
  const progress = await recordedProgress(page);
  expectRisingBar(progress);
  expect(progress.values[0]).toBe(0); // the bar slides in from 0 instead of appearing mid-way
```

Append:

```ts
/** Starts a Compress whose progress lasts ~5 s and returns the bar's fill once it shows. */
async function compressWithVisibleBar(page: Page) {
  await spaceOutProgress(page, 50);
  await page.goto("/compress");
  await chooseFiles(page, "twenty-mb.pdf");
  await page.getByRole("button", { name: "Compress", exact: true }).click();
  const fill = page.locator('[data-slot="progress-indicator"]');
  await expect(fill).toBeVisible();
  return fill;
}

test("the bar glides to each new value", async ({ page }) => {
  const fill = await compressWithVisibleBar(page);
  const transition = await fill.evaluate((element) => {
    const style = getComputedStyle(element);
    return { property: style.transitionProperty, seconds: parseFloat(style.transitionDuration) };
  });
  expect(transition.property).toContain("transform");
  expect(transition.seconds).toBeGreaterThanOrEqual(0.5);
});

test.describe("with Reduce Motion on", () => {
  test.use({ reducedMotion: "reduce" });

  test("the bar doesn't animate", async ({ page }) => {
    const fill = await compressWithVisibleBar(page);
    expect(await fill.evaluate((element) => getComputedStyle(element).transitionProperty)).toBe("none");
  });
});
```

The first line of the spec file already imports `type Page` from `@playwright/test`, and the helpers import already includes `spaceOutProgress`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run test:e2e -- e2e/job-safeguard.spec.ts`
Expected: "compressing shows…" FAILS on `values[0]` (first value is 36 or similar, not 0). "the bar glides…" FAILS on `seconds` (0.15). "the bar doesn't animate" FAILS (the property is `all`, not `none`).

- [ ] **Step 3: Slower, reduced-motion-aware indicator**

In `src/components/ui/progress.tsx`, change the Indicator's `className` to:

```tsx
        className="h-full w-full flex-1 bg-primary transition-transform duration-600 ease-out motion-reduce:transition-none"
```

- [ ] **Step 4: Slide in from 0**

In `src/components/JobStatus.tsx`, replace the bar block:

```tsx
      {status.percent !== null ? (
        // Outside the live region: screen readers can query the bar, but percentages aren't announced.
        <div className="flex items-center gap-2">
          <Progress value={status.percent} aria-label={status.label} className="flex-1" />
          <span aria-hidden="true" className="w-9 text-right text-xs tabular-nums">
            {status.percent}%
          </span>
        </div>
      ) : null}
```

with:

```tsx
      {status.percent !== null ? (
        // Outside the live region: screen readers can query the bar, but percentages aren't announced.
        <ProgressRow percent={status.percent} label={status.label} />
      ) : null}
```

and add below `JobStatus`:

```tsx
/**
 * The bar and qpdf's percent. The bar mounts at 0 and takes each value on the next animation frame,
 * so it slides in (and glides on, via the indicator's transition) instead of appearing mid-way.
 */
function ProgressRow({ percent, label }: { percent: number; label: string }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(percent));
    return () => cancelAnimationFrame(frame);
  }, [percent]);

  return (
    <div className="flex items-center gap-2">
      <Progress value={shown} aria-label={label} className="flex-1" />
      <span aria-hidden="true" className="w-9 text-right text-xs tabular-nums">
        {percent}%
      </span>
    </div>
  );
}
```

- [ ] **Step 5: Run the E2E suite**

Run: `npm run test:e2e`
Expected: all PASS (55 tests). Then `npx playwright test e2e/job-safeguard.spec.ts -g "rising progress" --repeat-each=10` → 20/20. The extra frame of delay must not make the "at least one value between 1 and 99" check flaky. If it does, investigate before changing the assertion.

- [ ] **Step 6: Full check, commit, push**

```bash
npm run lint && npm test && npm run build
git add src/components/ui/progress.tsx src/components/JobStatus.tsx e2e/job-safeguard.spec.ts
git commit -m "feat: progress bar glides between values and slides in from 0"
git push
```

---

## Update prompt (Tasks 8–10, added 2026-10-09)

Spec section 7 is the authority. Goal: while online, the app checks for a newer deployment (hourly, on `online`, and on returning to the foreground at most once a minute). It shows an "Update available" dialog with Later / Update now. After Later, an "Update to the latest version" button sits in the footer. Nothing reloads while a job runs.

**Extra global constraints for Tasks 8–10:**
- The only new strings, exactly: `Update available`, `A new version of PDF Toolbox is ready. Updating reloads the page, so anything you've chosen here will need to be chosen again.`, `Later`, `Update now`, `Update to the latest version`.
- `UPDATE_CHECK_INTERVAL_MS = 3_600_000`, `UPDATE_CHECK_MIN_GAP_MS = 60_000`.
- No new runtime requests besides the `sw.js` check; nothing loaded from a CDN.
- Port 4173 must be free before `npm run test:e2e`. Stop any test server (`vite preview`, `tailscale serve`) first.

**Review focus (update prompt):**
1. An update must never reload the page during a job (dialog deferred, footer button disabled, `updateNow()` guarded). Pinned by `shouldShowUpdatePrompt` unit tests and E2E test 2.
2. An offline device or a down server must never look like an update (`checkForUpdate` only updates on HTTP 200). Pinned by unit tests.
3. Switching apps repeatedly must not spam `sw.js` requests (60 s gap). Pinned by unit tests.
4. With service workers blocked (every other E2E spec), the app must still render and work. Pinned by the full E2E suite.
5. Users on 1.0.0 can't get the dialog (their cached app has none). Documented in the spec's Out of scope, not tested.

---

### Task 8: Update checker and job-activity store

**Files:**
- Create: `src/lib/update-check.ts`, `src/lib/update-check.test.ts`
- Create: `src/lib/job-activity.ts`, `src/lib/job-activity.test.ts`
- Modify: `src/lib/use-qpdf-job.ts`

**Interfaces:**
- Produces:
  - `startUpdateChecks(options: UpdateCheckOptions): () => void`
  - `checkForUpdate(swUrl: string, registration: Pick<ServiceWorkerRegistration, "installing" | "update">, fetchSw?: typeof fetch): Promise<void>`
  - `shouldShowUpdatePrompt({ updateReady, dismissed, jobRunning }: { updateReady: boolean; dismissed: boolean; jobRunning: boolean }): boolean`
  - `UPDATE_CHECK_INTERVAL_MS`, `UPDATE_CHECK_MIN_GAP_MS`
  - `jobStarted()`, `jobFinished()`, `isJobRunning(): boolean`, `subscribeJobActivity(listener: () => void): () => void`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/update-check.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  checkForUpdate,
  shouldShowUpdatePrompt,
  startUpdateChecks,
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_CHECK_MIN_GAP_MS,
} from "@/lib/update-check";

describe("startUpdateChecks", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup() {
    const win = new EventTarget();
    const doc = Object.assign(new EventTarget(), { visibilityState: "visible" as DocumentVisibilityState });
    const network = { online: true };
    const check = vi.fn(async () => {});
    const stop = startUpdateChecks({ check, isOnline: () => network.online, win, doc });
    const goOnline = () => win.dispatchEvent(new Event("online"));
    const setVisibility = (state: DocumentVisibilityState) => {
      doc.visibilityState = state;
      doc.dispatchEvent(new Event("visibilitychange"));
    };
    return { check, stop, network, goOnline, setVisibility };
  }

  test("checks once an hour while online", async () => {
    const { check } = setup();
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS - 1);
    expect(check).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(check).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS);
    expect(check).toHaveBeenCalledTimes(2);
  });

  test("never checks while offline", async () => {
    const { check, network, goOnline } = setup();
    network.online = false;
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS);
    goOnline(); // a stray event while navigator.onLine is still false
    expect(check).not.toHaveBeenCalled();
  });

  test("coming back online always checks, even right after another check", () => {
    const { check, goOnline } = setup();
    goOnline();
    goOnline();
    expect(check).toHaveBeenCalledTimes(2);
  });

  test("returning to the foreground checks at most once a minute", async () => {
    const { check, setVisibility } = setup();
    setVisibility("visible"); // registering just checked
    expect(check).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_MIN_GAP_MS);
    setVisibility("visible");
    setVisibility("visible");
    expect(check).toHaveBeenCalledTimes(1);
  });

  test("going to the background doesn't check", async () => {
    const { check, setVisibility } = setup();
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_MIN_GAP_MS);
    setVisibility("hidden");
    expect(check).not.toHaveBeenCalled();
  });

  test("a failed check is harmless and the next trigger checks again", async () => {
    const { check, goOnline } = setup();
    check.mockRejectedValueOnce(new Error("network"));
    goOnline();
    await vi.advanceTimersByTimeAsync(0);
    goOnline();
    expect(check).toHaveBeenCalledTimes(2);
  });

  test("stop() ends every trigger", async () => {
    const { check, stop, goOnline, setVisibility } = setup();
    stop();
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS);
    goOnline();
    setVisibility("visible");
    expect(check).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("checkForUpdate", () => {
  function registration(installing: object | null = null) {
    return { installing, update: vi.fn(async () => {}) } as unknown as Pick<
      ServiceWorkerRegistration,
      "installing" | "update"
    > & { update: ReturnType<typeof vi.fn> };
  }

  test("fetches sw.js without any cache and updates when the server answers 200", async () => {
    const reg = registration();
    const fetchSw = vi.fn(async () => new Response("", { status: 200 }));
    await checkForUpdate("/sw.js", reg, fetchSw);
    expect(fetchSw).toHaveBeenCalledWith("/sw.js", expect.objectContaining({ cache: "no-store" }));
    expect(reg.update).toHaveBeenCalledTimes(1);
  });

  test("a server error or a network failure is never taken for an update", async () => {
    const reg = registration();
    await checkForUpdate("/sw.js", reg, vi.fn(async () => new Response("", { status: 503 })));
    await checkForUpdate("/sw.js", reg, vi.fn(async () => Promise.reject(new TypeError("offline"))));
    expect(reg.update).not.toHaveBeenCalled();
  });

  test("does nothing while an update is already installing", async () => {
    const reg = registration({});
    const fetchSw = vi.fn();
    await checkForUpdate("/sw.js", reg, fetchSw);
    expect(fetchSw).not.toHaveBeenCalled();
  });
});

describe("shouldShowUpdatePrompt", () => {
  test("only for a ready update that wasn't dismissed, and never during a job", () => {
    for (const updateReady of [false, true])
      for (const dismissed of [false, true])
        for (const jobRunning of [false, true])
          expect(shouldShowUpdatePrompt({ updateReady, dismissed, jobRunning })).toBe(
            updateReady && !dismissed && !jobRunning,
          );
  });
});
```

Create `src/lib/job-activity.test.ts`:

```ts
import { describe, expect, test, vi } from "vitest";

import { isJobRunning, jobFinished, jobStarted, subscribeJobActivity } from "@/lib/job-activity";

// The store is module state: every test leaves it idle again.
describe("job activity", () => {
  test("a started job counts as running until it finishes", () => {
    expect(isJobRunning()).toBe(false);
    jobStarted();
    expect(isJobRunning()).toBe(true);
    jobFinished();
    expect(isJobRunning()).toBe(false);
  });

  test("overlapping jobs run until the last one finishes", () => {
    jobStarted();
    jobStarted();
    jobFinished();
    expect(isJobRunning()).toBe(true);
    jobFinished();
    expect(isJobRunning()).toBe(false);
  });

  test("an extra finish never makes a later job look idle", () => {
    jobFinished();
    jobStarted();
    expect(isJobRunning()).toBe(true);
    jobFinished();
    expect(isJobRunning()).toBe(false);
  });

  test("subscribers hear every change until they unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeJobActivity(listener);
    jobStarted();
    jobFinished();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    jobStarted();
    jobFinished();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/update-check.test.ts src/lib/job-activity.test.ts`
Expected: both suites FAIL with "Failed to resolve import".

- [ ] **Step 3: Implement**

Create `src/lib/update-check.ts`:

```ts
/** How often an open app checks for a new deployment while online. */
export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
/** Returning to the foreground checks only if the last check was at least this long ago. */
export const UPDATE_CHECK_MIN_GAP_MS = 60 * 1000;

type Listenable = Pick<EventTarget, "addEventListener" | "removeEventListener">;

export type UpdateCheckOptions = {
  check: () => Promise<void>;
  isOnline: () => boolean;
  intervalMs?: number;
  minGapMs?: number;
  win?: Listenable;
  doc?: Listenable & { readonly visibilityState: DocumentVisibilityState };
  now?: () => number;
};

/**
 * Checks for a new deployment hourly, whenever the device comes back online, and when the app returns
 * to the foreground (at most once per minGapMs). Never while offline. Returns a function that stops it.
 */
export function startUpdateChecks({
  check,
  isOnline,
  intervalMs = UPDATE_CHECK_INTERVAL_MS,
  minGapMs = UPDATE_CHECK_MIN_GAP_MS,
  win = window,
  doc = document,
  now = Date.now,
}: UpdateCheckOptions): () => void {
  let lastCheck = now(); // registering the service worker has just checked
  const run = (throttled: boolean) => {
    if (!isOnline()) return;
    if (throttled && now() - lastCheck < minGapMs) return;
    lastCheck = now();
    check().catch(() => {}); // a failed check just waits for the next trigger
  };
  const onOnline = () => run(false);
  const onVisibility = () => {
    if (doc.visibilityState === "visible") run(true);
  };
  const timer = setInterval(() => run(false), intervalMs);
  win.addEventListener("online", onOnline);
  doc.addEventListener("visibilitychange", onVisibility);
  return () => {
    clearInterval(timer);
    win.removeEventListener("online", onOnline);
    doc.removeEventListener("visibilitychange", onVisibility);
  };
}

/**
 * One check, following vite-plugin-pwa's recipe for edge cases: only if sw.js is reachable (HTTP 200)
 * does the browser compare it with the installed one, so a down server never looks like an update.
 */
export async function checkForUpdate(
  swUrl: string,
  registration: Pick<ServiceWorkerRegistration, "installing" | "update">,
  fetchSw: typeof fetch = fetch,
): Promise<void> {
  if (registration.installing) return;
  const response = await fetchSw(swUrl, { cache: "no-store", headers: { "cache-control": "no-cache" } }).catch(
    () => null,
  );
  if (response?.status === 200) await registration.update();
}

/** The dialog shows for a ready update the user hasn't put off, and never while a job runs (updating reloads). */
export function shouldShowUpdatePrompt({
  updateReady,
  dismissed,
  jobRunning,
}: {
  updateReady: boolean;
  dismissed: boolean;
  jobRunning: boolean;
}): boolean {
  return updateReady && !dismissed && !jobRunning;
}
```

Create `src/lib/job-activity.ts`:

```ts
/**
 * Whether any qpdf job is running in this tab. The update prompt reads it: updating reloads the page,
 * which must never happen mid-job. useQpdfJob reports starts and finishes.
 */
let running = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export function jobStarted(): void {
  running++;
  notify();
}

export function jobFinished(): void {
  running = Math.max(0, running - 1);
  notify();
}

export function isJobRunning(): boolean {
  return running > 0;
}

export function subscribeJobActivity(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
```

Note: the "extra finish" test relies on the clamp. A stray `jobFinished()` at idle must not leave the count at -1, which would make the next job look idle.

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run src/lib/update-check.test.ts src/lib/job-activity.test.ts`
Expected: 15 PASS (11 + 4).

- [ ] **Step 5: Report jobs from `useQpdfJob`**

In `src/lib/use-qpdf-job.ts`, add `import { jobFinished, jobStarted } from "@/lib/job-activity";` below the `crash-guard` import, call `jobStarted();` on the line after `markJobStarted();`, and `jobFinished();` on the line after `markJobFinished();`.

- [ ] **Step 6: Full check, commit, push**

```bash
npm run lint && npm test && npm run build
git add src/lib/update-check.ts src/lib/update-check.test.ts src/lib/job-activity.ts src/lib/job-activity.test.ts src/lib/use-qpdf-job.ts
git commit -m "feat: update checker and job-activity store for the update prompt"
git push
```

---

### Task 9: Update dialog and footer button

**Files:**
- Create: `src/components/ui/alert-dialog.tsx`, `src/lib/use-app-update.ts`, `src/components/UpdatePrompt.tsx`
- Modify: `src/components/AppShell.tsx`, `src/main.tsx`, `tsconfig.app.json`, `package.json`, `package-lock.json`

**Interfaces:**
- Consumes: Task 8's exports.
- Produces: `useAppUpdate(): { updateReady: boolean; promptOpen: boolean; jobRunning: boolean; later: () => void; updateNow: () => void }`; `UpdateDialog({ open, onLater, onUpdate })`; `UpdateFooterButton({ disabled, onUpdate })`. The DOM for Task 10: `role="alertdialog"` named "Update available", buttons "Later" / "Update now", and footer button "Update to the latest version".

No unit test is possible here: the hook imports a Vite virtual module, and Vitest runs without a DOM. Its logic lives in Task 8's tested functions, and Task 10's E2E tests cover the wiring. Verify with lint, build and the existing E2E suite.

- [ ] **Step 1: Dependencies and types**

```bash
npm install @radix-ui/react-alert-dialog@^1.1.24
```

In `tsconfig.app.json`, change `"types": ["vite/client", "vite-plugin-pwa/client"],` to `"types": ["vite/client", "vite-plugin-pwa/client", "vite-plugin-pwa/react"],`.

- [ ] **Step 2: shadcn AlertDialog**

Create `src/components/ui/alert-dialog.tsx`. This is the new-york v4 source with the import changed to `@radix-ui/react-alert-dialog`, keeping only the parts we use (no Trigger or Media, no `size` variants):

```tsx
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function AlertDialog({ ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

function AlertDialogOverlay({ className, ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay
      data-slot="alert-dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogContent({ className, ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return (
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal">
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        className={cn(
          "fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg",
          className,
        )}
        {...props}
      />
    </AlertDialogPrimitive.Portal>
  );
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn("grid gap-1.5 text-center sm:text-left", className)}
      {...props}
    />
  );
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

function AlertDialogTitle({ className, ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title data-slot="alert-dialog-title" className={cn("text-lg font-semibold", className)} {...props} />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function AlertDialogAction({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action> & Pick<React.ComponentProps<typeof Button>, "variant" | "size">) {
  return (
    <Button variant={variant} size={size} asChild>
      <AlertDialogPrimitive.Action data-slot="alert-dialog-action" className={cn(className)} {...props} />
    </Button>
  );
}

function AlertDialogCancel({
  className,
  variant = "outline",
  size = "default",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel> & Pick<React.ComponentProps<typeof Button>, "variant" | "size">) {
  return (
    <Button variant={variant} size={size} asChild>
      <AlertDialogPrimitive.Cancel data-slot="alert-dialog-cancel" className={cn(className)} {...props} />
    </Button>
  );
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
};
```

- [ ] **Step 3: The hook**

Create `src/lib/use-app-update.ts`:

```ts
import { useState, useSyncExternalStore } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

import { isJobRunning, subscribeJobActivity } from "@/lib/job-activity";
import { checkForUpdate, shouldShowUpdatePrompt, startUpdateChecks } from "@/lib/update-check";

/**
 * Registers the service worker, checks for a new deployment while online (see startUpdateChecks), and
 * tracks the update prompt. updateNow() activates the waiting worker and reloads, never during a job.
 */
export function useAppUpdate() {
  const {
    needRefresh: [updateReady],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;
      startUpdateChecks({ check: () => checkForUpdate(swUrl, registration), isOnline: () => navigator.onLine });
    },
  });
  const jobRunning = useSyncExternalStore(subscribeJobActivity, isJobRunning);
  const [dismissed, setDismissed] = useState(false);

  return {
    updateReady,
    promptOpen: shouldShowUpdatePrompt({ updateReady, dismissed, jobRunning }),
    jobRunning,
    later: () => setDismissed(true),
    updateNow: () => {
      if (!isJobRunning()) void updateServiceWorker(true);
    },
  };
}
```

- [ ] **Step 4: The dialog and the footer button**

Create `src/components/UpdatePrompt.tsx`:

```tsx
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/** Offers a downloaded new version. Later (or Esc) puts it off; the footer button stays available. */
export function UpdateDialog({ open, onLater, onUpdate }: { open: boolean; onLater: () => void; onUpdate: () => void }) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onLater();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Update available</AlertDialogTitle>
          <AlertDialogDescription>
            A new version of PDF Toolbox is ready. Updating reloads the page, so anything you've chosen here will need
            to be chosen again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Later</AlertDialogCancel>
          <AlertDialogAction onClick={onUpdate}>Update now</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Footer entry after the version once an update is ready; disabled while a job runs. */
export function UpdateFooterButton({ disabled, onUpdate }: { disabled: boolean; onUpdate: () => void }) {
  return (
    <>
      {" · "}
      <Button variant="link" size="sm" className="h-auto p-0 text-xs" disabled={disabled} onClick={onUpdate}>
        Update to the latest version
      </Button>
    </>
  );
}
```

- [ ] **Step 5: Mount in `AppShell`, stop registering in `main.tsx`**

In `src/components/AppShell.tsx`:

1. Add imports: `import { UpdateDialog, UpdateFooterButton } from "@/components/UpdatePrompt";` (after the `CrashNotice` import) and `import { useAppUpdate } from "@/lib/use-app-update";` (after the `use-theme` import).
2. Below `const { mode, toggle } = useTheme();` add `const update = useAppUpdate();`.
3. Replace the footer's second line, `{__APP_BUILD_LABEL__ ? \` · ${__APP_BUILD_LABEL__}\` : null}`, with:

```tsx
        {__APP_BUILD_LABEL__ ? ` · ${__APP_BUILD_LABEL__}` : null}
        {update.updateReady && !update.promptOpen ? (
          <UpdateFooterButton disabled={update.jobRunning} onUpdate={update.updateNow} />
        ) : null}
```

4. Directly after `</footer>`, add `<UpdateDialog open={update.promptOpen} onLater={update.later} onUpdate={update.updateNow} />`.

In `src/main.tsx`, delete `import { registerSW } from "virtual:pwa-register";` and `registerSW({ immediate: true });`. `useAppUpdate` registers the worker now.

- [ ] **Step 6: Full check including E2E**

Stop any server on port 4173 first (see the extra global constraints).

```bash
npm run lint && npm test && npm run build && grep -o 'qpdf[^"]*\.wasm' dist/sw.js && npm run test:e2e
```

Expected: all PASS. `offline.spec.ts` in particular proves the service worker still registers.

- [ ] **Step 7: Commit, push**

```bash
git add package.json package-lock.json tsconfig.app.json src/components/ui/alert-dialog.tsx src/lib/use-app-update.ts src/components/UpdatePrompt.tsx src/components/AppShell.tsx src/main.tsx
git commit -m "feat: update prompt dialog and footer button"
git push
```

---

### Task 10: E2E for the update prompt; docs

**Files:**
- Create: `e2e/preview-server.ts` (moved out of `e2e/offline.spec.ts`)
- Create: `e2e/update.spec.ts`
- Modify: `e2e/offline.spec.ts`, `AGENTS.md`, `CHANGELOG.md`, `docs/todo.md`

**Interfaces:**
- Consumes: Task 9's DOM; `chooseFiles`, `spaceOutProgress` from `e2e/helpers.ts`.
- Produces: `freePort()`, `startPreview(port, outDir?)`, `stopPreview(child, port)` in `e2e/preview-server.ts`.

- [ ] **Step 1: Share the preview-server helpers**

Create `e2e/preview-server.ts` from `e2e/offline.spec.ts`: move `freePort`, `running`, `killGroup`, the `process.once("exit", …)` backstop, `startPreview` and `stopPreview` there, exported. Change `startPreview` to take an optional output directory:

```ts
export async function startPreview(port: number, outDir?: string): Promise<ChildProcess> {
  const child = spawn(
    "npx",
    ["vite", "preview", "--port", String(port), "--strictPort", ...(outDir ? ["--outDir", outDir] : [])],
    { stdio: "ignore", detached: true },
  );
```

(The rest of its body is unchanged.) In `e2e/offline.spec.ts`, delete the moved code and the now-unused `node:child_process` and `node:net` imports, and add `import { freePort, startPreview, stopPreview } from "./preview-server";`.

Run: `npm run test:e2e -- e2e/offline.spec.ts`
Expected: PASS in Chromium and WebKit (a pure move).

- [ ] **Step 2: Write the update E2E tests**

Create `e2e/update.spec.ts`:

```ts
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

import { chooseFiles, spaceOutProgress } from "./helpers";
import { freePort, startPreview, stopPreview } from "./preview-server";

// Needs the real service worker, like offline.spec.ts.
test.use({ serviceWorkers: "allow" });

/** A copy of dist/ on its own port, so a test can "deploy" a new version into it. */
async function servedCopy() {
  const dir = await mkdtemp(join(tmpdir(), "pdf-mss-io-update-"));
  await cp("dist", dir, { recursive: true });
  const port = await freePort();
  const server = await startPreview(port, dir);
  return {
    dir,
    origin: `http://localhost:${port}`,
    async stop() {
      await stopPreview(server, port);
      await rm(dir, { recursive: true, force: true });
    },
  };
}

/** A deploy: index.html changes (it gains a marker), and sw.js's precache list says so. */
async function deployNewVersion(dir: string) {
  const index = join(dir, "index.html");
  await writeFile(index, (await readFile(index, "utf8")).replace("</head>", '<meta name="e2e-deploy" content="2"></head>'));
  const sw = join(dir, "sw.js");
  const source = await readFile(sw, "utf8");
  const updated = source.replace(/(url:"index\.html",revision:")[^"]*"/, '$1e2e-deploy-2"');
  expect(updated, "sw.js precache entry for index.html not found").not.toBe(source);
  await writeFile(sw, updated);
}

/** Opens the app and waits until its service worker controls the page. */
async function openInstalled(page: Page, url: string) {
  await page.goto(url);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

const comeBackOnline = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event("online")));
const runsNewVersion = (page: Page) => page.locator('meta[name="e2e-deploy"]').count();

test("a new deployment is offered; Later moves it to the footer, which updates", async ({ page }) => {
  const site = await servedCopy();
  try {
    await openInstalled(page, `${site.origin}/`);
    await deployNewVersion(site.dir);
    await comeBackOnline(page);

    const dialog = page.getByRole("alertdialog", { name: "Update available" });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole("button", { name: "Later" }).click();
    await expect(dialog).toBeHidden();
    expect(await runsNewVersion(page)).toBe(0);

    await page.getByRole("button", { name: "Update to the latest version" }).click();
    await expect.poll(() => runsNewVersion(page), { timeout: 15_000 }).toBe(1);
    await expect(page.getByRole("button", { name: "Update to the latest version" })).toHaveCount(0);
  } finally {
    await site.stop();
  }
});

test("an update that arrives during a job waits until the job is done", async ({ page }) => {
  const site = await servedCopy();
  try {
    await spaceOutProgress(page, { gapMs: 80 }); // the Compress below takes ~8 s
    await openInstalled(page, `${site.origin}/compress`);
    await chooseFiles(page, "twenty-mb.pdf");
    await page.getByRole("button", { name: "Compress", exact: true }).click();
    await expect(page.getByRole("progressbar")).toBeVisible();

    await deployNewVersion(site.dir);
    await comeBackOnline(page);
    // Ready, but held back: no dialog, and the footer button can't be used yet.
    await expect(page.getByRole("button", { name: "Update to the latest version" })).toBeDisabled({ timeout: 15_000 });
    await expect(page.getByRole("alertdialog")).toHaveCount(0);

    await expect(page.getByText("Your PDF is smaller")).toBeVisible({ timeout: 30_000 });
    const dialog = page.getByRole("alertdialog", { name: "Update available" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Update now" }).click();
    await expect.poll(() => runsNewVersion(page), { timeout: 15_000 }).toBe(1);
  } finally {
    await site.stop();
  }
});
```

- [ ] **Step 3: Run them**

Run: `npm run test:e2e -- e2e/update.spec.ts`
Expected: both PASS. (They are written after Task 9 because they test its DOM, so there's no red phase against missing code. To prove they can fail, temporarily change `shouldShowUpdatePrompt` to return `updateReady && !dismissed`. Test 2 must then FAIL at `toHaveCount(0)`. Revert.)

- [ ] **Step 4: Docs**

1. `AGENTS.md`, "PWA notes": replace the first bullet (from `- \`vite-plugin-pwa\` (\`vite.config.ts\`) uses \`registerType: 'prompt'\` with no prompt UI` through `open pages are never reloaded.`) with:

```markdown
- `vite-plugin-pwa` (`vite.config.ts`) uses `registerType: 'prompt'`. `useAppUpdate` (`src/lib/use-app-update.ts`,
  mounted by `AppShell`) registers the worker and checks for a new deployment while online: hourly, on `online`, and
  on returning to the foreground at most once a minute (`src/lib/update-check.ts`). A downloaded update shows the
  "Update available" dialog; Later moves it to a footer button. Nothing reloads while a job runs
  (`src/lib/job-activity.ts`). Closing every tab and reopening still picks up a new version.
- Hosting: `sw.js` and `index.html` must not be long-cached by a CDN (`Cache-Control: no-cache` or a short edge
  cache), or the update check sees a stale version. Hashed `assets/` files can be cached forever.
```

   Also add to the Map, after the `src/lib/job-progress.ts` line:

```
src/lib/update-check.ts   when to check for a new deployment; whether to show the update dialog
src/lib/job-activity.ts   is any job running (the update prompt never reloads mid-job)
src/lib/use-app-update.ts registers the service worker; update prompt state
src/components/UpdatePrompt.tsx  "Update available" dialog + footer button
```

   and in "E2E tests", after the `offline.spec.ts` bullet: `- \`update.spec.ts\` serves a copy of \`dist/\` (shared helpers in \`e2e/preview-server.ts\`), "deploys" a new version by rewriting its \`sw.js\` and \`index.html\`, and fires \`online\`.`

2. `CHANGELOG.md`, under `## [1.1.0]` → `### Added`, add a bullet:

```markdown
- While online, the app checks for a newer version and offers to update ("Update available"); "Later"
  keeps an update button in the footer. It never reloads while a file is being processed.
```

3. `docs/todo.md`: add an automated-check row after the "Info shows no progress bar" row:

```markdown
| Update prompt: a new deployment shows "Update available"; Later moves it to the footer button, which updates; an update during a job waits until the job is done | `e2e/update.spec.ts` |
```

   and an owner box at the end of "Owner checks for 1.1.0":

```markdown
- [ ] Update prompt on the iPhone: with the app installed from a test build, serve a newer test build. Within a minute of returning to the app, "Update available" shows; Later puts "Update to the latest version" in the footer; updating shows the new build code in the footer.
```

- [ ] **Step 5: Full check, commit, push**

```bash
npm run lint && npm test && npm run build && npm run test:e2e
git add e2e/preview-server.ts e2e/update.spec.ts e2e/offline.spec.ts AGENTS.md CHANGELOG.md docs/todo.md
git commit -m "test: update prompt E2E; docs for the update prompt"
git push
```
