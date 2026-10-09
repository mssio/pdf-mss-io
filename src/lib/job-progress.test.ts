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
