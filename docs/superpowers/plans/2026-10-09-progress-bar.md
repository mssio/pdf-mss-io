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

---

## Offline readiness status (Tasks 11–12) and large-file reload (Task 13), added 2026-10-09

Spec sections 8 and 9 are the authority. Run Tasks 8–13 in order. Task 12 also changes the footer's exact text, which `e2e/shell.spec.ts` asserts.

**Extra global constraints for Tasks 11–13:**
- Footer order: `Version 1.1.0` · build label (test builds) · update button (when ready) · offline status link.
- Footer link texts exactly: `Ready offline`, `Downloading for offline use… 40%` (or without the percent), `Not available offline yet`, `Offline use not available`.
- `/offline` help texts exactly as in spec section 8, plus for `ready`: `PDF Toolbox works without a connection on this device.`
- `RELEASE_ENGINE_AFTER_BYTES = 50 * 1024 * 1024`; crash-guard hold after building a download: 2000 ms.

**Review focus (Tasks 11–13):**
1. With service workers blocked or unsupported (plain HTTP), the footer must still render and never throw. It shows "Not available offline yet" or "Offline use not available". Pinned by `offlineState` unit tests and every E2E spec.
2. A stale job finishing must not `resetQpdf()` under a newer job. Only the current job releases the engine. Covered by the condition `isCurrent() && shouldReleaseEngine(sizeBytes)` and E2E "Compress twice".
3. An update downloading in the background must not flip a ready app to "Downloading". Pinned by the `offlineState` unit test "an active worker with an update installing is still ready".
4. The crash note must be cleared even if building the Blob throws. Pinned by a unit test.

---

### Task 11: `clientsClaim` and the pure offline-status module

**Files:**
- Modify: `vite.config.ts` (Workbox options)
- Create: `src/lib/offline-status.ts`, `src/lib/offline-status.test.ts`

**Interfaces:**
- Produces:
  - `type OfflineState = { kind: "ready" } | { kind: "downloading"; done: number; total: number | null } | { kind: "not-ready" } | { kind: "unsupported" }`
  - `parsePrecacheList(source: string): string[] | null`
  - `cachedPath(url: string): string`
  - `offlineState(input: { supported: boolean; controlled: boolean; installing: boolean; active: boolean; expected: string[] | null; cached: string[] }): OfflineState`
  - `offlinePercent(state: OfflineState): number | null`
  - `offlineLabel(state: OfflineState): string`
  - `isEngineFile(path: string): boolean`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/offline-status.test.ts`:

```ts
import { describe, expect, test } from "vitest";

import {
  cachedPath,
  isEngineFile,
  offlineLabel,
  offlinePercent,
  offlineState,
  parsePrecacheList,
} from "@/lib/offline-status";

describe("parsePrecacheList", () => {
  test("reads the generated (minified) precache list", () => {
    const source =
      'e.precacheAndRoute([{url:"assets/index-abc.js",revision:null},{url:"index.html",revision:"80b2"},{url:"assets/qpdf-x.wasm",revision:null}],{})';
    expect(parsePrecacheList(source)).toEqual(["assets/index-abc.js", "index.html", "assets/qpdf-x.wasm"]);
  });

  test("also reads quoted keys", () => {
    expect(parsePrecacheList('[{"url":"index.html","revision":"1"}]')).toEqual(["index.html"]);
  });

  test("no list → null", () => {
    expect(parsePrecacheList("self.addEventListener('fetch', () => {})")).toBeNull();
  });
});

test("cachedPath strips the origin and Workbox's revision parameter", () => {
  expect(cachedPath("https://pdf.example/index.html?__WB_REVISION__=80b2")).toBe("index.html");
  expect(cachedPath("https://pdf.example/assets/index-abc.js")).toBe("assets/index-abc.js");
});

test("isEngineFile finds the qpdf wasm", () => {
  expect(isEngineFile("assets/qpdf-DoMQ-ZAf.wasm")).toBe(true);
  expect(isEngineFile("assets/index-abc.js")).toBe(false);
});

describe("offlineState", () => {
  const expected = ["index.html", "assets/a.js", "assets/qpdf-x.wasm"];
  const base = { supported: true, controlled: false, installing: false, active: false, expected, cached: [] as string[] };

  test("no service worker here → unsupported", () => {
    expect(offlineState({ ...base, supported: false })).toEqual({ kind: "unsupported" });
  });

  test("nothing installed → not ready", () => {
    expect(offlineState(base)).toEqual({ kind: "not-ready" });
  });

  test("first install running → downloading, counted against the list", () => {
    expect(offlineState({ ...base, installing: true, cached: ["index.html", "assets/a.js"] })).toEqual({
      kind: "downloading",
      done: 2,
      total: 3,
    });
  });

  test("first install running without a list → downloading with unknown total", () => {
    expect(offlineState({ ...base, installing: true, expected: null, cached: ["index.html"] })).toEqual({
      kind: "downloading",
      done: 1,
      total: null,
    });
  });

  test("active and in control → ready", () => {
    expect(offlineState({ ...base, active: true, controlled: true })).toEqual({ kind: "ready" });
  });

  test("active, not yet in control, but every file cached → ready", () => {
    expect(offlineState({ ...base, active: true, cached: expected })).toEqual({ kind: "ready" });
  });

  test("active, not in control, files missing → still downloading", () => {
    expect(offlineState({ ...base, active: true, cached: ["index.html"] })).toEqual({
      kind: "downloading",
      done: 1,
      total: 3,
    });
  });

  test("an active worker with an update installing is still ready", () => {
    expect(offlineState({ ...base, active: true, controlled: true, installing: true })).toEqual({ kind: "ready" });
  });
});

describe("offlineLabel and offlinePercent", () => {
  test("labels", () => {
    expect(offlineLabel({ kind: "ready" })).toBe("Ready offline");
    expect(offlineLabel({ kind: "downloading", done: 12, total: 30 })).toBe("Downloading for offline use… 40%");
    expect(offlineLabel({ kind: "downloading", done: 12, total: null })).toBe("Downloading for offline use…");
    expect(offlineLabel({ kind: "not-ready" })).toBe("Not available offline yet");
    expect(offlineLabel({ kind: "unsupported" })).toBe("Offline use not available");
  });

  test("a download never shows 100% until it is ready", () => {
    expect(offlinePercent({ kind: "downloading", done: 30, total: 30 })).toBe(99);
    expect(offlinePercent({ kind: "downloading", done: 0, total: 30 })).toBe(0);
    expect(offlinePercent({ kind: "ready" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/offline-status.test.ts`
Expected: FAIL with "Failed to resolve import".

- [ ] **Step 3: Implement**

Create `src/lib/offline-status.ts`:

```ts
/** Whether this device can use PDF Toolbox offline (spec section 8). */
export type OfflineState =
  | { kind: "ready" }
  | { kind: "downloading"; done: number; total: number | null }
  | { kind: "not-ready" }
  | { kind: "unsupported" };

const ENTRY = /\{\s*"?url"?\s*:\s*"([^"]+)"\s*,\s*"?revision"?\s*:\s*(?:"[^"]*"|null)\s*\}/g;

/** The files the build precaches, from the generated sw.js; null if the list can't be found. */
export function parsePrecacheList(source: string): string[] | null {
  const paths = [...source.matchAll(ENTRY)].map((match) => match[1]);
  return paths.length > 0 ? paths : null;
}

/** A precache cache key ("https://host/index.html?__WB_REVISION__=…") as a precache-list path. */
export function cachedPath(url: string): string {
  return new URL(url).pathname.replace(/^\//, "");
}

export function isEngineFile(path: string): boolean {
  return /qpdf-[^/]*\.wasm$/.test(path);
}

export function offlineState({
  supported,
  controlled,
  installing,
  active,
  expected,
  cached,
}: {
  supported: boolean;
  controlled: boolean;
  installing: boolean;
  active: boolean;
  expected: string[] | null;
  cached: string[];
}): OfflineState {
  if (!supported) return { kind: "unsupported" };
  const have = new Set(cached);
  const done = expected ? expected.filter((path) => have.has(path)).length : have.size;
  const complete = expected !== null && done === expected.length;
  if (active && (controlled || complete)) return { kind: "ready" };
  if (installing || active) return { kind: "downloading", done, total: expected?.length ?? null };
  return { kind: "not-ready" };
}

/** Download percent, capped at 99 until the worker is active and the state is ready. */
export function offlinePercent(state: OfflineState): number | null {
  if (state.kind !== "downloading" || !state.total) return null;
  return Math.min(99, Math.floor((state.done / state.total) * 100));
}

export function offlineLabel(state: OfflineState): string {
  switch (state.kind) {
    case "ready":
      return "Ready offline";
    case "downloading": {
      const percent = offlinePercent(state);
      return percent === null ? "Downloading for offline use…" : `Downloading for offline use… ${percent}%`;
    }
    case "not-ready":
      return "Not available offline yet";
    case "unsupported":
      return "Offline use not available";
  }
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run src/lib/offline-status.test.ts`
Expected: 15 PASS.

- [ ] **Step 5: `clientsClaim`**

In `vite.config.ts`, inside `workbox: { … }`, after `navigateFallback: '/index.html',` add:

```ts
        // The first install takes over the open page as soon as it finishes, so the first visit works
        // offline without a relaunch. Updates still wait for "Update now" (registerType 'prompt').
        clientsClaim: true,
```

Run: `npm run build && grep -c "clientsClaim" dist/sw.js`
Expected: `1` or more.

- [ ] **Step 6: Full check, commit, push**

```bash
npm run lint && npm test && npm run build
git add vite.config.ts src/lib/offline-status.ts src/lib/offline-status.test.ts
git commit -m "feat: offline-status logic; first install takes control (clientsClaim)"
git push
```

---

### Task 12: Footer status link, `/offline` page, E2E, docs

**Files:**
- Create: `src/lib/use-offline-status.ts`, `src/components/OfflineStatusLink.tsx`, `src/pages/OfflinePage.tsx`
- Modify: `src/router.ts`, `src/components/AppShell.tsx`, `e2e/shell.spec.ts`, `e2e/offline.spec.ts`, `AGENTS.md`, `CHANGELOG.md`, `docs/todo.md`

**Interfaces:**
- Consumes: Task 11's exports.
- Produces: `useOfflineStatus(): OfflineSnapshot | null` with `type OfflineSnapshot = { state: OfflineState; expected: string[] | null; cached: string[] }`; the route `/offline` with an `h1` whose text is `offlineLabel(state)`.

- [ ] **Step 1: Update the E2E expectations first (failing)**

`e2e/shell.spec.ts`: in "header, footer and home grid", change the footer expectation to:

```ts
  await expect(page.locator("footer")).toHaveText(
    `PDFs are processed locally in your browser. Nothing is uploaded. · Version ${version} · Not available offline yet`,
  );
  await expect(page.locator("footer").getByRole("link", { name: "Not available offline yet" })).toHaveAttribute(
    "href",
    "/offline",
  );
```

`e2e/offline.spec.ts`, in "after the first visit the app works with the server gone": after `await page.reload(); // the active worker now controls the page`, add:

```ts
    await expect(page.locator("footer").getByRole("link", { name: "Ready offline" })).toBeVisible();
```

and after `expect(await decryptProtected(page)).toBe("protected-d.pdf");` add:

```ts
  await page.goto(`${origin}/offline`);
  await expect(page.getByRole("heading", { name: "Ready offline" })).toBeVisible();
  await expect(page.getByText("PDF engine: downloaded")).toBeVisible();
```

Run: `npm run test:e2e -- e2e/shell.spec.ts e2e/offline.spec.ts`
Expected: the footer test and the offline test FAIL (no status link yet).

- [ ] **Step 2: The hook**

Create `src/lib/use-offline-status.ts`:

```ts
import { useEffect, useState } from "react";

import { cachedPath, type OfflineState, offlineState, parsePrecacheList } from "@/lib/offline-status";

export type OfflineSnapshot = { state: OfflineState; expected: string[] | null; cached: string[] };

/** Every path in Workbox's precache caches. */
async function cachedPaths(): Promise<string[]> {
  const paths: string[] = [];
  for (const name of await caches.keys()) {
    if (!name.startsWith("workbox-precache")) continue;
    for (const request of await (await caches.open(name)).keys()) paths.push(cachedPath(request.url));
  }
  return paths;
}

async function readSnapshot(known: string[] | null): Promise<OfflineSnapshot> {
  const supported = window.isSecureContext && "serviceWorker" in navigator && "caches" in window;
  if (!supported) return { state: { kind: "unsupported" }, expected: known, cached: [] };
  const registration = await navigator.serviceWorker.getRegistration();
  const cached = await cachedPaths();
  let expected = known;
  if (!expected && navigator.onLine) {
    const response = await fetch("/sw.js", { cache: "no-store" }).catch(() => null);
    if (response?.ok) expected = parsePrecacheList(await response.text());
  }
  const state = offlineState({
    supported,
    controlled: navigator.serviceWorker.controller !== null,
    installing: Boolean(registration?.installing),
    active: Boolean(registration?.active),
    expected,
    cached,
  });
  return { state, expected, cached };
}

/**
 * Whether this device can use the app offline (spec section 8). Re-reads once a second while
 * downloading or not ready, and on controllerchange / online / offline. null until the first read.
 */
export function useOfflineStatus(): OfflineSnapshot | null {
  const [snapshot, setSnapshot] = useState<OfflineSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    let reading = false;
    let expected: string[] | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      if (reading) return;
      reading = true;
      clearTimeout(timer);
      try {
        const next = await readSnapshot(expected).catch(() => null);
        if (cancelled || !next) return;
        expected = next.expected;
        setSnapshot(next);
        if (next.state.kind === "downloading" || next.state.kind === "not-ready") timer = setTimeout(refresh, 1000);
      } finally {
        reading = false;
      }
    };
    const onChange = () => void refresh();
    void refresh();
    navigator.serviceWorker?.addEventListener("controllerchange", onChange);
    window.addEventListener("online", onChange);
    window.addEventListener("offline", onChange);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      navigator.serviceWorker?.removeEventListener("controllerchange", onChange);
      window.removeEventListener("online", onChange);
      window.removeEventListener("offline", onChange);
    };
  }, []);

  return snapshot;
}
```

- [ ] **Step 3: Footer link and page**

Create `src/components/OfflineStatusLink.tsx`:

```tsx
import { Link } from "react-router";

import { offlineLabel } from "@/lib/offline-status";
import { useOfflineStatus } from "@/lib/use-offline-status";

/** Footer entry: whether the app works offline here; opens /offline for details. */
export function OfflineStatusLink() {
  const snapshot = useOfflineStatus();
  if (!snapshot) return null;
  return (
    <>
      {" · "}
      <Link to="/offline" className="underline-offset-4 hover:underline">
        {offlineLabel(snapshot.state)}
      </Link>
    </>
  );
}
```

Create `src/pages/OfflinePage.tsx`:

```tsx
import { Check, Clock } from "lucide-react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { isEngineFile, offlineLabel, offlinePercent, type OfflineState } from "@/lib/offline-status";
import { useOfflineStatus } from "@/lib/use-offline-status";

const HELP: Record<OfflineState["kind"], string> = {
  ready: "PDF Toolbox works without a connection on this device.",
  downloading: "Keep PDF Toolbox open until this says Ready offline. After that it works without a connection.",
  "not-ready": "Open PDF Toolbox once while online and keep it open until this says Ready offline.",
  unsupported: "This address can't keep files for offline use. Open PDF Toolbox from its https:// address.",
};

/** /offline: whether this device can use the app offline, and the download's progress. */
export function Component() {
  const snapshot = useOfflineStatus();
  if (!snapshot) return null;
  const { state, expected, cached } = snapshot;
  const have = new Set(cached);
  const engine = expected?.find(isEngineFile);
  const percent = offlinePercent(state);

  return (
    <div className="mx-auto max-w-lg px-4 py-10 sm:px-6 sm:py-14">
      <Card>
        <CardHeader>
          <h1 className="text-lg font-semibold">{offlineLabel(state)}</h1>
          <CardDescription>{HELP[state.kind]}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {state.kind === "downloading" && percent !== null ? (
            <Progress value={percent} aria-label="Downloading for offline use" />
          ) : null}
          {engine && state.kind !== "unsupported" ? (
            <p className="text-sm">PDF engine: {have.has(engine) ? "downloaded" : "waiting"}</p>
          ) : null}
          {expected && state.kind !== "unsupported" ? (
            <ul className="grid gap-1 text-xs text-muted-foreground">
              {expected.map((path) => (
                <li key={path} className="flex items-center gap-2 break-all">
                  {have.has(path) ? <Check className="size-3.5 shrink-0" /> : <Clock className="size-3.5 shrink-0" />}
                  {path}
                </li>
              ))}
            </ul>
          ) : null}
          <Button className="w-full sm:w-auto" asChild>
            <Link to="/">Back to home</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

In `src/router.ts`, add the route before the catch-all:

```ts
          { path: "/offline", lazy: () => import("@/pages/OfflinePage") },
          { path: "*", Component: NotFoundPage },
```

In `src/components/AppShell.tsx`, import `OfflineStatusLink` from `@/components/OfflineStatusLink`, and render `<OfflineStatusLink />` as the last child of `<footer>`, after the update button from Task 9.

- [ ] **Step 4: Run the E2E specs**

Stop any server on port 4173 first.

Run: `npm run test:e2e -- e2e/shell.spec.ts e2e/offline.spec.ts`
Expected: PASS in Chromium (both) and WebKit (offline).

- [ ] **Step 5: Docs**

1. `AGENTS.md`, Map: add

```
src/lib/offline-status.ts pure: offline state from the SW lifecycle + precache contents (parses sw.js's list)
src/lib/use-offline-status.ts  reads the registration and caches; polls while downloading
src/components/OfflineStatusLink.tsx  footer "Ready offline" / "Downloading…" link → /offline
src/pages/OfflinePage.tsx /offline: download progress, file list
```

   and in "PWA notes" add: `- \`clientsClaim: true\`: the first install controls the open page as soon as it finishes. The footer shows the offline state (\`src/lib/offline-status.ts\`); \`/offline\` shows the download. The state parses the precache list from \`sw.js\` (\`{url:"…",revision:…}\`); if the plugin changes that format, \`offline-status.test.ts\` and \`e2e/update.spec.ts\` must be updated.`

2. `CHANGELOG.md`, 1.1.0 → Added: `- The footer shows whether the app is ready to use offline; while it is still downloading, "/offline" shows the progress. The first visit works offline as soon as the download finishes.`

3. `docs/todo.md`: automated row `| Footer shows "Ready offline" once installed and "/offline" shows it while offline; with no service worker it says "Not available offline yet" | \`e2e/offline.spec.ts\`, \`e2e/shell.spec.ts\` |`, and owner box `- [ ] Fresh install on the iPhone (site data cleared): the footer goes "Downloading for offline use… n%" → "Ready offline"; then offline, every tool opens and Decrypt works.`

- [ ] **Step 6: Full check, commit, push**

```bash
npm run lint && npm test && npm run build && npm run test:e2e
git add src/lib/use-offline-status.ts src/components/OfflineStatusLink.tsx src/pages/OfflinePage.tsx src/router.ts src/components/AppShell.tsx e2e/shell.spec.ts e2e/offline.spec.ts AGENTS.md CHANGELOG.md docs/todo.md
git commit -m "feat: footer offline status and /offline download page"
git push
```

---

### Task 13: Large-file reload: crash notice covers the download, engine memory released

**Files:**
- Modify: `src/lib/crash-guard.ts`, `src/lib/crash-guard.test.ts`
- Modify: `src/lib/use-blob-url.ts`
- Modify: `src/lib/qpdf.ts` (next to `STALL_TIMEOUT_MS`), `src/lib/qpdf.test.ts` (create if missing)
- Modify: `src/lib/use-qpdf-job.ts`
- Modify: `e2e/global-setup.ts`, `e2e/job-safeguard.spec.ts`, `CHANGELOG.md`, `docs/todo.md`

**Interfaces:**
- Produces:
  - `guardDownload<T>(build: () => T, options?: { storage?: Storage; holdMs?: number }): T` in crash-guard
  - `RELEASE_ENGINE_AFTER_BYTES`, `shouldReleaseEngine(sizeBytes: number): boolean` in qpdf.ts
  - fixture `sixty-mb-real.pdf` (1200 pages, ~60 MB, valid)

- [ ] **Step 1: Write the failing unit tests**

Append to `src/lib/crash-guard.test.ts` (it already has `memoryStorage()`). Add `vi` and `afterEach`/`beforeEach` to the vitest import, and `guardDownload` to the crash-guard import:

```ts
describe("guardDownload", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("arms the crash note while the download is built and for 2 s after", () => {
    const storage = memoryStorage();
    let armedDuringBuild = false;
    const url = guardDownload(
      () => {
        armedDuringBuild = hadCrashedJob(storage);
        return "blob:x";
      },
      { storage },
    );
    expect(url).toBe("blob:x");
    expect(armedDuringBuild).toBe(true);
    expect(hadCrashedJob(storage)).toBe(true);
    vi.advanceTimersByTime(1999);
    expect(hadCrashedJob(storage)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(hadCrashedJob(storage)).toBe(false);
  });

  test("a build that throws still clears the note", () => {
    const storage = memoryStorage();
    expect(() =>
      guardDownload(
        () => {
          throw new RangeError("out of memory");
        },
        { storage },
      ),
    ).toThrow(RangeError);
    vi.advanceTimersByTime(2000);
    expect(hadCrashedJob(storage)).toBe(false);
  });
});
```

If `src/lib/qpdf.test.ts` exists, append to it; otherwise create it with `import { describe, expect, test } from "vitest";`. Then add:

```ts
import { RELEASE_ENGINE_AFTER_BYTES, shouldReleaseEngine } from "@/lib/qpdf";

describe("shouldReleaseEngine", () => {
  test("only after jobs over 50 MB", () => {
    expect(RELEASE_ENGINE_AFTER_BYTES).toBe(50 * 1024 * 1024);
    expect(shouldReleaseEngine(RELEASE_ENGINE_AFTER_BYTES)).toBe(false);
    expect(shouldReleaseEngine(RELEASE_ENGINE_AFTER_BYTES + 1)).toBe(true);
    expect(shouldReleaseEngine(1024)).toBe(false);
  });
});
```

Run: `npx vitest run src/lib/crash-guard.test.ts src/lib/qpdf.test.ts`
Expected: FAIL (`guardDownload` / `shouldReleaseEngine` not exported).

- [ ] **Step 2: Implement**

Append to `src/lib/crash-guard.ts`:

```ts
/**
 * Building a download copies the whole output once more, which is when a phone is most likely to run
 * out of memory, after the job itself has finished. Keeps the crash note for `holdMs` after `build`
 * returns (or throws), so a reload in that window is explained too.
 */
export function guardDownload<T>(
  build: () => T,
  { storage = defaultStorage(), holdMs = 2000 }: { storage?: Storage; holdMs?: number } = {},
): T {
  markJobStarted(storage);
  try {
    return build();
  } finally {
    setTimeout(() => markJobFinished(storage), holdMs);
  }
}
```

In `src/lib/use-blob-url.ts`, add `import { guardDownload } from "@/lib/crash-guard";` and change `show` to:

```ts
  const show = useCallback((bytes: Uint8Array<ArrayBuffer>, filename: string) => {
    const url = guardDownload(() => URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })));
    setDownload({ url, filename });
  }, []);
```

In `src/lib/qpdf.ts`, below `STALL_TIMEOUT_MS`:

```ts
/**
 * After a job over this size, the engine's worker is replaced (resetQpdf) before the page builds the
 * download, so the finished job's memory is freed at once instead of whenever the browser collects it.
 */
export const RELEASE_ENGINE_AFTER_BYTES = 50 * 1024 * 1024;

export function shouldReleaseEngine(sizeBytes: number): boolean {
  return sizeBytes > RELEASE_ENGINE_AFTER_BYTES;
}
```

In `src/lib/use-qpdf-job.ts`, add `shouldReleaseEngine` to the `@/lib/qpdf` import, and directly after the `runWithTimeLimits({ … })` call resolves (before `if (!isCurrent()) return null;`) add:

```ts
        // Free the finished job's memory before the page copies the output into a download.
        // Only the shown job does this: a stale one must not reset the engine under a newer job.
        if (isCurrent() && shouldReleaseEngine(sizeBytes)) resetQpdf();
```

Run: `npx vitest run src/lib/crash-guard.test.ts src/lib/qpdf.test.ts`
Expected: PASS.

- [ ] **Step 3: E2E: a second large job still works**

In `e2e/global-setup.ts`, after the `twenty-mb.pdf` line:

```ts
    // Real and ~60 MB: above RELEASE_ENGINE_AFTER_BYTES, so the engine is replaced after each job.
    await writeFile(fixture("sixty-mb-real.pdf"), makePdf(1200, { fillerBytes: 50_000 }));
```

Append to `e2e/job-safeguard.spec.ts`:

```ts
test("after a job over 50 MB the engine is replaced, and the next job works", async ({ page }) => {
  await page.goto("/compress");
  for (let run = 0; run < 2; run++) {
    await chooseFiles(page, "sixty-mb-real.pdf");
    await page.getByRole("button", { name: "Compress", exact: true }).click();
    await expect(page.getByText("Your PDF is smaller")).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "Compress another file" }).click();
  }
});
```

Run: `npm run test:e2e -- e2e/job-safeguard.spec.ts`
Expected: PASS.

- [ ] **Step 4: Docs and the owner re-test**

`CHANGELOG.md`, 1.1.0 → Changed: `- Big files on phones: the engine's memory is freed before the download is built, and a reload while building it now shows the "page reloaded" notice.`

`docs/todo.md`, owner box: `- [ ] iPhone, 245 MB PDF, offline and online: Encrypt, Compress and Decrypt each finish with a download. If any reloads (now with the "page reloaded" notice), note the largest size that worked; PHONE_MAX_BYTES is lowered to it before release.`

- [ ] **Step 5: Full check, commit, push**

```bash
npm run lint && npm test && npm run build && npm run test:e2e
git add src/lib/crash-guard.ts src/lib/crash-guard.test.ts src/lib/use-blob-url.ts src/lib/qpdf.ts src/lib/qpdf.test.ts src/lib/use-qpdf-job.ts e2e/global-setup.ts e2e/job-safeguard.spec.ts CHANGELOG.md docs/todo.md
git commit -m "fix: free engine memory before building big downloads; crash notice covers the download step"
git push
```

---

## Install banner (Task 14), added 2026-10-09

Spec section 10 is the authority. Phones only. **Prerequisite:** the five full-iPhone screenshots (spec §10 "Screenshots") are processed and committed to `public/install/` before Step 5. The owner retakes them into `.private/`; the edits (clean status bar, `pdf.mss.io`, blurred contacts/apps/dock) are done with ImageMagick and checked by eye. The originals are deleted from `.private/` afterwards.

**Extra global constraints:**
- Strings, exactly:
  - Android banner: `Install PDF Toolbox` / `to open it like an app and use it offline.` / buttons `Install`, `Not now`.
  - iOS banner: `Add PDF Toolbox to your Home Screen` / `to open it like an app and use it offline.` / buttons `How`, `Not now`.
  - The `/install` page texts are as in spec §10.
- `INSTALL_DISMISS_MS = 30 * 24 * 60 * 60 * 1000`; storage key `pdf-mss-io-install-dismissed`.
- Never on desktop. Never in the installed app. Never during a job or over a result.

**Review focus:**
1. Desktop Chrome fires `beforeinstallprompt` too: it must not show a banner (pinned by E2E "desktop").
2. A `beforeinstallprompt` fired before React mounts must not be lost (module-level capture).
3. Storage that throws (private mode) must not break the page (unit test).
4. iOS Chrome/Firefox/Edge must not get Safari-specific steps (unit test).

### Task 14: Install banner and `/install` page

**Files:**
- Modify: `src/lib/limits.ts` (export `hasSmallTouchScreen`), `vite.config.ts` (add `webp` to `globPatterns`)
- Create: `src/lib/install-banner.ts`, `src/lib/install-banner.test.ts`, `src/lib/use-install-banner.ts`, `src/components/InstallBanner.tsx`, `src/pages/InstallPage.tsx`, `e2e/install.spec.ts`
- Modify: `src/router.ts`, `src/components/AppShell.tsx`, `e2e/offline.spec.ts`, `AGENTS.md`, `CHANGELOG.md`, `docs/todo.md`

**Interfaces:**
- Consumes: `isJobRunning`, `hasUnsavedResult`, `subscribeJobActivity` (job-activity); `Card`, `Button`.
- Produces:
  - `hasSmallTouchScreen(): boolean`
  - `isIosSafari(userAgent: string, maxTouchPoints: number): boolean`
  - `installBannerKind(input): "android" | "ios" | null`
  - `readDismissedAt(storage?: Storage): number | null`, `saveDismissedAt(now: number, storage?: Storage): void`
  - `useInstallBanner(): { kind: "android" | "ios" | null; install: () => void; dismiss: () => void }`

- [ ] **Step 1: Write the failing unit tests**

Create `src/lib/install-banner.test.ts`:

```ts
import { describe, expect, test } from "vitest";

import { INSTALL_DISMISS_MS, installBannerKind, isIosSafari, readDismissedAt, saveDismissedAt } from "@/lib/install-banner";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME = IPHONE_SAFARI.replace("Version/26.0", "CriOS/141.0.0.0");
const IPHONE_FIREFOX = IPHONE_SAFARI.replace("Version/26.0", "FxiOS/143.0");
const IPHONE_EDGE = IPHONE_SAFARI.replace("Version/26.0", "EdgiOS/141.0");
const MAC_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";

describe("isIosSafari", () => {
  test("iPhone Safari yes; other iOS browsers no", () => {
    expect(isIosSafari(IPHONE_SAFARI, 5)).toBe(true);
    expect(isIosSafari(IPHONE_CHROME, 5)).toBe(false);
    expect(isIosSafari(IPHONE_FIREFOX, 5)).toBe(false);
    expect(isIosSafari(IPHONE_EDGE, 5)).toBe(false);
  });

  test("an iPad reports a Mac user agent but has touch; a real Mac doesn't", () => {
    expect(isIosSafari(MAC_SAFARI, 5)).toBe(true);
    expect(isIosSafari(MAC_SAFARI, 0)).toBe(false);
  });

  test("Android is never iOS", () => {
    expect(isIosSafari(ANDROID_CHROME, 5)).toBe(false);
  });
});

describe("installBannerKind", () => {
  const now = 1_000_000_000_000;
  const base = {
    smallTouchScreen: true,
    standalone: false,
    iosSafari: false,
    promptAvailable: false,
    dismissedAt: null as number | null,
    now,
    busy: false,
  };

  test("Android with an install prompt → android; iPhone Safari → ios", () => {
    expect(installBannerKind({ ...base, promptAvailable: true })).toBe("android");
    expect(installBannerKind({ ...base, iosSafari: true })).toBe("ios");
  });

  test("no install path → nothing", () => {
    expect(installBannerKind(base)).toBeNull();
  });

  test("each condition turns it off", () => {
    const ready = { ...base, promptAvailable: true };
    expect(installBannerKind({ ...ready, smallTouchScreen: false })).toBeNull();
    expect(installBannerKind({ ...ready, standalone: true })).toBeNull();
    expect(installBannerKind({ ...ready, busy: true })).toBeNull();
    expect(installBannerKind({ ...ready, dismissedAt: now - 1000 })).toBeNull();
  });

  test("Not now lasts 30 days", () => {
    const ready = { ...base, iosSafari: true };
    expect(installBannerKind({ ...ready, dismissedAt: now - INSTALL_DISMISS_MS + 1 })).toBeNull();
    expect(installBannerKind({ ...ready, dismissedAt: now - INSTALL_DISMISS_MS })).toBe("ios");
  });
});

describe("dismissal storage", () => {
  function memoryStorage(initial: Record<string, string> = {}): Storage {
    const data = new Map(Object.entries(initial));
    return {
      get length() {
        return data.size;
      },
      clear: () => data.clear(),
      getItem: (key) => data.get(key) ?? null,
      key: (index) => [...data.keys()][index] ?? null,
      removeItem: (key) => void data.delete(key),
      setItem: (key, value) => void data.set(key, String(value)),
    };
  }

  test("round-trips the time", () => {
    const storage = memoryStorage();
    expect(readDismissedAt(storage)).toBeNull();
    saveDismissedAt(1234, storage);
    expect(readDismissedAt(storage)).toBe(1234);
  });

  test("garbage reads as never dismissed", () => {
    expect(readDismissedAt(memoryStorage({ "pdf-mss-io-install-dismissed": "soon" }))).toBeNull();
  });

  test("storage that throws is ignored", () => {
    const throwing = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    } as unknown as Storage;
    expect(readDismissedAt(throwing)).toBeNull();
    expect(() => saveDismissedAt(1, throwing)).not.toThrow();
  });
});
```

Run: `npx vitest run src/lib/install-banner.test.ts`
Expected: FAIL ("Failed to resolve import").

- [ ] **Step 2: Implement the pure module**

Create `src/lib/install-banner.ts`:

```ts
/** "Not now" hides the install banner this long. */
export const INSTALL_DISMISS_MS = 30 * 24 * 60 * 60 * 1000;
const KEY = "pdf-mss-io-install-dismissed";

/** Safari on iPhone/iPod/iPad (iPads report a Mac user agent but have touch); not Chrome/Firefox/Edge on iOS. */
export function isIosSafari(userAgent: string, maxTouchPoints: number): boolean {
  const ios = /iPhone|iPod|iPad/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  return ios && /Safari\//.test(userAgent) && !/CriOS|FxiOS|EdgiOS/.test(userAgent);
}

/** Which banner to show, if any (spec section 10). */
export function installBannerKind({
  smallTouchScreen,
  standalone,
  iosSafari,
  promptAvailable,
  dismissedAt,
  now,
  busy,
}: {
  smallTouchScreen: boolean;
  standalone: boolean;
  iosSafari: boolean;
  promptAvailable: boolean;
  dismissedAt: number | null;
  now: number;
  busy: boolean;
}): "android" | "ios" | null {
  if (!smallTouchScreen || standalone || busy) return null;
  if (dismissedAt !== null && now - dismissedAt < INSTALL_DISMISS_MS) return null;
  if (promptAvailable) return "android";
  if (iosSafari) return "ios";
  return null;
}

function defaultStorage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function readDismissedAt(storage: Storage | undefined = defaultStorage()): number | null {
  try {
    const value = Number(storage?.getItem(KEY));
    return storage?.getItem(KEY) != null && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveDismissedAt(now: number, storage: Storage | undefined = defaultStorage()): void {
  try {
    storage?.setItem(KEY, String(now));
  } catch {
    // private mode or disabled storage: the banner shows again next visit
  }
}
```

Run: `npx vitest run src/lib/install-banner.test.ts`
Expected: PASS.

- [ ] **Step 3: `hasSmallTouchScreen` and the precache**

In `src/lib/limits.ts`, add above `isLikelyPhone` and use it there:

```ts
/** A small touch screen in either orientation. */
export function hasSmallTouchScreen(): boolean {
  return typeof matchMedia === "function" && PHONE_QUERIES.some((query) => matchMedia(query).matches);
}
```

and in `isLikelyPhone` replace the `smallTouchScreen` expression with `const smallTouchScreen = hasSmallTouchScreen();`.

In `vite.config.ts`, change `globPatterns` to `['**/*.{js,css,html,svg,png,ico,wasm,webmanifest,webp}']`.

- [ ] **Step 4: Hook, banner, page, route**

Create `src/lib/use-install-banner.ts`:

```ts
import { useEffect, useState, useSyncExternalStore } from "react";

import { installBannerKind, isIosSafari, readDismissedAt, saveDismissedAt } from "@/lib/install-banner";
import { hasUnsavedResult, isJobRunning, subscribeJobActivity } from "@/lib/job-activity";
import { hasSmallTouchScreen } from "@/lib/limits";

type InstallPromptEvent = Event & { prompt: () => Promise<void> };

// Captured at module load: Chrome can fire it before React mounts, and it fires only once per page.
let savedPrompt: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault(); // we show our own banner instead of the browser's mini-infobar
    savedPrompt = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    savedPrompt = null;
    notify();
  });
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

function isStandalone(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || (typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches);
}

/** Whether to offer installing the app on this phone, and the banner's actions (spec section 10). */
export function useInstallBanner() {
  const promptAvailable = useSyncExternalStore(subscribe, () => savedPrompt !== null);
  const justInstalled = useSyncExternalStore(subscribe, () => installed);
  const busy = useSyncExternalStore(subscribeJobActivity, () => isJobRunning() || hasUnsavedResult());
  const [dismissedAt, setDismissedAt] = useState(() => readDismissedAt());
  const [env] = useState(() => ({
    smallTouchScreen: hasSmallTouchScreen(),
    standalone: isStandalone(),
    iosSafari: isIosSafari(navigator.userAgent, navigator.maxTouchPoints ?? 0),
  }));
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => setNow(Date.now()), [dismissedAt]);

  const kind = justInstalled
    ? null
    : installBannerKind({ ...env, promptAvailable, dismissedAt, now, busy });

  return {
    kind,
    install: () => {
      const event = savedPrompt;
      savedPrompt = null; // usable once
      notify();
      void event?.prompt();
    },
    dismiss: () => {
      const at = Date.now();
      saveDismissedAt(at);
      setDismissedAt(at);
    },
  };
}
```

Create `src/components/InstallBanner.tsx`:

```tsx
import { Link, useLocation } from "react-router";

import { Button } from "@/components/ui/button";
import { useInstallBanner } from "@/lib/use-install-banner";

/** Phones only: offers adding the app to the home screen (spec section 10). */
export function InstallBanner() {
  const { kind, install, dismiss } = useInstallBanner();
  const { pathname } = useLocation();
  if (!kind || pathname.startsWith("/install")) return null;
  return (
    <div className="mx-auto max-w-lg px-4 pt-4 sm:px-6">
      <section
        aria-label="Install PDF Toolbox"
        className="grid gap-3 rounded-lg border bg-card p-4 text-sm text-card-foreground shadow-xs"
      >
        <p>
          <strong className="font-semibold">
            {kind === "android" ? "Install PDF Toolbox" : "Add PDF Toolbox to your Home Screen"}
          </strong>{" "}
          to open it like an app and use it offline.
        </p>
        <div className="flex gap-2">
          {kind === "android" ? (
            <Button size="sm" onClick={install}>
              Install
            </Button>
          ) : (
            <Button size="sm" asChild>
              <Link to="/install">How</Link>
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={dismiss}>
            Not now
          </Button>
        </div>
      </section>
    </div>
  );
}
```

Create `src/pages/InstallPage.tsx`:

```tsx
import { Link, useParams } from "react-router";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    text: <>In Safari, tap the menu button at the left of the address bar.</>,
    note: "On older iPhones the Share button is at the bottom of the screen.",
    image: "/install/ios-1-menu.webp",
    alt: "Safari showing PDF Toolbox at pdf.mss.io, with the menu button at the left of the address bar circled.",
  },
  {
    text: <>Tap <strong>Share</strong>.</>,
    image: "/install/ios-2-share.webp",
    alt: "Safari's menu open over the page, with Share circled.",
  },
  {
    text: <>Scroll down and tap <strong>Add to Home Screen</strong>.</>,
    image: "/install/ios-3-add-to-home-screen.webp",
    alt: "The share sheet scrolled down, with Add to Home Screen circled at the bottom.",
  },
  {
    text: <>Keep <strong>Open as Web App</strong> on and tap <strong>Add</strong>.</>,
    image: "/install/ios-4-add.webp",
    alt: "The Add to Home Screen screen for PDF Toolbox at pdf.mss.io, with the Add button circled.",
  },
  {
    text: (
      <>
        Open <strong>PDF Toolbox</strong> from your Home Screen. Keep it open while online until the footer says{" "}
        <strong>Ready offline</strong>.
      </>
    ),
    image: "/install/ios-5-home-screen.webp",
    alt: "The Home Screen with the PDF Toolbox icon circled.",
  },
];

/** /install/:step — how to add the app to an iPhone's Home Screen, one step per page. */
export function Component() {
  const { step } = useParams();
  const parsed = Number(step);
  const number = Number.isInteger(parsed) && parsed >= 1 && parsed <= STEPS.length ? parsed : 1;
  const current = STEPS[number - 1];
  const last = number === STEPS.length;

  return (
    <div className="mx-auto max-w-lg px-4 py-6 sm:px-6 sm:py-10">
      <Card>
        <CardHeader>
          <CardTitle>
            <h1>Add PDF Toolbox to your Home Screen</h1>
          </CardTitle>
          <CardDescription>
            Step {number} of {STEPS.length}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-sm">{current.text}</p>
          {current.note ? <p className="text-xs text-muted-foreground">{current.note}</p> : null}
          {/* A phone-shaped frame so the screenshot reads as a whole iPhone screen. */}
          <div className="mx-auto w-fit rounded-[2.25rem] border-4 border-foreground bg-foreground p-1 shadow-md">
            <img
              src={current.image}
              alt={current.alt}
              width={600}
              height={1304}
              className="block h-auto max-h-[60svh] w-auto rounded-[1.9rem]"
            />
          </div>
          <ol aria-label="Steps" className="flex justify-center gap-2">
            {STEPS.map((_, index) => (
              <li key={index}>
                <Link
                  to={`/install/${index + 1}`}
                  aria-label={`Step ${index + 1}`}
                  aria-current={index + 1 === number ? "step" : undefined}
                  className={cn(
                    "block size-2.5 rounded-full bg-muted-foreground/30",
                    index + 1 === number && "bg-foreground",
                  )}
                />
              </li>
            ))}
          </ol>
          <div className="flex justify-between gap-2">
            {number > 1 ? (
              <Button variant="outline" asChild>
                <Link to={`/install/${number - 1}`}>Back</Link>
              </Button>
            ) : (
              <span />
            )}
            <Button asChild>
              <Link to={last ? "/" : `/install/${number + 1}`}>{last ? "Done" : "Next"}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

In `src/router.ts`, add before the `/offline` route: `{ path: "/install/:step?", lazy: () => import("@/pages/InstallPage") },`.

In `src/components/AppShell.tsx`, import `InstallBanner` and render `<InstallBanner />` as the first child of `<main>`, before `<CrashNotice />`.

- [ ] **Step 5: E2E**

Create `e2e/install.spec.ts`:

```ts
import { devices, expect, test, type Page } from "@playwright/test";

import { chooseFiles, spaceOutProgress } from "./helpers";

const banner = (page: Page) => page.getByRole("region", { name: "Install PDF Toolbox" });

/** Dispatches a fake beforeinstallprompt whose prompt() is counted in window.__prompted. */
async function offerInstall(page: Page) {
  await page.evaluate(() => {
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt: async () => {
        (window as unknown as { __prompted: number }).__prompted =
          ((window as unknown as { __prompted?: number }).__prompted ?? 0) + 1;
      },
    });
    window.dispatchEvent(event);
  });
}

test.describe("on an iPhone", () => {
  const { userAgent, viewport, deviceScaleFactor, isMobile, hasTouch } = devices["iPhone 15"];
  test.use({ userAgent, viewport, deviceScaleFactor, isMobile, hasTouch });

  test("How walks through five step pages with full screenshots", async ({ page }) => {
    await page.goto("/");
    await expect(banner(page)).toContainText("Add PDF Toolbox to your Home Screen");
    await banner(page).getByRole("link", { name: "How" }).click();
    await expect(page.getByRole("heading", { name: "Add PDF Toolbox to your Home Screen" })).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
    for (let step = 1; step <= 5; step++) {
      await expect(page.getByText(`Step ${step} of 5`)).toBeVisible();
      const shot = page.locator("main img");
      await expect(shot).toHaveJSProperty("complete", true);
      expect(await shot.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
      await expect(shot).toBeInViewport({ ratio: 1 }); // the whole phone fits on screen
      await expect(page.getByRole("link", { name: `Step ${step}` })).toHaveAttribute("aria-current", "step");
      if (step < 5) await page.getByRole("link", { name: "Next" }).click();
    }
    await page.getByRole("link", { name: "Back" }).click();
    await expect(page.getByText("Step 4 of 5")).toBeVisible();
    await page.goBack();
    await expect(page.getByText("Step 5 of 5")).toBeVisible();
    await page.getByRole("link", { name: "Done" }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/install/9");
    await expect(page.getByText("Step 1 of 5")).toBeVisible();
    await expect(page.getByRole("link", { name: "Back" })).toHaveCount(0);
  });

  test("Not now hides the banner, also after a reload", async ({ page }) => {
    await page.goto("/");
    await banner(page).getByRole("button", { name: "Not now" }).click();
    await expect(banner(page)).toHaveCount(0);
    await page.reload();
    await expect(page.locator("main h1")).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
  });

  test("the installed app shows no banner", async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "standalone", { get: () => true }));
    await page.goto("/");
    await expect(page.locator("main h1")).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
  });

  test("no banner while a job runs", async ({ page }) => {
    await spaceOutProgress(page, { gapMs: 50 });
    await page.goto("/compress");
    await expect(banner(page)).toBeVisible();
    await chooseFiles(page, "twenty-mb.pdf");
    await page.getByRole("button", { name: "Compress", exact: true }).click();
    await expect(page.getByRole("progressbar")).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
  });
});

test.describe("on an Android phone", () => {
  test.use({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true });

  test("Install opens the browser's install dialog once", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("main h1")).toBeVisible();
    await expect(banner(page)).toHaveCount(0); // no install path until the browser offers one
    await offerInstall(page);
    await banner(page).getByRole("button", { name: "Install" }).click();
    expect(await page.evaluate(() => (window as unknown as { __prompted?: number }).__prompted)).toBe(1);
    await expect(banner(page)).toHaveCount(0);
  });
});

test("desktop never shows the banner, even when the browser offers to install", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("main h1")).toBeVisible();
  await offerInstall(page);
  await expect(banner(page)).toHaveCount(0);
});
```

In `e2e/offline.spec.ts`, after the `/offline` assertions add:

```ts
  await page.goto(`${origin}/install/3`);
  const shot = page.locator("main img");
  await expect(shot).toBeVisible();
  expect(await shot.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
```

Run: `npm run test:e2e -- e2e/install.spec.ts e2e/offline.spec.ts`
Expected: PASS. Then prove the desktop test can fail: temporarily make `installBannerKind` ignore `smallTouchScreen`. "desktop never shows…" must FAIL. Revert.

- [ ] **Step 6: Docs**

- `AGENTS.md` Map: `src/lib/install-banner.ts` (pure: who sees the install banner), `src/lib/use-install-banner.ts` (captures beforeinstallprompt), `src/components/InstallBanner.tsx`, `src/pages/InstallPage.tsx` (/install/:step, one step per page, screenshots in `public/install/`). PWA notes: `webp` is precached; the screenshots must never show personal details (crop the status bar, contacts, other apps; the address must read `pdf.mss.io`).
- `CHANGELOG.md` 1.1.0 → Added: `- On phones, a banner offers to add PDF Toolbox to the home screen: an Install button on Android, step-by-step screenshots on iPhone.`
- `docs/todo.md`: automated row `| Install banner: iPhone → How walks five step pages with full screenshots (Back/Next/Done, browser back), Not now remembered; Android → Install prompts once; none on desktop, in the installed app or during a job | \`e2e/install.spec.ts\` |`; owner box `- [ ] iPhone Safari (not installed): the banner shows; How's steps match what Safari shows; once added, the app shows no banner.`

- [ ] **Step 7: Full check, commit, push**

```bash
npm run lint && npm test && npm run build && npm run test:e2e
git add src/lib/limits.ts vite.config.ts src/lib/install-banner.ts src/lib/install-banner.test.ts src/lib/use-install-banner.ts src/components/InstallBanner.tsx src/pages/InstallPage.tsx src/router.ts src/components/AppShell.tsx e2e/install.spec.ts e2e/offline.spec.ts AGENTS.md CHANGELOG.md docs/todo.md
git commit -m "feat: install banner on phones; /install steps with screenshots"
git push
```
