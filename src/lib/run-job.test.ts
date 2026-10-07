import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { EngineLoadTimeoutError, runWithTimeLimits } from "@/lib/run-job";
import { JobTimeoutError } from "@/lib/qpdf";

const never = () => new Promise<never>(() => {});

describe("runWithTimeLimits", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("returns the job's result and leaves no timers behind", async () => {
    const onRun = vi.fn();
    const result = runWithTimeLimits({
      load: async () => "engine",
      job: async (engine) => `${engine} done`,
      loadMs: 1000,
      jobMs: 1000,
      onRun,
    });
    await expect(result).resolves.toBe("engine done");
    expect(onRun).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("an engine that never loads fails with EngineLoadTimeoutError after the load limit", async () => {
    const job = vi.fn();
    const result = runWithTimeLimits({ load: never, job, loadMs: 1000, jobMs: 5000, onRun: vi.fn() });
    const assertion = expect(result).rejects.toBeInstanceOf(EngineLoadTimeoutError);
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(job).not.toHaveBeenCalled();
  });

  test("an engine that loads after the load limit never starts the job", async () => {
    let finishLoad: (engine: string) => void = () => {};
    const load = () => new Promise<string>((resolve) => (finishLoad = resolve));
    const job = vi.fn(async () => "late");
    const onRun = vi.fn();
    const result = runWithTimeLimits({ load, job, loadMs: 1000, jobMs: 5000, onRun });
    const assertion = expect(result).rejects.toBeInstanceOf(EngineLoadTimeoutError);
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    finishLoad("engine");
    await vi.advanceTimersByTimeAsync(0);
    expect(job).not.toHaveBeenCalled();
    expect(onRun).not.toHaveBeenCalled();
  });

  test("a job that never answers fails with JobTimeoutError after the job limit, counted from the run phase", async () => {
    let loaded: (engine: string) => void = () => {};
    const load = () => new Promise<string>((resolve) => (loaded = resolve));
    const result = runWithTimeLimits({ load, job: never, loadMs: 1000, jobMs: 5000, onRun: vi.fn() });
    let settled = false;
    result.catch(() => (settled = true));
    await vi.advanceTimersByTimeAsync(900); // slow load, still within its own limit
    loaded("engine");
    await vi.advanceTimersByTimeAsync(4999);
    expect(settled).toBe(false); // the job's 5 s started only after the engine loaded
    const assertion = expect(result).rejects.toBeInstanceOf(JobTimeoutError);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
  });

  test("a job failing after its time limit doesn't surface as an unhandled rejection", async () => {
    let fail: (error: Error) => void = () => {};
    const job = () => new Promise<never>((_, reject) => (fail = reject));
    const result = runWithTimeLimits({ load: async () => "engine", job, loadMs: 1000, jobMs: 1000, onRun: vi.fn() });
    const assertion = expect(result).rejects.toBeInstanceOf(JobTimeoutError);
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    fail(new Error("terminated")); // would be an unhandled rejection without the guard
    await vi.advanceTimersByTimeAsync(0);
  });
});
